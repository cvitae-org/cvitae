import type { CvDocument } from '../document';
import { LINK_SLOTS, linkDestination } from '../links';

/**
 * The contact links the ATS export prints, kept out of `AtsPdfDocument`.
 *
 * `atsPdf` imports the document component dynamically so `@react-pdf` stays out
 * of the main bundle, and it needs this synchronously to work out what the
 * preflight should expect. A module with no renderer in it is what lets both
 * sides agree without either waiting on the other.
 */

/**
 * The links, exactly as the editor holds them.
 *
 * Reads the three slots in order rather than every value in the map, which is
 * what makes this export print what the page shows. It used to read the map, so
 * an entry stored under a key the editor cannot display — an import's own
 * naming — printed here anyway, and the same address arrived twice.
 *
 * Deduplication by destination stays as a floor. `parseDocument` fills the slots
 * from distinct destinations, so a document read back from storage cannot hold
 * two, but this is also handed documents straight from a generation or a
 * tailoring step, and a repeated address on a CV is never intended.
 */
export const uniqueContactLinks = (document: CvDocument): string[] => {
  const seen = new Set<string>();

  return LINK_SLOTS.flatMap((slot) => {
    const url = (document.personal.links[slot] ?? '').trim();
    if (!url) return [];

    const destination = linkDestination(url);
    if (seen.has(destination)) return [];

    seen.add(destination);
    return [url];
  });
};
