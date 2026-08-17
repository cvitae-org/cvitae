import type { CvDocument } from './document';

/**
 * Folding an imported document into the one already here.
 *
 * A port of cvitae-agent-runtime's `store/merge.ts`, deliberately field for
 * field, because the two sides must not disagree about what an import does. The
 * runtime applies this to its `cv.json` when it persists; cvitae applies it to
 * the browser's document, which is the copy that actually gets edited. Two
 * different answers to "did importing this overwrite my job title" would be
 * worse than either answer alone.
 *
 * The policy: **an import may add, and may fill a blank, but may never
 * overwrite.** Not "newest wins" — the two sides are not equally trustworthy.
 * What is here has survived being looked at; what has arrived was guessed at by
 * a small model from a PDF, and this project has measured that model inventing
 * a certificate out of a line in the skills list. Losing a correct value to a
 * hallucinated one is the worst thing an import can do and it is silent.
 *
 * Replacing wholesale is still offered in the UI, because after seeding there is
 * always something here and "fill the gaps" would otherwise mean "do nothing".
 * That is a choice made in front of a preview, which is a different act from a
 * merge quietly deciding it.
 */

export type MergeReport = {
  /** Dotted paths of fields that were blank and now are not. */
  filled: string[];
  added: {
    experience: number;
    education: number;
    certificates: number;
    languages: number;
    highlights: number;
    skills: number;
  };
};

/** True when the merge would change nothing, so the UI can say so plainly. */
export const isEmptyReport = (report: MergeReport): boolean =>
  report.filled.length === 0 &&
  Object.values(report.added).every((count) => count === 0);

/** Case- and whitespace-insensitive identity for matching two entries. */
const key = (...parts: (string | null | undefined)[]): string =>
  parts
    .map((part) => (part ?? '').trim().toLowerCase().replace(/\s+/g, ' '))
    .join('|');

const isBlank = (value: unknown): boolean =>
  typeof value !== 'string' || value.trim().length === 0;

/**
 * Union of two lists, keeping the existing order and casing.
 *
 * Existing casing wins because the user may have corrected "react" to "React",
 * and an import should not undo that.
 */
const unionStrings = (existing: string[], incoming: string[]): string[] => {
  const seen = new Set(existing.map((value) => value.trim().toLowerCase()));
  const merged = [...existing];

  for (const value of incoming) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    merged.push(trimmed);
  }

  return merged;
};

export const mergeDocument = (
  existing: CvDocument,
  incoming: CvDocument
): { document: CvDocument; report: MergeReport } => {
  const filled: string[] = [];
  const added: MergeReport['added'] = {
    experience: 0,
    education: 0,
    certificates: 0,
    languages: 0,
    highlights: 0,
    skills: 0
  };

  const personal = { ...existing.personal, links: { ...existing.personal.links } };

  for (const field of ['name', 'email', 'phone', 'location'] as const) {
    if (isBlank(personal[field]) && !isBlank(incoming.personal[field])) {
      personal[field] = incoming.personal[field].trim();
      filled.push(`personal.${field}`);
    }
  }

  for (const [name, url] of Object.entries(incoming.personal.links)) {
    if (!personal.links[name] && url.trim()) {
      personal.links[name] = url.trim();
      filled.push(`links.${name}`);
    }
  }

  let role_description = existing.role_description;
  if (isBlank(role_description) && !isBlank(incoming.role_description)) {
    role_description = incoming.role_description.trim();
    filled.push('summary');
  }

  const skills = {
    ...existing.skills,
    groups: existing.skills.groups.map((group) => ({
      ...group,
      items: [...group.items]
    }))
  };

  if (isBlank(skills.role) && !isBlank(incoming.skills.role)) {
    skills.role = incoming.skills.role.trim();
    filled.push('skills.role');
  }

  /**
   * Skills are matched against the *whole* strip, not against the group they
   * arrive in.
   *
   * An extraction has no idea what the rows here are called — it produces the
   * runtime's three, which `parseDocument` names from a table — so a CV whose
   * author moved Tailwind from "Libraries & Tools" to their own "Styling &
   * Design" row would otherwise be handed Tailwind back under the old heading,
   * and would then list it twice on the page. Matching everything already held
   * makes an import add only what is genuinely missing.
   *
   * What is missing goes into the group whose label matches, and into a new one
   * when none does. Appending is the honest outcome: the merge never overwrites,
   * so it has no standing to decide that the runtime's "Libraries & Tools"
   * belongs in a row the user named something else.
   */
  const held = new Set(
    skills.groups.flatMap((group) => group.items.map((item) => key(item)))
  );

  for (const group of incoming.skills.groups) {
    const fresh = group.items
      .map((item) => item.trim())
      .filter((item) => item && !held.has(key(item)));

    if (fresh.length === 0) continue;
    for (const item of fresh) held.add(key(item));

    const match = skills.groups.find(
      (candidate) => key(candidate.label) === key(group.label)
    );

    if (match) match.items = [...match.items, ...fresh];
    else skills.groups.push({ label: group.label, items: fresh });

    added.skills += fresh.length;
  }

  /**
   * Matched on company *and* title, because the same employer appearing twice is
   * usually a promotion, and those are two entries rather than one.
   *
   * Highlights union rather than replace: a second source describing the same
   * job phrases its bullets differently, and both phrasings are legitimate
   * material for a tailored CV. Dates are filled only when absent, and an
   * ongoing role is never closed — `finished: null` means "still there", which
   * is information an import has no standing to overwrite.
   */
  const experience = existing.experience.map((entry) => ({
    ...entry,
    highlights: [...entry.highlights],
    skills: [...entry.skills]
  }));

  for (const entry of incoming.experience) {
    const match = experience.find(
      (candidate) => key(candidate.company, candidate.title) === key(entry.company, entry.title)
    );

    if (!match) {
      experience.push({ ...entry });
      added.experience += 1;
      added.highlights += entry.highlights.length;
      continue;
    }

    const before = match.highlights.length;
    match.highlights = unionStrings(match.highlights, entry.highlights);
    match.skills = unionStrings(match.skills, entry.skills);
    added.highlights += match.highlights.length - before;

    if (isBlank(match.started) && !isBlank(entry.started)) {
      match.started = entry.started;
    }
  }

  const education = [...existing.education];
  for (const entry of incoming.education) {
    const exists = education.some(
      (candidate) =>
        key(candidate.university, candidate.degree) === key(entry.university, entry.degree)
    );
    if (!exists) {
      education.push({ ...entry });
      added.education += 1;
    }
  }

  const certificates = [...existing.certificates];
  for (const entry of incoming.certificates) {
    const exists = certificates.some(
      (candidate) => key(candidate.name, candidate.issuer) === key(entry.name, entry.issuer)
    );
    if (!exists) {
      certificates.push({ ...entry });
      added.certificates += 1;
    }
  }

  const languages = [...existing.languages];
  for (const entry of incoming.languages) {
    const exists = languages.some((candidate) => key(candidate.name) === key(entry.name));
    if (!exists) {
      languages.push({ ...entry });
      added.languages += 1;
    }
  }

  return {
    document: {
      ...existing,
      personal,
      role_description,
      skills,
      experience,
      education,
      certificates,
      languages,
      // Provenance is append-only: where something came from stays true even
      // when a later import supersedes nothing.
      sources: [...existing.sources, ...incoming.sources]
    },
    report: { filled, added }
  };
};
