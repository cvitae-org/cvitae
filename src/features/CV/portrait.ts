import { createPersistedStore } from '@/libs/storage/persistedStore';

/**
 * The portrait: which image, how it sits, and the shape it is cut to.
 *
 * Kept out of the CV document deliberately. `cv.json` is the canonical record
 * of what the person has done — it is what gets tailored, embedded and searched,
 * and what `POST /document` sends to the runtime. A photograph and a crop offset
 * are presentation, and putting them there would mean every sync carried a
 * base64 image past a pipeline with no use for one.
 *
 * One portrait for both languages, not one each. The CVs are two documents
 * because they are written rather than translated; a face is not.
 */

/**
 * The portrait shown when nobody has uploaded one.
 *
 * A literal in three places before this — the header, the crop modal and now
 * the PDF exporter — which is three places that had to agree about which file
 * in `public/` is the default and no way to notice when they stopped.
 */
export const DEFAULT_PORTRAIT_SRC = '/portrait-placeholder.svg';

const STORAGE_KEY = 'cvitae.portrait.v1';
const STORAGE_VERSION = 1;

/**
 * The mask is generated rather than loaded.
 *
 * It used to be `public/portrait-mask.svg`, one hand-drawn path, which made the
 * shape a thing you could only change by editing an asset. These parameters
 * describe the same family of shapes — a straight left edge and a wave down the
 * right — and a generator turns them into a path. Everything downstream is
 * unchanged: `canvasMasking` still receives an SVG it draws with
 * `destination-in`, so the PDF export needs to know nothing about this.
 *
 * Bounded on purpose. A model is allowed to choose these numbers, and a schema
 * that cannot express a broken shape is what makes that safe — the worst a bad
 * answer produces is an odd silhouette, never an empty mask that renders the
 * portrait invisible.
 */
export type PortraitShape = {
  preset: PresetName;
  /** How far the wave swings inward, as a fraction of the width. 0 is straight. */
  amplitude: number;
  /** Lobes down the right edge. */
  frequency: number;
  /**
   * Corner rounding, as a fraction of the shorter side.
   *
   * Left corners always. Right corners only on `straight` — a wave meets the
   * top-right and bottom-right flush, and rounding those would cut the lobes.
   */
  rounding: number;
};

export type PortraitState = {
  /**
   * The uploaded image as a data URL, or null for the one in `public/`.
   *
   * A data URL rather than a Blob because it is handed straight to
   * `new Image().src` by the canvas masking, and because it survives the
   * store's `parse` without special handling. Downscaled on the way in, so this
   * is tens of kilobytes rather than the megabytes a phone camera produces.
   */
  image: string | null;
  /** Scale applied before masking. 1 fits the shorter side, as `cover` does. */
  zoom: number;
  /** Where the image sits within the frame, each -1..1 of the spare space. */
  offsetX: number;
  offsetY: number;
  shape: PortraitShape;
};

export const PRESETS = {
  /**
   * The original hand-drawn path, kept verbatim.
   *
   * Not reproducible from the parameters — it is an irregular curve someone
   * drew, and approximating it would have quietly changed the CV's appearance
   * for everyone who never touches this. So it stays a literal, and the
   * generated shapes are the alternatives rather than the replacement.
   */
  classic: { amplitude: 0.32, frequency: 3, rounding: 0.05 },
  wave: { amplitude: 0.3, frequency: 3, rounding: 0.04 },
  arch: { amplitude: 0.45, frequency: 1, rounding: 0.5 },
  soft: { amplitude: 0.16, frequency: 2, rounding: 0.25 },
  straight: { amplitude: 0, frequency: 1, rounding: 0 }
} as const;

export type PresetName = keyof typeof PRESETS;

/**
 * The shapes offered in the portrait modal.
 *
 * Two, not five. `classic` is the original drawn curve and has no parameters
 * behind it to move; `wave` and `arch` were only ever interesting alongside the
 * depth and rounding sliders, which are gone. What is left is a choice between
 * two silhouettes — the rest stay defined so a stored CV that references one
 * still renders as it was written.
 */
export const SELECTABLE_PRESET_NAMES = ['soft', 'straight'] as const satisfies readonly PresetName[];

/** The viewBox every generated path is drawn in, matching the original asset. */
export const SHAPE_WIDTH = 766;
export const SHAPE_HEIGHT = 1024;

