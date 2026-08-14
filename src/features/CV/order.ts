/**
 * Where each piece of the CV sits in the document.
 *
 * Ordering used to come from `OrderContext`, which hands out a number the first
 * time a component renders. That is correct exactly once — on the initial mount,
 * render order is document order — and wrong forever after: the counter only
 * resets when the provider re-renders, so anything mounted later takes the next
 * number available, which is after every section that was already there. A job
 * added to a filled CV rendered below the footer.
 *
 * Position in a document is not a fact about when a component happened to mount,
 * so it is stated instead of observed. `MeasuredItem` and `MeasuredSection` both
 * already accept an explicit `order` and prefer it over the counter.
 *
 * The stride leaves room for entries between sections. A CV with a thousand jobs
 * in it has a different problem.
 */

export const CV_SECTIONS = [
  'header',
  'experience',
  'education',
  'certificates',
  'languages',
  'footer'
] as const;

export type CvSection = (typeof CV_SECTIONS)[number];

const STRIDE = 1_000;

/** The section's own header. Entries sort after it. */
export const sectionOrder = (section: CvSection): number =>
  CV_SECTIONS.indexOf(section) * STRIDE;

/** One entry within a section, in the order the document holds it. */
export const entryOrder = (section: CvSection, index: number): number =>
  sectionOrder(section) + 1 + index;

/**
 * The "add" control, which has to sort below every entry however many there are
 * — including entries that do not exist yet.
 */
export const trailingOrder = (section: CvSection): number =>
  sectionOrder(section) + STRIDE - 1;
