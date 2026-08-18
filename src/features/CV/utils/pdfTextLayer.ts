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
 * One line, ready to be written, in pixels relative to the page it belongs to.
 *
 * Collected and written in two steps because the two happen in different trees.
 * The words have to be measured in html2canvas's clone — the tree that is
 * actually rasterised — and that tree only exists inside `onclone`; the writing
 * happens afterwards, against a jsPDF page that does not exist yet at that
 * point. See `collectTextLines`.
 */
export type TextLine = {
  text: string;
  left: number;
  width: number;
  /** Where html2canvas put the glyphs' baseline, not where the browser put it. */
  baseline: number;
  /** The size the text is drawn at, so the invisible copy can match it. */
  fontSize: number;
  /** Long URL text is covered by an independently checked link annotation. */
  recoveryOptional: boolean;
};

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

  // The node's own document, not this one: these are measured in html2canvas's
  // clone, which lives in an iframe, and a Range belongs to the document that
  // created it.
  const range = node.ownerDocument.createRange();
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
 * Where html2canvas puts a baseline, which is not where the browser puts it.
 *
 * This is html2canvas's own `FontMetrics.parseMetrics`, reproduced: it renders
 * an inline image at `vertical-align: baseline` beside a sample of the font and
 * takes the difference in offsets. Every text run it draws lands at
 * `bounds.top + baseline`, so this is the authority on where the glyphs in the
 * picture actually sit.
 *
 * Reproduced rather than approximated because the two answers differ by most of
 * a line. Measured on this CV: the browser's own baseline for a 12px bullet is
 * 570.6px down the page and html2canvas draws it at 578.0 — so a text layer
 * placed by the browser's typography sits 7–9px above the words it is supposed
 * to be over, and selecting a line in the exported PDF highlights the one above
 * it. The same 8-ish pixels are why `BULLET_EXPORT_PADDING_TOP` exists.
 *
 * Note the container is deliberately left at `line-height: normal`: the metric
 * is a property of the font at a size, not of the box the text ended up in,
 * which is why one number covers 11px and 12px text alike. Cached because it
 * costs a synchronous layout and a CV has a handful of distinct fonts.
 */

/** Both verbatim from html2canvas, which is the point: same inputs, same answer. */
const SAMPLE_TEXT = "Hidden Text";
const SMALL_IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const baselines = new Map<string, number>();

const baselineOffset = (fontFamily: string, fontSize: string): number => {
  const key = `${fontFamily} ${fontSize}`;
  const cached = baselines.get(key);
  if (cached !== undefined) return cached;

  // Measured in this document rather than the clone's, because that is where
  // html2canvas measures it — `new FontMetrics(document)` in its renderer,
  // which runs in this window.
  const container = document.createElement("div");
  const image = document.createElement("img");
  const span = document.createElement("span");

  container.style.visibility = "hidden";
  container.style.fontFamily = fontFamily;
  container.style.fontSize = fontSize;
  container.style.margin = "0";
  container.style.padding = "0";
  container.style.whiteSpace = "nowrap";
  document.body.appendChild(container);

  image.src = SMALL_IMAGE;
  image.width = 1;
  image.height = 1;
  image.style.margin = "0";
  image.style.padding = "0";
  image.style.verticalAlign = "baseline";

  span.style.fontFamily = fontFamily;
  span.style.fontSize = fontSize;
  span.style.margin = "0";
  span.style.padding = "0";
  span.appendChild(document.createTextNode(SAMPLE_TEXT));

  container.appendChild(span);
  container.appendChild(image);

  const baseline = image.offsetTop - span.offsetTop + 2;

  document.body.removeChild(container);
  baselines.set(key, baseline);

  return baseline;
};

/**
 * Reads the words off the tree that is about to be rasterised.
 *
 * Must run inside `onclone`, after `prepareCloneForExport` — and on the clone
 * rather than on the live page, which is what it used to do. The link
 * annotations were moved for this reason already and the text was left behind:
 * hiding a control gives its space back, so anything sharing a row with one
 * slides across in the picture and nowhere else. Measured on this CV, the dates
 * sat 50px right of their invisible copies, because the "Remove" beside them
 * collapses; a section's "+ Add" does the same thing vertically to everything
 * below it.
 */
export const collectTextLines = (page: HTMLElement): TextLine[] => {
  const pageRect = page.getBoundingClientRect();
  const view = page.ownerDocument.defaultView ?? window;
  const walker = page.ownerDocument.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  const lines: TextLine[] = [];

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (!text.data.trim() || isExcluded(text)) continue;

    const parent = text.parentElement;
    if (!parent) continue;

    const style = view.getComputedStyle(parent);
    const offset = baselineOffset(style.fontFamily, style.fontSize);
    const fontSize = parseFloat(style.fontSize);
    const linkedElement = parent.closest<HTMLElement>('[data-cv-link]');
    const linkTarget = linkedElement?.dataset.cvLink?.trim() ?? '';
    // mailto/tel values remain part of prose recovery because ATS contact-field
    // parsing depends on their text. Long web URLs are checked as annotations;
    // extractors are allowed to disagree only about their wrap boundaries.
    const recoveryOptional =
      Boolean(linkTarget) && !/^(?:mailto|tel):/i.test(linkTarget);

    for (const line of linesOf(text)) {
      const content = line.text.trim();
      if (!content) continue;

      lines.push({
        text: content,
        left: line.left - pageRect.left,
        width: line.width,
        baseline: line.top - pageRect.top + offset,
        fontSize,
        recoveryOptional
      });
    }
  }

  return lines;
};

/**
 * Lays the words of one page over the image already placed for it.
 *
 * Set at the size the page is set at, and stretched to the width the browser
 * gave the line. The embedded font is DejaVu Sans and the CV is Myriad Pro, so
 * the same string at the same size comes out a different width — and a
 * selection highlight is drawn from the glyphs, so a line that is too wide
 * highlights past its last word and one that is too narrow stops short.
 *
 * Horizontal scaling preserves the PDF string's real word boundaries. Character
 * spacing used to match the rectangle too, but PDF.js can infer a new word when
 * tracked headings have a large glyph gap ("EDU CATION"). That made a fully
 * present short CV fail meaningful-token recovery. Scaling keeps the baseline,
 * height, and final width aligned without teaching extractors false spaces.
 */
export const addTextLayer = (
  pdf: jsPDF,
  lines: TextLine[],
  pxToMm: (px: number) => number,
  fontName: string
): number => {
  pdf.setFont(fontName, "normal");
  pdf.setTextColor(0, 0, 0);

  let placed = 0;

  for (const line of lines) {
    const widthMm = pxToMm(line.width);
    pdf.setFontSize(pxToMm(line.fontSize) * (72 / 25.4));

    const natural = pdf.getTextWidth(line.text);

    const horizontalScale =
      natural > 0 && widthMm > 0 ? widthMm / natural : 1;

    pdf.text(line.text, pxToMm(line.left), pxToMm(line.baseline), {
      renderingMode: "invisible",
      baseline: "alphabetic",
      horizontalScale
    });

    placed += 1;
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
 * The designed exporter now treats false as a hard preflight failure: a visual
 * PDF without this layer is not a usable CV upload and must never be emitted
 * silently as an image-only fallback.
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
