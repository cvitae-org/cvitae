import type { Locale } from '@/libs/i18n/config';
import { defaultLocale, locales } from '@/libs/i18n/config';

/**
 * The CV, as cvitae holds it.
 *
 * Deliberately the same shape as cvitae-agent-runtime's `cvDocument.ts`, field
 * for field. The two processes exchange whole documents — the runtime's
 * `extract_cv` produces one, `POST /document` accepts one — and a shape that
 * differed even slightly would need a translation layer on both sides that
 * would be wrong in a different way each time the schema moved. It is not
 * imported from there because cvitae talks to the runtime over HTTP and does
 * not depend on it as a package; the duplication is the price of that boundary,
 * and it is the boundary that lets the runtime be absent.
 *
 * One document per locale, not one document with per-language fields. The
 * Polish CV is written rather than translated — its summary is not a rendering
 * of the English one — so the two have no fields in common worth sharing, and a
 * `{ en, pl }` on every string would put that structure in front of every
 * consumer for no gain.
 *
 * `skills` is the one field that diverges from the runtime's stored CV: its
 * extractor produces three fixed lists, while this document holds named groups.
 * `parseDocument` accepts either shape. The `translate_cv` boundary is the
 * deliberate exception on the way out: its translatable-browser schema accepts
 * these named groups directly and returns their labels translated in place, so
 * no lossy folding into the three extraction lists occurs.
 */

export type CvLink = { name: string; url: string };

export type CvPersonal = {
  name: string;
  email: string;
  phone: string;
  location: string;
  /** Keyed by label: `github`, `linkedin`, `portfolio`. */
  links: Record<string, string>;
};

/**
 * One row of the skills strip: a heading and the list beside it.
 *
 * The heading is content, which it was not — it was one of three fixed fields
 * named by the translation file, and that shape decided on the author's behalf
 * what their skills are *about*. This CV had a "Styling & Design" row and an
 * "Other Technologies" row with nowhere to go, so they were folded into a
 * twenty-eight item `libraries_and_tools` that wraps to three lines and ends on
 * the word "Jira". A label the document carries costs the fixed keys and buys
 * rows that can be named, added and removed by the person whose CV it is.
 *
 * It also puts the Polish CV's headings in the document rather than in the
 * interface: what a row is called now travels with the CV it belongs to, like
 * every other word on the page.
 */
export type CvSkillGroup = {
  label: string;
  items: string[];
};

export type CvSkills = {
  /** The current job title, e.g. "Frontend Developer". */
  role: string;
  /** In the order they are shown — a CV leads with what it wants read first. */
  groups: CvSkillGroup[];
};

export type CvExperience = {
  company: string;
  title: string;
  started: string;
  /** `null` means the role is ongoing. */
  finished: string | null;
  /** One statement per bullet, never a paragraph — this is the retrievable part. */
  highlights: string[];
  skills: string[];
};

export type CvEducation = {
  university: string;
  degree: string;
  started: string;
  finished: string | null;
  thesis: string;
  mark: string;
};

export type CvCertificate = {
  name: string;
  issuer: string;
  started: string;
  finished: string | null;
};

export type CvLanguage = { name: string; level: string };

export type CvSource = { kind: string; reference: string; imported_at: string };

export type CvDocument = {
  version: 1;
  updated_at: string;
  personal: CvPersonal;
  /** The prose summary shown under the header. */
  role_description: string;
  skills: CvSkills;
  experience: CvExperience[];
  education: CvEducation[];
  certificates: CvCertificate[];
  languages: CvLanguage[];
  /** Where each part came from, so a wrong-looking field can be traced. */
  sources: CvSource[];
};

export const emptyDocument = (): CvDocument => ({
  version: 1,
  updated_at: new Date(0).toISOString(),
  personal: { name: '', email: '', phone: '', location: '', links: {} },
  role_description: '',
  skills: { role: '', groups: [] },
  experience: [],
  education: [],
  certificates: [],
  languages: [],
  sources: []
});

/** One CV per language. What each starts as is `./seed`'s business, not this module's. */
export type CvState = Record<Locale, CvDocument>;

/**
 * True when nothing has been entered yet.
 *
 * Drives the empty state, and is deliberately not `updated_at === epoch`: a
 * document can be written and then emptied by hand, and the page that says
 * "import a CV to begin" should be the one that shows for both.
 */
export const isBlank = (document: CvDocument): boolean =>
  !document.personal.name &&
  !document.role_description &&
  !document.skills.role &&
  document.experience.length === 0 &&
  document.education.length === 0 &&
  document.certificates.length === 0 &&
  document.languages.length === 0;

const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

/** `null` is meaningful here — an ongoing role — so it is preserved, not blanked. */
const endDate = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

const textArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const objectArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? (value.filter(
        (item) => item !== null && typeof item === 'object'
      ) as Record<string, unknown>[])
    : [];

/** The skills fields `extract_cv` returns, and every document stored before groups. */
const runtimeGroups = [
  'programming_languages',
  'frameworks',
  'libraries_and_tools'
] as const;

type RuntimeGroup = (typeof runtimeGroups)[number];

const englishGroupLabels: Record<RuntimeGroup, string> = {
  programming_languages: 'Languages',
  frameworks: 'Frameworks',
  libraries_and_tools: 'Libraries & Tools'
};

