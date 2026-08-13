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

  let drawWidth: number, drawHeight: number, offsetX: number, offsetY: number;

  if (imageAspect > canvasAspect) {
    // Portrait is wider relative to canvas - fit by height, crop sides
    drawHeight = canvas.height;
    drawWidth = drawHeight * imageAspect;
    offsetX = (canvas.width - drawWidth) / 2;
    offsetY = 0;
  } else {
    // Portrait is taller relative to canvas - fit by width, crop top/bottom
    drawWidth = canvas.width;
    drawHeight = drawWidth / imageAspect;
    offsetX = 0;
    offsetY = (canvas.height - drawHeight) / 2;
  }

  // Step 1: Draw the portrait image (fills canvas with cover behavior)
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  // Step 2: Apply the mask (1:1 with mask SVG dimensions)
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);

  // Reset composite operation
  ctx.globalCompositeOperation = "source-over";
}

