import type { Locale } from '@/libs/i18n/config';
import { defaultLocale } from '@/libs/i18n/config';

/**
 * The clause a CV closes with, and the two decisions behind it.
 *
 * This used to be `cv.document.footer` in `messages/*.json`, holding "for
 * references and additional information, please contact me". That was the wrong
 * place for it twice over. It was interface text printed as content — the same
 * mistake the skill-group headings made, and corrected the same way: what is
 * printed on the CV travels with the CV. And what it said was already on the
 * page, a few centimetres above, in the header's phone number and address.
 *
 * What replaced it is the RODO clause, which is the one thing at the bottom of
 * a Polish CV that does work. Since the May 2019 amendment to art. 22¹ KP the
 * data the Labour Code lists — name, contact, education, employment history —
 * needs no consent for the recruitment being applied to. Consent is the basis
 * for what is *outside* that list, which on this CV means the photograph, and
 * for being kept on file after this vacancy closes. Hence two switches and not
 * one: the base clause covers the picture, and `future` is the separate
 * decision to stay in the database.
 *
 * Composed rather than concatenated. The two languages do not extend the same
 * way — Polish appends a phrase to a noun that does not change, English has to
 * pluralise "process" and reach back into "this" — so a `base + suffix` pair
 * would produce a sentence that is wrong in exactly one of them.
 */

export type ConsentOptions = {
  /** Consent to be kept on file for vacancies other than this one. */
  future: boolean;
};

const CLAUSES: Record<Locale, (options: ConsentOptions) => string> = {
  en: ({ future }) =>
    'I consent to the processing of my personal data, including my ' +
    `photograph, for the purposes of this${future ? ' and future' : ''} ` +
    `recruitment process${future ? 'es' : ''}.`,
  pl: ({ future }) =>
    'Wyrażam zgodę na przetwarzanie moich danych osobowych zawartych w tym ' +
    'CV, w tym wizerunku, na potrzeby prowadzonej rekrutacji' +
    `${future ? ' oraz przyszłych procesów rekrutacyjnych' : ''}.`
};

/** The clause for one combination of switches, in one language. */
export const consentClause = (
  locale: Locale,
  options: ConsentOptions
): string => (CLAUSES[locale] ?? CLAUSES[defaultLocale])(options);

/** Every combination, for matching a stored clause back to its switches. */
const COMBINATIONS: ConsentOptions[] = [{ future: true }, { future: false }];

/**
 * Which switches produced this text, or `null` if a person has since typed
 * something of their own.
 *
 * The editor needs the distinction: a clause it recognises can have a checkbox
 * toggled without losing anything, while custom wording is the author's and
 * replacing it silently would be the modal quietly discarding their sentence.
 *
 * Whitespace-insensitive because the textarea is free text and a trailing
 * newline is not an edit anybody meant to make.
 */
export const matchConsentPreset = (
  locale: Locale,
  value: string
): ConsentOptions | null => {
  const text = value.trim();
  return (
    COMBINATIONS.find(
      (options) => consentClause(locale, options).trim() === text
    ) ?? null
  );
};

/**
 * What a CV carries when nobody has said otherwise.
 *
 * Both switches on, matching what every document written before this field
 * existed already printed. `parseDocument` reads this for exactly those
 * documents — and only when the key is absent, never when it is present and
 * empty, because an emptied clause is a decision and refilling it would be this
 * module overruling it. Same rule `parseState` applies to a cleared CV.
 */
export const defaultConsent = (locale: Locale): string =>
  consentClause(locale, { future: true });
