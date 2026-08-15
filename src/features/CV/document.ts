import type { Locale } from '@/libs/i18n/config';
import { locales } from '@/libs/i18n/config';

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

export type CvSkills = {
  /** The current job title, e.g. "Frontend Developer". */
  role: string;
  programming_languages: string[];
  frameworks: string[];
  libraries_and_tools: string[];
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
  skills: {
    role: '',
    programming_languages: [],
    frameworks: [],
    libraries_and_tools: []
  },
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
 */
export const parseDocument = (stored: unknown): CvDocument => {
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
      programming_languages: textArray(skills.programming_languages),
      frameworks: textArray(skills.frameworks),
      libraries_and_tools: textArray(skills.libraries_and_tools)
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
      locale in documents ? parseDocument(documents[locale]) : fallback(locale)
    ])
  ) as CvState;
};
