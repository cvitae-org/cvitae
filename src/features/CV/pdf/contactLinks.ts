import type { CvDocument } from '../document';

/**
 * URL helpers for the ATS export, kept out of `AtsPdfDocument`.
 *
 * `atsPdf` imports the document component dynamically so `@react-pdf` stays out
 * of the main bundle, and it needs these synchronously to work out what the
 * preflight should expect. A module with no renderer in it is what lets both
 * sides agree without either waiting on the other.
 */

export const absoluteUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

/**
 * The contact links, once each, in the order they were written.
 *
 * `personal.links` is a map the editor exposes three fixed keys of — website,
 * github, linkedin — while an import may add its own under different names. The
 * designed CV reads those three keys and so never showed the rest; this export
 * reads every value, so the same destination arrived two or three times, once
 * per key that happened to hold it. React saw duplicate keys, and the header
 * printed the same address twice.
 *
 * Compared by destination rather than by string, because the copies are rarely
 * identical: `linkedin.com/in/x` and `https://www.linkedin.com/in/x/` are one
 * link written two ways. The first spelling of each destination is the one
 * kept, since that is the one the CV was written with.
 *
 * Characters that do not render are stripped before comparing. Two entries that
 * print as the same address are the same address, and a zero-width space or a
 * non-breaking space picked up from a paste or an import is exactly the kind of
 * difference that survives every other rule here while being invisible on the
 * page — leaving a duplicate nobody can see a reason for.
 */
const INVISIBLE = /[\u00AD\u200B-\u200F\u2028\u2029\uFEFF]/g;

export const linkIdentity = (value: string): string =>
  absoluteUrl(value)
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    // Every kind of space, not just the ASCII one: an address does not contain
    // one, so any that survived a paste is noise rather than content.
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');

export const uniqueContactLinks = (document: CvDocument): string[] => {
  const seen = new Set<string>();

  return Object.values(document.personal.links).filter((url) => {
    const trimmed = url.trim();
    if (!trimmed) return false;

    const identity = linkIdentity(trimmed);
    if (seen.has(identity)) return false;

    seen.add(identity);
    return true;
  });
};

