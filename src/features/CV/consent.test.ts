import { describe, expect, it } from 'vitest';
import { consentClause, defaultConsent, matchConsentPreset } from './consent';
import { parseDocument, emptyDocument } from './document';

describe('consent clause', () => {
  /**
   * The reason the two languages are composed and not concatenated: English
   * has to reach back into "this" and pluralise "process", Polish appends a
   * phrase and leaves the rest alone. A shared `base + suffix` would produce
   * "this recruitment processes" in one of them.
   */
  it('reads as one sentence with the future clause on or off', () => {
    expect(consentClause('en', { future: false })).toBe(
      'I consent to the processing of my personal data, including my ' +
        'photograph, for the purposes of this recruitment process.'
    );
    expect(consentClause('en', { future: true })).toBe(
      'I consent to the processing of my personal data, including my ' +
        'photograph, for the purposes of this and future recruitment processes.'
    );
    expect(consentClause('pl', { future: false })).toBe(
      'Wyrażam zgodę na przetwarzanie moich danych osobowych zawartych w tym ' +
        'CV, w tym wizerunku, na potrzeby prowadzonej rekrutacji.'
    );
    expect(consentClause('pl', { future: true })).toBe(
      'Wyrażam zgodę na przetwarzanie moich danych osobowych zawartych w tym ' +
        'CV, w tym wizerunku, na potrzeby prowadzonej rekrutacji oraz ' +
        'przyszłych procesów rekrutacyjnych.'
    );
  });

  it('recognises its own output, so the boxes reflect the text', () => {
    for (const locale of ['en', 'pl'] as const) {
      for (const future of [true, false]) {
        expect(matchConsentPreset(locale, consentClause(locale, { future })),
          `${locale} future=${future}`
        ).toEqual({ future });
      }
    }
  });

  it('treats edited and empty text as nobody\'s preset', () => {
    expect(matchConsentPreset('en', '')).toBeNull();
    expect(matchConsentPreset('en', 'References available on request.')).toBeNull();
    // One word changed is custom wording, not a near-match to be snapped back.
    expect(
      matchConsentPreset(
        'en',
        consentClause('en', { future: true }).replace('photograph', 'portrait')
      )
    ).toBeNull();
  });

  /** The textarea is free text; a trailing newline is not an edit. */
  it('ignores surrounding whitespace when matching', () => {
    expect(
      matchConsentPreset('pl', `\n  ${consentClause('pl', { future: true })}  \n`)
    ).toEqual({ future: true });
  });
});

describe('reading the clause out of storage', () => {
  /**
   * Absent and empty have to end differently, or the field cannot be cleared:
   * every document written before this existed printed a clause and must keep
   * one, while a person who deleted theirs must not have it grow back on the
   * next read. Same rule `parseState` applies to a CV cleared by hand.
   */
  it('gives a document written before the field the default clause', () => {
    const { consent, ...withoutConsent } = emptyDocument();
    void consent;

    expect(parseDocument(withoutConsent, 'pl').consent).toBe(defaultConsent('pl'));
    expect(parseDocument(withoutConsent, 'en').consent).toBe(defaultConsent('en'));
  });

  it('keeps a clause that was deliberately emptied', () => {
    expect(parseDocument({ ...emptyDocument(), consent: '' }, 'pl').consent).toBe('');
  });

  it('keeps wording of the author\'s own', () => {
    const mine = 'Dane przetwarzam wyłącznie na potrzeby tej rekrutacji.';

    expect(parseDocument({ ...emptyDocument(), consent: mine }, 'pl').consent).toBe(mine);
  });

  /** The parser must not throw on a hand-edited payload, this field included. */
  it('falls back to the default when the stored value is not text', () => {
    expect(parseDocument({ consent: 42 }, 'en').consent).toBe('');
  });
});