const CLASSIC_PATH =
  'm766.2 0c0 0-699.6 0-729.6 0-19.2 0-36.7 17.5-36.6 35.5l0.6 988.5c0 0 41.4-39.7 180.7-47.6 78.4-4.4 192.1-19.7 216.9-110.8 18.4-67.7 39.3-88.2 106.6-134.9 88.1-61.1 218.6-107.5 229-207.5 11.1-105.8-33-102.7-52.4-257.2-9.2-73.1 6.4-190 84.8-266z';

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));

export const clampShape = (shape: Partial<PortraitShape>): PortraitShape => {
  const preset: PresetName =
    typeof shape.preset === 'string' && shape.preset in PRESETS
      ? (shape.preset as PresetName)
      : 'soft';

  return {
    preset,
    amplitude: clamp(shape.amplitude ?? PRESETS[preset].amplitude, 0, 0.6),
    frequency: Math.round(clamp(shape.frequency ?? PRESETS[preset].frequency, 1, 5)),
    rounding: clamp(shape.rounding ?? PRESETS[preset].rounding, 0, 1)
  };
};

/**
 * Samples the right edge and joins the samples with smooth cubics.
 *
 * Sampling rather than writing the curve directly: a cosine gives the edge its
 * shape, and Catmull-Rom through the samples turns that into Béziers that are
 * continuous by construction. Emitting control points by hand is where a
 * generated path acquires kinks, and there is no reason to do it here when the
 * curve is known analytically.
 */
const rightEdge = (amplitude: number, frequency: number): string => {
  const swing = amplitude * SHAPE_WIDTH;
  const samples = Math.max(8, frequency * 8);

  const points = Array.from({ length: samples + 1 }, (_, index) => {
    const t = index / samples;
    const y = t * SHAPE_HEIGHT;
    // Starts and ends at the full width, so the wave meets the corners flush.
    const inset = (swing * (1 - Math.cos(2 * Math.PI * frequency * t))) / 2;
    return { x: SHAPE_WIDTH - inset, y };
  });

  let path = '';

  for (let i = 0; i < points.length - 1; i++) {
    const previous = points[Math.max(0, i - 1)];
    const current = points[i];
    const next = points[i + 1];
    const after = points[Math.min(points.length - 1, i + 2)];

    const c1x = current.x + (next.x - previous.x) / 6;
    const c1y = current.y + (next.y - previous.y) / 6;
    const c2x = next.x - (after.x - current.x) / 6;
    const c2y = next.y - (after.y - current.y) / 6;

    path += `C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)} `;
  }

  return path;
};

/**
 * A rectangle with the same rounding on every corner.
 *
 * Used only by `straight`. The wave path cannot share this: its right edge is
 * a curve that already owns those two corners, and grafting arcs onto it
 * would flatten the first and last lobes.
 */
const roundedRectPath = (radius: number): string => {
  if (radius <= 0) {
    return `M 0 0 L ${SHAPE_WIDTH} 0 L ${SHAPE_WIDTH} ${SHAPE_HEIGHT} L 0 ${SHAPE_HEIGHT} Z`;
  }

  const right = SHAPE_WIDTH - radius;
  const bottom = SHAPE_HEIGHT - radius;

  return (
    `M ${radius} 0 ` +
    `L ${right} 0 ` +
    `Q ${SHAPE_WIDTH} 0 ${SHAPE_WIDTH} ${radius} ` +
    `L ${SHAPE_WIDTH} ${bottom} ` +
    `Q ${SHAPE_WIDTH} ${SHAPE_HEIGHT} ${right} ${SHAPE_HEIGHT} ` +
    `L ${radius} ${SHAPE_HEIGHT} ` +
    `Q 0 ${SHAPE_HEIGHT} 0 ${bottom} ` +
    `L 0 ${radius} ` +
    `Q 0 0 ${radius} 0 ` +
    'Z'
  );
};

/** The mask outline for a set of parameters, as SVG path data. */
export const shapePath = (shape: PortraitShape): string => {
  if (shape.preset === 'classic') return CLASSIC_PATH;

  const radius = shape.rounding * Math.min(SHAPE_WIDTH, SHAPE_HEIGHT) * 0.5;

  if (shape.preset === 'straight') return roundedRectPath(radius);

  return (
    `M ${radius} 0 ` +
    `L ${SHAPE_WIDTH} 0 ` +
    rightEdge(shape.amplitude, shape.frequency) +
    `L ${radius} ${SHAPE_HEIGHT} ` +
    (radius > 0
      ? `Q 0 ${SHAPE_HEIGHT} 0 ${SHAPE_HEIGHT - radius} L 0 ${radius} Q 0 0 ${radius} 0 `
      : `L 0 ${SHAPE_HEIGHT} L 0 0 `) +
    'Z'
  );
};

