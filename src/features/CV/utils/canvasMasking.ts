/**
 * Canvas-based image masking utilities.
 * Applies SVG masks to images programmatically using Canvas API.
 * 
 * The canvas dimensions match the mask SVG's aspect ratio (1:1),
 * ensuring the mask shape is not distorted. The portrait image is
 * drawn with object-fit: cover behavior to fill the mask shape.
 */

interface ApplyMaskToCanvasOptions {
  canvas: HTMLCanvasElement;
  imageSrc: string;
  maskSrc: string;
  scale?: number; // Resolution multiplier (default: 3 for high quality)
  size?: number;  // Base width in pixels (height calculated from mask aspect ratio)
  /**
   * How the image is framed before the mask is applied.
   *
   * `cover` decides the smallest scale that fills the shape and centres it,
   * which is the right default and the wrong answer often enough to need an
   * override: a photograph with the face off-centre, or with headroom the mask
   * then crops into, has no good automatic framing. `zoom` multiplies the cover
   * scale and the offsets slide the image through the space that leaves, each
   * -1..1 of it — so 0,0 is exactly the previous behaviour.
   */
  zoom?: number;
  offsetX?: number;
  offsetY?: number;
  /**
   * Fraction of the height, measured up from the bottom, faded to transparent.
   *
   * The mask's lower edge is flat. That read as deliberate while the exported
   * PDF still carried the decorative background — the photo met the blue and
   * looked like a panel — but the export is white now, and a flat edge on white
   * reads as an image that failed to finish loading. Fading it is what makes it
   * end rather than stop.
   */
  fadeBottom?: number;
}

/**
 * Loads an image with optional CORS support
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Applies a mask to an image using Canvas API composite operations.
 * Uses "destination-in" to clip the image to the mask shape.
 * The canvas dimensions will match the mask's aspect ratio exactly (1:1 with mask SVG).
 * 
 * @param options Configuration for mask application
 * @returns Promise that resolves when masking is complete
 */
export async function applyMaskToCanvas({
  canvas,
  imageSrc,
  maskSrc,
  scale = 3,
  size = 280,
  zoom = 1,
  offsetX: framingX = 0,
  offsetY: framingY = 0,
  fadeBottom = 0,
}: ApplyMaskToCanvasOptions): Promise<void> {
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) {
    throw new Error("Could not get canvas 2D context");
  }

  // Load both images in parallel
  const [image, mask] = await Promise.all([
    loadImage(imageSrc),
    loadImage(maskSrc),
  ]);

  // Set canvas size to match mask's aspect ratio (1:1 with SVG)
  // The mask determines the canvas shape
  const maskAspect = mask.width / mask.height;
  canvas.width = size * scale;
  canvas.height = (size * scale) / maskAspect;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Calculate dimensions to fit portrait image (object-fit: cover behavior)
  // The portrait fills the entire canvas (which has mask's aspect ratio)
  const canvasAspect = canvas.width / canvas.height;
  const imageAspect = image.width / image.height;

  let drawWidth: number, drawHeight: number;

  if (imageAspect > canvasAspect) {
    // Portrait is wider relative to canvas - fit by height, crop sides
    drawHeight = canvas.height;
    drawWidth = drawHeight * imageAspect;
  } else {
    // Portrait is taller relative to canvas - fit by width, crop top/bottom
    drawWidth = canvas.width;
    drawHeight = drawWidth / imageAspect;
  }

  drawWidth *= zoom;
  drawHeight *= zoom;

  /**
   * Centred, then slid by the caller's framing.
   *
   * The offsets are fractions of the overflow rather than pixels, so they mean
   * the same thing whatever the image's size — and at the extremes they line an
   * edge up with the frame instead of running past it. At zoom 1 with a shape
   * the image already fills on one axis, the spare space on that axis is zero
   * and the offset correctly does nothing.
   */
  const spareX = canvas.width - drawWidth;
  const spareY = canvas.height - drawHeight;
  const offsetX = spareX / 2 + (framingX * Math.abs(spareX)) / 2;
  const offsetY = spareY / 2 + (framingY * Math.abs(spareY)) / 2;

  // Step 1: Draw the portrait image (fills canvas with cover behavior)
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  // Step 2: Apply the mask (1:1 with mask SVG dimensions)
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);

  // Step 3: Fade the lower edge out, by erasing alpha rather than painting a
  // colour over it. Painting white would only be invisible against white, and
  // on screen this sits over the page's background rather than over paper.
  if (fadeBottom > 0) {
    const fadeHeight = canvas.height * fadeBottom;
    const gradient = ctx.createLinearGradient(
      0,
      canvas.height - fadeHeight,
      0,
      canvas.height
    );
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 1)");

    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = gradient;
    ctx.fillRect(0, canvas.height - fadeHeight, canvas.width, fadeHeight);
  }

  // Reset composite operation
  ctx.globalCompositeOperation = "source-over";
}

