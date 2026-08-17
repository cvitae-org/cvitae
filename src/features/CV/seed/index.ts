import type { Locale } from '@/libs/i18n/config';
import { locales } from '@/libs/i18n/config';
import { emptyDocument, parseDocument, type CvDocument, type CvState } from '../document';
import en from './en.json';
import pl from './pl.json';

/**
 * The CV each language starts with.
 *
 * These used to live in `messages/en.json` and `messages/pl.json`, and did not
 * belong there. A messages file holds strings that differ *because the
 * interface is in another language* — "Work Experience" against "Doświadczenie
 * Zawodowe". A CV's job history is not that. The Polish CV is written rather
 * than translated, so the two files have no key whose Polish value is a
 * rendering of its English one; they are two documents that happen to describe
 * the same person. Keeping them under `cv.experience` meant the answer to "what
 * language is the interface in" and "which CV am I reading" came from one
 * switch, and adding a third language would have meant writing a CV into a
 * translations file.
 *
 * So they are documents here, in the shape everything else already speaks:
 * what `extract_cv` produces, what `POST /document` accepts, and what the store
 * holds. An import replaces one wholesale; nothing has to translate between
 * formats.
 *
 * They are also the only copy of this CV that is not in a browser. That is the
 * point as much as the seeding is — IndexedDB is cleared by a setting nobody
 * thinks twice about, and until import lands there would otherwise be no way
 * back.
 */

/**
 * Deliberately partial: a locale with no seed is a CV not yet written, which is
 * allowed. Adding a language should mean adding a file when there is something
 * to put in it, not a migration the moment the locale exists.
 */
const documents: Partial<Record<Locale, unknown>> = { en, pl };

/**
 * Run through the same parser as stored and imported documents.
 *
 * These are hand-editable JSON — that is most of why they are JSON — so they
 * get no more trust than anything else read from outside. `parseDocument` is
 * already defensive and cannot throw, which means a mistake in a seed file
 * costs that field rather than the page.
 */
export const seedDocument = (locale: Locale): CvDocument =>
  locale in documents
    ? parseDocument(documents[locale], locale)
    : emptyDocument();

export const seedState = (): CvState =>
  Object.fromEntries(
    locales.map((locale) => [locale, seedDocument(locale)])
  ) as CvState;