/**
 * The path as a data URL, because that is what the canvas layer already takes.
 *
 * `applyMaskToCanvas` and `renderBackgroundShape` both load their shape through
 * `new Image()`, which is what makes them work under html2canvas. Handing them a
 * generated SVG instead of a file keeps that untouched — the alternative,
 * teaching both to accept path data, would have meant a second drawing path to
 * keep in step with the first.
 */
export const shapeSvgUrl = (shape: PortraitShape, fill = '#000'): string => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHAPE_WIDTH} ${SHAPE_HEIGHT}" ` +
    `width="${SHAPE_WIDTH}" height="${SHAPE_HEIGHT}">` +
    `<path fill="${fill}" d="${shapePath(shape)}"/></svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

/**
 * How far the white layer stands out past the portrait, in shape units.
 *
 * The original pair were two hand-drawn files whose silhouettes differ —
 * `portrait-mask.svg` at 766×1024 and `background-layer.svg` at 829×1080, about
 * 8% larger. That relationship is what puts a white margin around the photograph
 * and lets the shape read against the page.
 */
const BACKGROUND_MARGIN = 32;

/** Original hand-drawn background asset dimensions. */
export const CLASSIC_BACKGROUND_WIDTH = 829;
export const CLASSIC_BACKGROUND_HEIGHT = 1080;

/**
 * Portrait width as a fraction of the white background canvas width.
 *
 * The mask and the white fill share the same path; the background canvas is
 * larger by `BACKGROUND_MARGIN` on each side. The photograph has to sit at this
 * ratio or rounded corners drift — the old `93%` guess was close but wrong
 * enough to leave gaps at the curves.
 */
export const portraitWidthRatio = (shape: PortraitShape): number =>
  shape.preset === 'classic'
    ? SHAPE_WIDTH / CLASSIC_BACKGROUND_WIDTH
    : SHAPE_WIDTH / (SHAPE_WIDTH + BACKGROUND_MARGIN * 2);

/** The factor `MaskedBackground` must be drawn at so its inner area matches. */
export const backgroundScale = (shape: PortraitShape): number =>
  shape.preset === 'classic'
    ? 1
    : (SHAPE_WIDTH + BACKGROUND_MARGIN * 2) / SHAPE_WIDTH;

/**
 * The white layer, as the same silhouette inflated.
 *
 * Stroking the path as well as filling it is what does the inflating, and it is
 * the reason this is not simply the mask scaled up: scaling moves an outline
 * away from the centre, so a shape with detail on one edge — which is exactly
 * this one — grows unevenly and the margin varies around it. A stroke offsets
 * the outline itself, so the white is the same width everywhere, whatever the
 * wave is doing.
 *
 * `classic` keeps its own drawn file, for the same reason the mask does: the two
 * were made to sit together, and a generated approximation would change a
 * composition nobody asked to change.
 */
export const backgroundSvgUrl = (shape: PortraitShape, fill = '#ffffff'): string => {
  if (shape.preset === 'classic') return '/background-layer.svg';

  const width = SHAPE_WIDTH + BACKGROUND_MARGIN * 2;
  const height = SHAPE_HEIGHT + BACKGROUND_MARGIN * 2;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `width="${width}" height="${height}">` +
    `<g transform="translate(${BACKGROUND_MARGIN} ${BACKGROUND_MARGIN})">` +
    `<path d="${shapePath(shape)}" fill="${fill}" stroke="${fill}" ` +
    `stroke-width="${BACKGROUND_MARGIN * 2}" stroke-linejoin="miter"/>` +
    `</g></svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export const emptyPortrait = (): PortraitState => ({
  image: null,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  shape: clampShape({ preset: 'soft' })
});

