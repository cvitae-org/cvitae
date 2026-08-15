import type { Locale } from '@/libs/i18n/config';
import { createPersistedStore } from '@/libs/storage/persistedStore';
import {
  emptyDocument,
  parseState,
  type CvCertificate,
  type CvDocument,
  type CvEducation,
  type CvExperience,
  type CvLanguage,
  type CvState
} from './document';
import { seedDocument, seedState } from './seed';

/**
 * The CV, held in the browser and written to IndexedDB.
 *
 * The browser is authoritative and the runtime's `cv.json` is a copy. That is
 * the reverse of what the runtime's README describes, and it is deliberate:
 * the CV is edited here, field by field, by a person clicking on it — and a
 * source of truth that requires a second process to be running is one the
 * deployed site cannot render and an offline browser cannot correct. The
 * runtime keeps a copy because it needs one to tailor and to search, and
 * `reindex()` there is already defined as a repair rather than a migration,
 * which is exactly the standing a derived copy should have.
 *
 * Seeded on first run from `./seed`, which is this CV committed to the repo,
 * one document per language.
 *
 * This reverses what the comment here used to say — that the only way in was an
 * import, because a CV arriving pre-filled with someone else's details is worse
 * than one that says what to do next. That reasoning holds for a blank tool
 * someone else installs. It does not hold for the site whose whole purpose is
 * to be *this* CV: there, an empty first render is not an invitation, it is the
 * page failing to show the thing it exists for, and clearing site data meant
 * losing the document with no way back.
 *
 * The seed only ever fills a locale storage has no record of. Once a document
 * has been written it is authoritative, including when what was written is
 * nothing — see `parseState`.
 */

const STORAGE_KEY = 'cvitae.cv.v1';
const STORAGE_VERSION = 1;

const store = createPersistedStore<CvState>({
  key: STORAGE_KEY,
  empty: seedState,
  parse: (stored) => parseState(stored, seedDocument),
  serialize: (data) => ({ version: STORAGE_VERSION, documents: data })
});

export const {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  getState: getCvState
} = store;

/**
 * Applies a change to one language's CV and stamps it.
 *
 * `updated_at` is written here rather than at each call site because it is the
 * field most likely to be forgotten and the one the runtime sync compares
 * against — a document that changed without saying so would be pushed only by
 * accident.
 */
const editDocument = (
  locale: Locale,
  project: (document: CvDocument) => CvDocument
) => {
  store.update((current) => {
    const existing = current[locale] ?? emptyDocument();
    const next = project(existing);

    if (next === existing) return current;

    return {
      ...current,
      [locale]: { ...next, updated_at: new Date().toISOString() }
    };
  });
};

/** Replaces one language's CV wholesale. The way an import lands. */
export const replaceDocument = (locale: Locale, document: CvDocument) =>
  editDocument(locale, () => document);

export const clearDocument = (locale: Locale) =>
  editDocument(locale, () => emptyDocument());

export const setPersonal = (
  locale: Locale,
  patch: Partial<CvDocument['personal']>
) =>
  editDocument(locale, (document) => ({
    ...document,
    personal: { ...document.personal, ...patch }
  }));

export const setLink = (locale: Locale, name: string, url: string) =>
  editDocument(locale, (document) => {
    const links = { ...document.personal.links };

    // An emptied link is removed rather than stored blank, so the header does
    // not render a labelled anchor pointing nowhere.
    if (url.trim()) links[name] = url.trim();
    else delete links[name];

    return { ...document, personal: { ...document.personal, links } };
  });

export const setRoleDescription = (locale: Locale, value: string) =>
  editDocument(locale, (document) => ({
    ...document,
    role_description: value
  }));

export const setSkills = (
  locale: Locale,
  patch: Partial<CvDocument['skills']>
) =>
  editDocument(locale, (document) => ({
    ...document,
    skills: { ...document.skills, ...patch }
  }));

/**
 * The four sections that are lists of records, which share an editing shape:
 * patch a field of one entry, append a blank, remove by index.
 */
