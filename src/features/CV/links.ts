/**
 * The contact links a CV has: three slots, and one answer to what counts as
 * the same link.
 *
 * Its own module because three unrelated places need to agree on this — the
 * parser that fills the slots, the editor that draws them, and the exports that
 * print them. Two of them had grown a private copy of the normaliser, which is
 * one edit away from an export that disagrees with the page, and an export
 * disagreeing with the page is the whole reason the slots exist.
 */

/**
 * The link slots, positional, holding whatever is put in them.
 *
 * They used to be named after what they were expected to hold — website, github,
 * linkedin — which decided on the author's behalf what a link on their CV is
 * for, and had no answer for a fourth thing worth linking. Worse, the name was
 * the identity: an import writing `portfolio` created a link the editor could
 * not show, because the editor reads keys it knows by name. Those entries were
 * invisible to the person whose CV it was and printed anyway by the exports,
 * which read the whole map — the same address twice on the PDF, with nothing in
 * the interface to remove it.
 *
 * Positional slots close that gap: what the editor can show and what an export
 * can print are the same three things, by construction.
 */
export const LINK_SLOTS = ['link1', 'link2', 'link3'] as const;
export type LinkSlot = (typeof LINK_SLOTS)[number];

export const isLinkSlot = (name: string): name is LinkSlot =>
  (LINK_SLOTS as readonly string[]).includes(name);

/**
 * Turns a stored address into something a PDF viewer will open.
 *
 * The links are typed by hand into a text field, so they arrive as people write
 * them — `github.com/you`, not `https://github.com/you`. A link annotation with
 * no scheme is not followed by any viewer.
 */
export const absoluteUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

/** Characters that occupy no space on the page, so they cannot be a difference. */
const INVISIBLE = /[\u00AD\u200B-\u200F\u2028\u2029\uFEFF]/g;

/**
 * Where an address points, ignoring how it was written.
 *
 * Scheme, `www.` and a trailing slash are spelling. So is every kind of space —
 * an address contains none, so any that survived a paste is noise — and so is a
 * zero-width space or a byte-order mark, which is the difference that survives
 * every other rule here while being invisible on the page, leaving a duplicate
 * nobody can see a reason for.
 *
 * `linkedin.com/in/x` and `https://www.linkedin.com/in/x/` are one link written
 * two ways, and three slots are all the room a CV has.
 */
export const linkDestination = (value: string): string =>
  value
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/^[a-z][a-z\d+.-]*:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');

/**
 * Places `candidates` into whichever slots `held` leaves empty.
 *
 * Order is the caller's: the first candidate goes into the first free slot. A
 * candidate pointing where the CV already points is skipped rather than placed,
 * which is what keeps a merge — an import, a translation, a migration off the
 * old named keys — from spending two of the three slots on one site written two
 * ways. Nothing already held is moved or overwritten; this only fills gaps.
 *
 * The slots written are returned alongside the map because a merge reports what
 * it filled and cannot tell that from the result.
 */
export const fillLinkSlots = (
  held: Record<string, string>,
  candidates: readonly string[]
): { links: Record<string, string>; filled: LinkSlot[] } => {
  const links: Record<string, string> = {};
  const filled: LinkSlot[] = [];

  const taken = new Set(
    LINK_SLOTS.flatMap((slot) => {
      const url = (held[slot] ?? '').trim();
      return url ? [linkDestination(url)] : [];
    })
  );

  const queue = candidates.map((url) => url.trim()).filter(Boolean);

  LINK_SLOTS.forEach((slot) => {
    const existing = (held[slot] ?? '').trim();
    if (existing) {
      links[slot] = existing;
      return;
    }

    const index = queue.findIndex((url) => !taken.has(linkDestination(url)));
    if (index === -1) return;

    const [url] = queue.splice(index, 1);
    taken.add(linkDestination(url));
    links[slot] = url;
    filled.push(slot);
  });

  return { links, filled };
};