/**
 * What those three lists are called when they arrive without a name.
 *
 * These are the old translated headings, moved here from `messages/*.json`
 * because they stopped being interface: they are now the *initial value* of a
 * field the user edits, and a value cannot come from `useTranslations` — this
 * parser runs outside React, against storage and against whatever `extract_cv`
 * returned. They are read once, when a document that predates named groups is
 * first opened; after that the label is whatever the page says it is.
 *
 * Partial by locale on purpose, matching `./seed`: a language with no entry here
 * falls back to English rather than making a new locale a migration.
 */
const runtimeGroupLabels: Partial<Record<Locale, Record<RuntimeGroup, string>>> = {
  en: englishGroupLabels,
  pl: {
    programming_languages: 'Języki',
    frameworks: 'Frameworki',
    libraries_and_tools: 'Biblioteki i narzędzia'
  }
};

/**
 * Reads the skills strip in either shape.
 *
 * `groups` when the document has them, the runtime's three lists when it does
 * not — which covers both a CV stored before this existed and an extraction
 * that just came back. A blank group survives the round trip deliberately: one
 * is written the moment "add a group" is clicked, and dropping it here would
 * lose the row between adding it and typing into it.
 *
 * An empty *legacy* list is dropped, because there it means "this CV has no
 * frameworks" rather than "a row is waiting" — reviving all three as empty rows
 * would greet every migrated document with headings it never had.
 */
const skillGroups = (raw: Record<string, unknown>, locale: Locale): CvSkillGroup[] => {
  if (Array.isArray(raw.groups)) {
    return objectArray(raw.groups).map((group) => ({
      label: text(group.label),
      items: textArray(group.items)
    }));
  }

  const labels = runtimeGroupLabels[locale] ?? englishGroupLabels;

  return runtimeGroups
    .map((field) => ({ label: labels[field], items: textArray(raw[field]) }))
    .filter((group) => group.items.length > 0);
};

const links = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object') return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, url]) => typeof url === 'string' && url)
      .map(([name, url]) => [name, url as string])
  );
};

/**
 * Reads a document out of whatever storage returned.
 *
 * Defensive throughout, and must not throw: it is handed hand-edited payloads,
 * documents written by an older schema, and — because this is the same shape the
 * runtime sends — output that a small model produced from a screenshot. Losing
 * the whole CV to one malformed field is not an acceptable answer, so every
 * field falls back to its empty value independently.
 *
 * `locale` names nothing in the document itself; it is only what the skills
 * strip's headings are read in when the document arrives without any — see
 * `runtimeGroupLabels`. It defaults rather than being required because most
 * callers are parsing a document they are about to look at in one language, and
 * a wrong guess here costs a heading the user can retype, not a field.
 */
export const parseDocument = (
  stored: unknown,
  locale: Locale = defaultLocale
): CvDocument => {
  const raw = (stored ?? {}) as Record<string, unknown>;
  const personal = (raw.personal ?? {}) as Record<string, unknown>;
  const skills = (raw.skills ?? {}) as Record<string, unknown>;
  const base = emptyDocument();

  return {
    version: 1,
    updated_at: text(raw.updated_at) || base.updated_at,
    personal: {
      name: text(personal.name),
      email: text(personal.email),
      phone: text(personal.phone),
      location: text(personal.location),
      links: links(personal.links)
    },
    role_description: text(raw.role_description),
    skills: {
      role: text(skills.role),
      groups: skillGroups(skills, locale)
    },
    experience: objectArray(raw.experience).map((entry) => ({
      company: text(entry.company),
      title: text(entry.title),
      started: text(entry.started),
      finished: endDate(entry.finished),
      highlights: textArray(entry.highlights),
      skills: textArray(entry.skills)
    })),
    education: objectArray(raw.education).map((entry) => ({
      university: text(entry.university),
      degree: text(entry.degree),
      started: text(entry.started),
      finished: endDate(entry.finished),
      thesis: text(entry.thesis),
      mark: text(entry.mark)
    })),
    certificates: objectArray(raw.certificates).map((entry) => ({
      name: text(entry.name),
      issuer: text(entry.issuer),
      started: text(entry.started),
      finished: endDate(entry.finished)
    })),
    languages: objectArray(raw.languages).map((entry) => ({
      name: text(entry.name),
      level: text(entry.level)
    })),
    sources: objectArray(raw.sources).map((entry) => ({
      kind: text(entry.kind),
      reference: text(entry.reference),
      imported_at: text(entry.imported_at)
    }))
  };
};

/**
 * `fallback` supplies the locales storage had nothing for.
 *
 * A parameter rather than a hard-coded `emptyDocument`, because "never written"
 * and "written and then emptied" have to end differently: the store passes the
 * seed here, and a CV the user cleared by hand stays cleared — it was stored,
 * so it is parsed, so the seed never sees it. Getting that backwards would
 * refill a document every time someone tried to empty it.
 */
export const parseState = (
  stored: unknown,
  fallback: (locale: Locale) => CvDocument = emptyDocument
): CvState => {
  const raw = (stored ?? {}) as { documents?: unknown };
  const documents = (raw.documents ?? {}) as Record<string, unknown>;

  return Object.fromEntries(
    locales.map((locale) => [
      locale,
      // A locale absent from storage is a CV not yet written, not a fault —
      // adding a third language must not require a migration.
      // The locale is handed on so a CV stored before skill groups had names
      // gets them in its own language: the Polish document's headings should
      // not read "Libraries & Tools" on the one render that names them.
      locale in documents
        ? parseDocument(documents[locale], locale)
        : fallback(locale)
    ])
  ) as CvState;
};
