/**
 * The portrait, prepared for the PDF exporter.
 *
 * Two things stand between the stored portrait and `@react-pdf`'s `Image`, and
 * neither is optional.
 *
 * The format. `downscaleImage` stores an uploaded photograph as WebP, which is
 * the right choice for something handed to `new Image().src` in a browser and
 * the wrong one here: `@react-pdf/renderer` decodes JPEG and PNG and nothing
 * else, so the stored data URL cannot be embedded as it stands. It is re-encoded
 * to JPEG, which is also what a photograph should be — the same picture as PNG
 * is several times the bytes for no visible gain.
 *
 * The size. The default portraits in `public/` are 3.8MB and 6.4MB, and the
 * preflight blocks the export above a compatibility ceiling and warns above
 * 1MB — so embedding one untouched would fail the very check the ATS export
 * exists to pass, and would attach megabytes to an application email. Drawn at
 * roughly twice its printed size, the same photograph is a few tens of
 * kilobytes.
 *
 * Both steps are one canvas round trip, so they are one function.
 */

/**
 * Twice the printed box, which is where the returns stop.
 *
 * The photo prints at 64×80pt. At 2× that is 128×160 device pixels of source
 * for a box a reader sees at about 22×28mm, which is past the point where more
 * pixels change the printed result and well short of the point where the file
 * size becomes a problem.
 */
const MAX_SIDE = 320;

/** High enough that the compression is invisible on a face at this size. */
const QUALITY = 0.82;

/**
 * Loads an image src and returns it as a JPEG data URL sized for print.
 *
 * `src` is whatever the portrait store holds — a WebP data URL for an uploaded
 * photograph, or a path under `public/` for the default. Both load through the
 * same element; a data URL is not a request and the path is same-origin, so
 * neither taints the canvas and `toDataURL` is allowed to read it back.
 */
export const printablePortrait = (src: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));

      const context = canvas.getContext('2d');

      if (!context) {
        reject(new Error('This browser would not provide a canvas to prepare the portrait.'));
        return;
      }

      // JPEG has no alpha, and an undrawn canvas is transparent black — which
      // encodes as a black rectangle behind anything the photograph does not
      // cover. White is what the page is.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      resolve(canvas.toDataURL('image/jpeg', QUALITY));
    };

    image.onerror = () =>
      reject(new Error('The portrait could not be read as an image.'));

    image.src = src;
  });
