/**
 * Canvas-based background shape rendering.
 * Renders SVG shapes filled with solid colors.
 */

interface RenderBackgroundShapeOptions {
  canvas: HTMLCanvasElement;
  shapeSrc: string;
  fillColor?: string;
  scale?: number;
  size?: number;
}

/**
 * Loads an SVG image with optional CORS support
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
 * Renders an SVG shape filled with a solid color on a transparent canvas.
 * The shape determines the canvas dimensions (maintains 1:1 aspect ratio with SVG).
 * 
 * @param options Configuration for background rendering
 * @returns Promise that resolves when rendering is complete
 */
export async function renderBackgroundShape({
  canvas,
  shapeSrc,
  fillColor = "#ffffff",
  scale = 3,
  size = 280,
}: RenderBackgroundShapeOptions): Promise<void> {
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) {
    throw new Error("Could not get canvas 2D context");
  }

  // Load the shape SVG
  const shape = await loadImage(shapeSrc);

  // Set canvas size to match shape's aspect ratio (1:1 with SVG)
  const shapeAspect = shape.width / shape.height;
  canvas.width = size * scale;
  canvas.height = (size * scale) / shapeAspect;

  // Clear canvas (transparent background)
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw the shape filled with the specified color
  // Step 1: Draw the shape (it's black in the SVG, but we'll use composite to change color)
  ctx.drawImage(shape, 0, 0, canvas.width, canvas.height);

  // Step 2: Fill the entire shape area with the desired color
  // Use composite operation to fill the shape
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = fillColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Reset composite operation
  ctx.globalCompositeOperation = "source-over";
}

