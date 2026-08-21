import { describe, expect, it } from 'vitest';
import { atsExpectedText } from './AtsPdfDocument';
import { cvFixture } from '@/test/fixtures/evidence';
import type { CvDocument, CvExperience } from '../document';

const job = (company: string, bullets: string[]): CvExperience => ({
  company,
  title: `${company} Engineer`,
  started: 'January 2020',
  finished: 'January 2021',
  highlights: bullets,
  skills: []
});

/**
 * Regression: a rule dropped the bullets of the fifth role onward when it had
 * two or fewer of them — from the rendered page and from this text, so an ATS
 * reading the file never saw them. Seven roles, the last three thin, is the
 * shape that triggered it.
 */
describe('ATS text layer', () => {
  const document: CvDocument = {
    ...cvFixture(),
    experience: [
      job('One', ['a one', 'a two', 'a three']),
      job('Two', ['b one', 'b two', 'b three']),
      job('Three', ['c one', 'c two', 'c three']),
      job('Four', ['d one', 'd two', 'd three']),
      job('Five', ['e one', 'e two']),
      job('Six', ['f one']),
      job('Seven', ['g one', 'g two'])
    ]
  };

  it('carries every bullet of every role, however late or thin', () => {
    const text = atsExpectedText(document, 'en');

    for (const entry of document.experience) {
      expect(text, entry.company).toContain(entry.company);
      for (const bullet of entry.highlights) {
        expect(text, `${entry.company}: ${bullet}`).toContain(bullet);
      }
    }
  });

  it('carries the companies and dates alongside them', () => {
    const text = atsExpectedText(document, 'en');
    expect(text).toContain('Seven Engineer');
    expect(text).toContain('January 2021');
  });
});