const parsePortrait = (stored: unknown): PortraitState => {
  const raw = (stored ?? {}) as { portrait?: unknown };
  const value = (raw.portrait ?? {}) as Partial<PortraitState>;
  const empty = emptyPortrait();

  return {
    // Only data URLs. Anything else came from somewhere this did not put it,
    // and handing an arbitrary string to `Image.src` is how a stored value
    // becomes a request.
    image:
      typeof value.image === 'string' && value.image.startsWith('data:image/')
        ? value.image
        : null,
    zoom: clamp(value.zoom ?? empty.zoom, 1, 3),
    offsetX: clamp(value.offsetX ?? 0, -1, 1),
    offsetY: clamp(value.offsetY ?? 0, -1, 1),
    shape: clampShape((value.shape ?? {}) as Partial<PortraitShape>)
  };
};

const store = createPersistedStore<PortraitState>({
  key: STORAGE_KEY,
  empty: emptyPortrait,
  parse: parsePortrait,
  serialize: (data) => ({ version: STORAGE_VERSION, portrait: data })
});

export const {
  subscribe: subscribePortrait,
  getSnapshot: getPortraitSnapshot,
  getServerSnapshot: getPortraitServerSnapshot,
  getState: getPortrait
} = store;

/** The image to draw for a given portrait state: the upload, or the default. */
export const portraitSource = (state: Pick<PortraitState, 'image'>): string =>
  state.image ?? DEFAULT_PORTRAIT_SRC;

export const setPortraitImage = (image: string | null) =>
  store.update((current) => ({ ...current, image, zoom: 1, offsetX: 0, offsetY: 0 }));

export const setPortraitFraming = (
  framing: Partial<Pick<PortraitState, 'zoom' | 'offsetX' | 'offsetY'>>
) =>
  store.update((current) => ({
    ...current,
    zoom: clamp(framing.zoom ?? current.zoom, 1, 3),
    offsetX: clamp(framing.offsetX ?? current.offsetX, -1, 1),
    offsetY: clamp(framing.offsetY ?? current.offsetY, -1, 1)
  }));

/**
 * Downscales an uploaded file to something worth storing.
 *
 * The images shipped in `public/` are 6.4MB and 3.8MB, drawn into a 280px
 * canvas — so almost all of those bytes are decoded and thrown away on every
 * page load. A portrait needs the canvas width at twice the density and no
 * more, which is a WebP of a few tens of kilobytes, small enough that keeping
 * it in IndexedDB beside the CV is unremarkable.
 */
/** The parameters a control can move, as opposed to the preset that names them. */
const TUNABLE = ['amplitude', 'frequency', 'rounding'] as const;

/**
 * Changes the silhouette, by preset or by parameter.
 *
 * The three parameters are independent of each other and always have been —
 * only the presets bundled them, which is why `straight` removed the corner
 * rounding along with the waves when the two have nothing to do with one
 * another. A preset is a starting point now; the controls move one number at a
 * time.
 *
 * `classic` is the exception, because it is a drawn curve with no parameters
 * behind it: a slider moved against it changes the stored numbers and redraws
 * nothing. The first adjustment therefore converts it to the generated shape,
 * seeded from the numbers already stored — which are classic's own, and within
 * a hundredth of what the drawn path traces, so the portrait barely moves.
 */
export const setPortraitShape = (shape: Partial<PortraitShape>) =>
  store.update((current) => {
    const tuning = TUNABLE.some((key) => shape[key] !== undefined);
    const preset =
      tuning && current.shape.preset === 'classic' ? 'wave' : current.shape.preset;

    return {
      ...current,
      shape: clampShape({ ...current.shape, preset, ...shape })
    };
  });

/** Below this a wave is not a wave, it is a straight edge with rounding errors. */
export const MIN_WAVE_AMPLITUDE = 0.01;

/**
 * What turning waves back on restores, when there is nothing to restore to.
 *
 * Annotated, because `PRESETS` is `as const` and the inferred literal type
 * would make every value but this one unassignable to a state holding it.
 */
export const DEFAULT_WAVE_AMPLITUDE: number = PRESETS.soft.amplitude;

/**
 * Whether the edge waves at all.
 *
 * Derived rather than stored: "no waves" is amplitude zero and nothing else, so
 * a separate boolean would be a second copy of the same fact — free to disagree
 * with the number the mask is actually drawn from.
 */
export const hasWaves = (shape: PortraitShape): boolean =>
  shape.amplitude >= MIN_WAVE_AMPLITUDE;

export const downscaleImage = (file: File, maxSide = 640): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);

      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);

      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('This browser would not provide a canvas to resize the image.'));
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/webp', 0.85));
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} could not be read as an image.`));
    };

    image.src = url;
  });
