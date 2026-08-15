import type jsPDF from "jspdf";

/**
 * The invisible text layer that makes an exported CV readable as text.
 *
 * The pages go into the PDF as images — html2canvas rasterises them, which is
 * what preserves the design exactly. The cost was that the file contained no
 * text at all: measured on a real export, two image XObjects and *zero*
 * text-showing operators. Nothing in it could be selected, searched, or
 * extracted.
 *
 * That is a worse problem than it sounds, and not mainly a convenience one. A CV
 * is usually read first by an applicant tracking system, which parses the text
 * layer; a raster-only PDF parses as an empty document. The same absence is why
 * cvitae could not re-import its own export — `extract_cv` refuses it as a scan.
 *
 * So the drawn page stays a picture and the words are written over it in
 * `renderingMode: 'invisible'`, which is how a searchable scan works. Nothing
 * about the visual output changes; the glyphs are never painted. What changes is
 * that the file now says what it says.
 */

/** Text is placed per line, in the rectangle the browser laid that line out in. */
type Line = { text: string; left: number; top: number; width: number; height: number };

/**
 * Skipped for the same reason `prepareCloneForExport` hides them: they are not
 * in the picture. Writing their text into the layer would put "+ Add" and every
 * placeholder hint into a document that does not show them — and into whatever
 * an ATS reads.
 */
const EXCLUDED = '[class~="print:hidden"], [data-cv-hint]';

const isExcluded = (node: Text): boolean =>
  node.parentElement?.closest(EXCLUDED) != null;

/**
 * Splits one text node into its laid-out lines.
 *
 * `getClientRects()` gives the boxes but not which characters fell in each, so
 * the offsets are recovered by binary search: for each line box, find the last
 * character whose rectangle still starts at that line's top. Binary search
 * rather than a walk because a walk means one `getBoundingClientRect` per
 * character, and a full CV runs to several thousand of them.
 */
const linesOf = (node: Text): Line[] => {
  const text = node.data;
  if (!text.trim()) return [];

  const range = document.createRange();
  range.selectNodeContents(node);

  const boxes = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0
  );
  if (boxes.length === 0) return [];

  if (boxes.length === 1) {
    const [box] = boxes;
    return [{ text, left: box.left, top: box.top, width: box.width, height: box.height }];
  }

  // Where each line box begins vertically, in the order they were laid out.
  const tops = [...new Set(boxes.map((box) => Math.round(box.top)))].sort((a, b) => a - b);

  const topAt = (offset: number): number => {
    range.setStart(node, offset);
    range.setEnd(node, Math.min(offset + 1, text.length));
    return Math.round(range.getBoundingClientRect().top);
  };

  const lines: Line[] = [];
  let start = 0;

  for (let i = 0; i < tops.length; i++) {
    const top = tops[i];
    let end: number;

    if (i === tops.length - 1) {
      end = text.length;
    } else {
      // Last offset still on this line.
      let low = start;
      let high = text.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (topAt(mid) <= top) low = mid;
        else high = mid - 1;
      }
      end = low + 1;
    }

    const slice = text.slice(start, end);

    if (slice.trim()) {
      const box = boxes.find((candidate) => Math.round(candidate.top) === top);
      if (box) {
        lines.push({
          text: slice,
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
        });
      }
    }

    start = end;
    if (start >= text.length) break;
  }

  return lines;
};

/**
 * Lays the words of one page over the image already placed for it.
 *
 * Sized to fit rather than to match. The embedded font is DejaVu Sans, and the
 * CV is set in Myriad Pro — so a line set at the same point size comes out
 * wider, and the selection highlight would run past the words it belongs to.
 * Scaling each line to the width the browser actually gave it costs nothing,
 * because none of these glyphs are drawn.
 */
export const addTextLayer = (
  pdf: jsPDF,
  page: HTMLElement,
  pxToMm: (px: number) => number,
  fontName: string
): number => {
  const pageRect = page.getBoundingClientRect();
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);

  pdf.setFont(fontName, "normal");
  pdf.setTextColor(0, 0, 0);

  let placed = 0;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (!text.data.trim() || isExcluded(text)) continue;

    for (const line of linesOf(text)) {
      const content = line.text.trim();
      if (!content) continue;

      const heightMm = pxToMm(line.height);
      const widthMm = pxToMm(line.width);

      // A line box is taller than its glyphs; 0.72 of it lands close to the cap
      // height for the sizes this document uses.
      let size = heightMm * 0.72 * (72 / 25.4);
      pdf.setFontSize(size);

      const natural = pdf.getTextWidth(content);
      if (natural > 0 && widthMm > 0) {
        size *= widthMm / natural;
        pdf.setFontSize(size);
      }

      pdf.text(
        content,
        pxToMm(line.left - pageRect.left),
        // Placed on the baseline, approximated from the bottom of the line box.
        pxToMm(line.top - pageRect.top + line.height * 0.8),
        { renderingMode: "invisible", baseline: "alphabetic" }
      );

      placed += 1;
    }
  }

  return placed;
};

/**
 * The font, fetched once and kept for the life of the page.
 *
 * DejaVu Sans rather than the CV's own Myriad Pro, for two reasons that both
 * had to be measured. jsPDF cannot read WOFF or WOFF2, which is all this repo
 * ships; and its built-in fonts are Latin-1, so Polish came back out of a test
 * export as `Beń → BeD` and `Zaprojektowałem → ZaprojektowaBem`. DejaVu covers
 * Latin Extended-A and the dashes the dates use, and a round trip through the
 * runtime's own PDF reader returned all four test lines byte for byte.
 *
 * Fetched lazily, because it is 739KB and most visits never export anything.
 * jsPDF subsets what it embeds, so the file that reaches the reader grows by
 * roughly 144KB, not by the whole font.
 */
const FONT_URL = "/fonts/DejaVuSans.ttf";
const FONT_FILE = "DejaVuSans.ttf";
export const TEXT_LAYER_FONT = "DejaVuSans";

let fontPromise: Promise<string> | null = null;

const fetchFontBase64 = async (): Promise<string> => {
  const response = await fetch(FONT_URL);
  if (!response.ok) throw new Error(`${FONT_URL} returned HTTP ${response.status}`);

  const bytes = new Uint8Array(await response.arrayBuffer());

  // Chunked: `String.fromCharCode(...bytes)` on 739KB overflows the argument
  // limit and throws a RangeError rather than producing a wrong answer.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }

  return btoa(binary);
};

/**
 * Registers the font on this document, returning false if it could not be had.
 *
 * A failure here must not fail the export. The text layer is an improvement to
 * a PDF that was usable without it, and losing the whole download because a
 * font did not load would trade a real problem for a worse one.
 */
export const registerTextLayerFont = async (pdf: jsPDF): Promise<boolean> => {
  try {
    if (!fontPromise) fontPromise = fetchFontBase64();
    const base64 = await fontPromise;

    pdf.addFileToVFS(FONT_FILE, base64);
    pdf.addFont(FONT_FILE, TEXT_LAYER_FONT, "normal");
    return true;
  } catch (error) {
    // Reset so a later export tries again rather than caching the failure.
    fontPromise = null;
    console.warn(
      "The PDF text layer was skipped: its font could not be loaded.",
      error
    );
    return false;
  }
};
