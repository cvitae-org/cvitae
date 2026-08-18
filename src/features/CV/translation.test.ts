import { describe, expect, it } from 'vitest';
import en from './seed/en.json';
import pl from './seed/pl.json';
import { parseDocument } from './document';
import {
  CV_TRANSLATION_SECTIONS,
  isEmptyTranslationReport,
  mergeTranslatedGaps,
  sectionHasTranslationGaps
} from './translation';

const english = () => parseDocument(en, 'en');
const polish = () => parseDocument(pl, 'pl');
const allSections = CV_TRANSLATION_SECTIONS.map((section) => section.key);

describe('mergeTranslatedGaps', () => {
  it('does nothing when the target already has the same complete structure', () => {
    const target = polish();
    const result = mergeTranslatedGaps(target, english(), polish(), allSections);

    expect(isEmptyTranslationReport(result.report)).toBe(true);
    expect(result.document).toEqual(target);
  });

  it('fills missing prose and list positions without replacing existing wording', () => {
    const target = polish();
    const originalSummary = target.role_description;
    target.role_description = '';
    target.skills.groups[0]?.items.pop();
    target.experience[0]?.highlights.pop();

    const result = mergeTranslatedGaps(target, english(), polish(), allSections);

    expect(result.document.role_description).toBe(originalSummary);
    expect(result.document.skills.groups[0]?.items).toEqual(
      polish().skills.groups[0]?.items
    );
    expect(result.document.experience[0]?.highlights).toEqual(
      polish().experience[0]?.highlights
    );
    expect(result.report.added.skills).toBe(1);
    expect(result.report.added.highlights).toBe(1);
    expect(result.report.filled).toContain('role_description');
  });

  it('restores a missing middle job at the source position', () => {
    const target = polish();
    const expected = target.experience[2];
    target.experience.splice(2, 1);

    const result = mergeTranslatedGaps(
      target,
      english(),
      polish(),
      ['experience']
    );

    expect(result.report.added.experience).toBe(1);
    expect(result.document.experience[2]).toEqual(expected);
    expect(result.document.experience).toHaveLength(polish().experience.length);
  });

  it('respects the selected sections', () => {
    const target = polish();
    target.role_description = '';
    target.experience[0]?.highlights.pop();

    const result = mergeTranslatedGaps(
      target,
      english(),
      polish(),
      ['role_description']
    );

    expect(result.document.role_description).toBe(polish().role_description);
    expect(result.document.experience[0]?.highlights).toHaveLength(4);
    expect(sectionHasTranslationGaps(target, english(), 'experience')).toBe(true);
  });
});
