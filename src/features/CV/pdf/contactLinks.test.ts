import { describe, expect, it } from 'vitest';
import { uniqueContactLinks } from './contactLinks';
import { cvFixture } from '@/test/fixtures/evidence';
import type { CvDocument } from '../document';

const withLinks = (links: Record<string, string>): CvDocument => ({
  ...cvFixture(),
  personal: { ...cvFixture().personal, links }
});

describe('ATS contact links', () => {
  it('renders the three slots, in order, whatever they hold', () => {
    expect(
      uniqueContactLinks(
        withLinks({
          link1: 'behance.net/me',
          link2: 'dribbble.com/me',
          link3: 'medium.com/@me'
        })
      )
    ).toEqual(['behance.net/me', 'dribbble.com/me', 'medium.com/@me']);
  });

  /**
   * The regression this contract exists for: an import's own key names produced
   * links the editor could not show and this export printed anyway.
   */
  it('ignores anything stored outside a slot', () => {
    expect(
      uniqueContactLinks(
        withLinks({
          link1: 'bendominik.eu',
          portfolio: 'bendominik.eu',
          source: 'github.com/fijisoo'
        })
      )
    ).toEqual(['bendominik.eu']);
  });

  it('skips an empty slot without leaving a gap', () => {
    expect(
      uniqueContactLinks(withLinks({ link1: 'example.com', link2: '  ', link3: 'other.com' }))
    ).toEqual(['example.com', 'other.com']);
  });

  /** A floor, for documents handed straight from a generation rather than storage. */
  it('still prints one entry per destination if two slots agree', () => {
    expect(
      uniqueContactLinks(
        withLinks({ link1: 'https://www.example.com/x/', link2: 'example.com/x' })
      )
    ).toEqual(['https://www.example.com/x/']);
  });
});
