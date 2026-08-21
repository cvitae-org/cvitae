"use client";

import { useState, useCallback } from "react";
import { useTranslations } from 'next-intl';
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { A4_DIMENSIONS } from "../constants";
import {
  addTextLayer,
  collectTextLines,
  registerTextLayerFont,
  TEXT_LAYER_FONT,
  type TextLine,
} from "../utils/pdfTextLayer";
import { preflightPdf } from '../pdf/preflight';
import { saveBlob } from '../pdf/atsPdf';

interface UsePDFGeneratorOptions {
  filename?: string;
  quality?: number; // 1-3, higher = better quality but larger file
  /** The exact designed preview to capture; prevents decoy roots joining a file. */
  previewId: string;
}

interface UsePDFGeneratorReturn {
  generatePDF: () => Promise<void>;
  isGenerating: boolean;
  error: { text: string; detail?: string } | null;
  warnings: string[];
  progress: number; // 0-100
}

const PDF_WIDTH_MM = 210;
const PDF_HEIGHT_MM = 297;

/**
 * A page is rasterised at its CSS width and placed across the full A4 width, so
 * one factor converts both axes — `A4_DIMENSIONS` is A4 at 96 DPI and keeps the
 * aspect ratio (794×1123px against 210×297mm, within a twentieth of a
 * millimetre).
 */
const pxToMm = (px: number) => (px * PDF_WIDTH_MM) / A4_DIMENSIONS.width;

/**
 * The bullet dash sits lower in the export than on screen.
 *
 * An empirical offset inherited from before the CV became editable, not a
 * derived one: html2canvas places the dash higher against the first line of text
 * than the browser does, and 17px is where the two agree. Applied only to the
 * clone, so the on-screen 7px is what stays measured and paginated.
 */
const BULLET_EXPORT_PADDING_TOP = "17px";

/** How long to let a just-committed edit reach the paginated tree. */
const SETTLE_MS = 200;

/**
 * Turns a stored address into something a PDF viewer will open.
 *
 * The links are typed by hand into a text field, so they arrive as people write
 * them — `github.com/you`, not `https://github.com/you`. A link annotation with
 * no scheme is not followed by any viewer, and the pre-migration header applied
 * the same `https://` prefix for the same reason.
 */
const absoluteUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

/**
 * Waits for a pending edit to reach the page that is about to be captured.
 *
 * Committing a field writes the store, which re-renders the measurement tree,
 * which re-measures on the next frame, which re-registers, which repaginates.
 * html2canvas reads the DOM as it finds it, so capturing straight after a blur
 * would export the CV as it was before the last thing typed into it. That chain
 * is two or three frames; 200ms is comfortably more, and it is paid once per
 * export.
 *
 * A timer rather than `requestAnimationFrame`, which would read as the more
 * precise way to wait for a frame and would hang instead: a background tab is
 * never painted, so no frame is ever requested, and clicking download and
 * switching away would leave the export waiting for one indefinitely. The rest
 * of the capture has no such dependency.
 */
const settle = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, SETTLE_MS);
  });

/** Known, already-localized failures raised by this hook itself. */
class PdfGenerationError extends Error {}

const waitForPreviewAssets = async (root: HTMLElement, canvasError: string) => {
  if (document.fonts?.ready) await document.fonts.ready;
  await Promise.all(
    Array.from(root.querySelectorAll('img')).map(async (image) => {
      if (image.complete && image.naturalWidth > 0) return;
      await image.decode();
    })
  );
  const invalidCanvas = Array.from(root.querySelectorAll('canvas')).find(
    (canvas) => canvas.width === 0 || canvas.height === 0
  );
  if (invalidCanvas) throw new PdfGenerationError(canvasError);
};

const pageSignature = (root: HTMLElement): string =>
  Array.from(root.querySelectorAll<HTMLElement>('[data-page]'))
    .map((page) => `${page.dataset.page}:${page.innerText.length}`)
    .join('|');