export type ListSection =
  | 'experience'
  | 'education'
  | 'certificates'
  | 'languages';

type EntryOf = {
  experience: CvExperience;
  education: CvEducation;
  certificates: CvCertificate;
  languages: CvLanguage;
};

/**
 * A new entry is blank rather than exemplary.
 *
 * Placeholder text ("Company name") reads as content in a document whose whole
 * point is that what it says is true, and a CV exported with a leftover example
 * in it is the kind of mistake that is only found by the person reading it.
 */
const blankEntry: { [K in ListSection]: () => EntryOf[K] } = {
  experience: () => ({
    company: '',
    title: '',
    started: '',
    finished: null,
    highlights: [],
    skills: []
  }),
  education: () => ({
    university: '',
    degree: '',
    started: '',
    finished: null,
    thesis: '',
    mark: ''
  }),
  certificates: () => ({ name: '', issuer: '', started: '', finished: null }),
  languages: () => ({ name: '', level: '' })
};

export const patchEntry = <K extends ListSection>(
  locale: Locale,
  section: K,
  index: number,
  patch: Partial<EntryOf[K]>
) =>
  editDocument(locale, (document) => {
    const entries = document[section] as EntryOf[K][];
    if (index < 0 || index >= entries.length) return document;

    const next = entries.map((entry, position) =>
      position === index ? { ...entry, ...patch } : entry
    );

    return { ...document, [section]: next };
  });

/** Appends a blank entry. Returns nothing; the caller focuses it by index. */
export const addEntry = (locale: Locale, section: ListSection) =>
  editDocument(locale, (document) => ({
    ...document,
    [section]: [...document[section], blankEntry[section]()]
  }));

export const removeEntry = (
  locale: Locale,
  section: ListSection,
  index: number
) =>
  editDocument(locale, (document) => {
    const entries = document[section];
    if (index < 0 || index >= entries.length) return document;

    return {
      ...document,
      [section]: entries.filter((_, position) => position !== index)
    };
  });

/**
 * Moves an entry, for reordering by drag or by keyboard.
 *
 * Order is content in a CV — the most relevant job goes first, and that differs
 * per application — so it is stored rather than derived from dates.
 */
export const moveEntry = (
  locale: Locale,
  section: ListSection,
  from: number,
  to: number
) =>
  editDocument(locale, (document) => {
    const entries = [...document[section]];
    if (from === to || from < 0 || from >= entries.length) return document;
    if (to < 0 || to >= entries.length) return document;

    const [moved] = entries.splice(from, 1);
    entries.splice(to, 0, moved);

    return { ...document, [section]: entries };
  });

/** The bullets under one job, which are edited one line at a time. */
export const setHighlight = (
  locale: Locale,
  entryIndex: number,
  highlightIndex: number,
  value: string
) =>
  editDocument(locale, (document) => {
    const entry = document.experience[entryIndex];
    if (!entry) return document;

    const highlights = entry.highlights.map((line, position) =>
      position === highlightIndex ? value : line
    );

    return {
      ...document,
      experience: document.experience.map((item, position) =>
        position === entryIndex ? { ...item, highlights } : item
      )
    };
  });

export const addHighlight = (locale: Locale, entryIndex: number) =>
  editDocument(locale, (document) => {
    const entry = document.experience[entryIndex];
    if (!entry) return document;

    return {
      ...document,
      experience: document.experience.map((item, position) =>
        position === entryIndex
          ? { ...item, highlights: [...item.highlights, ''] }
          : item
      )
    };
  });

export const removeHighlight = (
  locale: Locale,
  entryIndex: number,
  highlightIndex: number
) =>
  editDocument(locale, (document) => {
    const entry = document.experience[entryIndex];
    if (!entry) return document;

    return {
      ...document,
      experience: document.experience.map((item, position) =>
        position === entryIndex
          ? {
              ...item,
              highlights: item.highlights.filter(
                (_, line) => line !== highlightIndex
              )
            }
          : item
      )
    };
  });