/** A link annotation, in the millimetre space of one PDF page. */
type LinkAnnotation = {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** What one page's clone gives up before it is rasterised. */
type PageOverlay = { links: LinkAnnotation[]; lines: TextLine[] };

/**
 * Makes html2canvas's clone look like the printed page, and reads the links and
 * the words off it on the way past.
 *
 * html2canvas rasterises the screen rendering, so `@media print` never applies
 * and every control marked `print:hidden` would otherwise be in the file — most
 * visibly the section-level "+ Add", which has no hover state to hide behind.
 * Hint placeholders go too, for the reason given on `data-cv-hint`.
 *
 * It runs on the clone rather than on the live DOM, which is what the old
 * version mutated and then restored in a `finally`. The live measurement tree is
 * watched by a ResizeObserver that repaginates on any size change, so styling it
 * mid-capture would rebuild the very nodes being read.
 *
 * Controls collapse and hints only go invisible, which is not an inconsistency.
 * A collapsed control gives its space back — without that, the rule down the
 * left of each job's bullets keeps the height of the hidden "add a bullet" row
 * and overhangs the last bullet by a line. A hint sits inline in a row of other
 * text, where collapsing it would close the gaps around it instead.
 *
 * Nothing here can overflow a page: every item was already assigned to one, and
 * all of this only ever makes a page's content shorter.
 */
const prepareCloneForExport = (page: HTMLElement): PageOverlay => {
  page.querySelectorAll<HTMLElement>('[class~="print:hidden"]').forEach(
    (element) => {
      element.style.display = "none";
    }
  );

  page.querySelectorAll<HTMLElement>("[data-cv-hint]").forEach((element) => {
    element.style.visibility = "hidden";
  });

  page.querySelectorAll<HTMLElement>("[data-cv-bullet]").forEach((element) => {
    element.style.paddingTop = BULLET_EXPORT_PADDING_TOP;
  });

  /**
   * The page arrives in the PDF as a raster, so an anchor in the DOM is just
   * pixels by the time it lands, and so is every word. jsPDF's link annotations
   * and the invisible text layer are the way back: rectangles and strings, laid
   * over what was drawn.
   *
   * Measured here, last, in the tree that is about to be rasterised rather than
   * on the live page — the collapsing above moves everything below it, and a
   * rectangle taken from the live page would then sit lower than the text it
   * names by however much was removed above it.
   */
  const pageRect = page.getBoundingClientRect();
  const annotations: LinkAnnotation[] = [];

  page.querySelectorAll<HTMLElement>("[data-cv-link]").forEach((element) => {
    const url = absoluteUrl(element.dataset.cvLink ?? "");
    if (!url) return;

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    annotations.push({
      url,
      x: pxToMm(rect.left - pageRect.left),
      y: pxToMm(rect.top - pageRect.top),
      width: pxToMm(rect.width),
      height: pxToMm(rect.height),
    });
  });

  return { links: annotations, lines: collectTextLines(page) };
};

/**
 * Hook for generating PDF from CV using html2canvas + jsPDF.
 *
 * Usage:
 * const { generatePDF, isGenerating } = usePDFGenerator();
 * <button onClick={generatePDF} disabled={isGenerating}>Download PDF</button>
 */
export function usePDFGenerator(
  options: UsePDFGeneratorOptions
): UsePDFGeneratorReturn {
  const t = useTranslations('cv.pdf');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<{
    text: string;
    detail?: string;
  } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);

  const {
    filename = "CV_Designed.pdf",
    quality = 2, // 2x scale for good quality
    previewId,
  } = options;

  const generatePDF = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    setWarnings([]);
    setProgress(0);

    try {
      // A field being edited commits on blur, and a focused field draws a focus
      // ring that html2canvas has no reason not to rasterise. Both are settled
      // before anything is read.
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      await settle();

      const root = Array.from(
        document.querySelectorAll<HTMLElement>('[data-cv-preview-root]')
      ).find((element) => element.dataset.cvPreviewRoot === previewId);
      if (!root) throw new PdfGenerationError(t('previewMissing'));
      await waitForPreviewAssets(root, t('canvasNotReady'));
      const firstSignature = pageSignature(root);
      await settle();
      if (!firstSignature || firstSignature !== pageSignature(root)) {
        throw new PdfGenerationError(t('paginationChanging'));
      }

      const pages = Array.from(
        root.querySelectorAll<HTMLElement>("[data-page]")
      );
      const logicalHeadings = Array.from(root.querySelectorAll('h2'))
        .map((heading) => heading.textContent?.trim() ?? '')
        .filter(Boolean);

      if (pages.length === 0) {
        throw new PdfGenerationError(t('noPages'));
      }

      setProgress(10);

      // Create PDF document (A4 dimensions in mm)
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      // Awaited before the first page so every page gets the same treatment;
      // false means the font could not be loaded and the pages go out as images
      // alone, exactly as they did before this existed.
      const hasFont = await registerTextLayerFont(pdf);
      if (!hasFont) {
        throw new PdfGenerationError(t('textFontFailed'));
      }

      const allLines: TextLine[] = [];
      const allLinks: string[] = [];

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];

        setProgress(10 + (i / pages.length) * 80); // 10-90%

        let overlay: PageOverlay = { links: [], lines: [] };

        // Render page to canvas with high quality
        const canvas = await html2canvas(page, {
          scale: quality,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
          windowWidth: A4_DIMENSIONS.width,
          windowHeight: A4_DIMENSIONS.height,
          onclone: (_clonedDocument, clonedPage) => {
            overlay = prepareCloneForExport(clonedPage);
          },
        });

        // Convert canvas to image
        const imgData = canvas.toDataURL("image/png");

        // Add new page if not first
        if (i > 0) {
          pdf.addPage();
        }

        // Add image to PDF
        pdf.addImage(imgData, "PNG", 0, 0, PDF_WIDTH_MM, PDF_HEIGHT_MM, undefined, "FAST");

        // Both go on after the image, so they sit over what they describe, and
        // both were read off the clone this image was drawn from — the only
        // tree whose geometry is the geometry in the picture.
        if (hasFont) {
          addTextLayer(pdf, overlay.lines, pxToMm, TEXT_LAYER_FONT);
        }
        allLines.push(...overlay.lines);

        overlay.links.forEach(({ url, x, y, width, height }) => {
          pdf.link(x, y, width, height, { url });
          allLinks.push(url);
        });
      }

      setProgress(95);

      const blob = pdf.output('blob');
      const result = await preflightPdf(blob, {
        expectedText: allLines.map((line) => line.text).join('\n'),
        expectedLinks: allLinks,
        logicalHeadings,
        ignoredRecoveryText: allLines
          .filter((line) => line.recoveryOptional)
          .map((line) => line.text),
        outputLabel: t('designedOutput')
      });
      if (!result.ok) {
        throw new PdfGenerationError(
          t('preflightFailed', { issues: result.issues
            .filter((issue) => issue.severity === 'block')
            .map((issue) => t(`issues.${issue.code}`, issue.values))
            .join(' ') })
        );
      }
      setWarnings(
        result.issues
          .filter((issue) => issue.severity === 'warning')
          .map((issue) => t(`issues.${issue.code}`, issue.values))
      );
      saveBlob(blob, filename);

      setProgress(100);

      // Reset after short delay
      setTimeout(() => {
        setProgress(0);
      }, 1000);

    } catch (err) {
      setError({
        text:
          err instanceof PdfGenerationError
            ? err.message
            : t('generationFailed'),
        detail:
          err instanceof Error && !(err instanceof PdfGenerationError)
            ? err.message
            : undefined
      });
      console.error("PDF generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  }, [filename, previewId, quality, t]);

  return {
    generatePDF,
    isGenerating,
    error,
    warnings,
    progress,
  };
}
