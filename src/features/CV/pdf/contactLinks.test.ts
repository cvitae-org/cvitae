import { describe, expect, it } from 'vitest';
import { uniqueContactLinks } from './contactLinks';
import { cvFixture } from '@/test/fixtures/evidence';
import type { CvDocument } from '../document';

const withLinks = (links: Record<string, string>): CvDocument => ({
  ...cvFixture(),
  personal: { ...cvFixture().personal, links }
});

/**
 * Regression: an imported CV carried the same destinations under a second set
 * of keys. The editor shows three fixed keys and hid them; this export reads
 * every value, so the header printed each address twice and React was handed
 * duplicate list keys.
 */
describe('ATS contact links', () => {
  it('keeps one entry per destination, in the order first written', () => {
    expect(
      uniqueContactLinks(
        withLinks({
          website: 'bendominik.eu',
          github: 'github.com/fijisoo',
          linkedin: 'linkedin.com/in/dominik-ben/',
          portfolio: 'bendominik.eu',
          source: 'github.com/fijisoo',
          profile: 'https://www.linkedin.com/in/dominik-ben/'
        })
      )
    ).toEqual([
      'bendominik.eu',
      'github.com/fijisoo',
      'linkedin.com/in/dominik-ben/'
    ]);
  });

  /** The copies are rarely byte-identical; scheme, www and a trailing slash differ. */
  it('treats the same destination written differently as one link', () => {
    expect(
      uniqueContactLinks(
        withLinks({ a: 'https://www.example.com/x/', b: 'example.com/x' })
      )
    ).toEqual(['https://www.example.com/x/']);
  });

  it('keeps genuinely different destinations', () => {
    expect(
      uniqueContactLinks(
        withLinks({ a: 'example.com/one', b: 'example.com/two' })
      )
    ).toEqual(['example.com/one', 'example.com/two']);
  });

  /**
   * The case that survived the first fix: two entries printing as the same
   * address but differing by a character that renders as nothing, picked up
   * from a paste or an import.
   */
  it('treats invisible differences as no difference', () => {
    expect(
      uniqueContactLinks(
        withLinks({
          website: 'bendominik.eu',
          portfolio: 'bendominik.eu\u200B',
          site: '\u00A0bendominik.eu ',
          home: 'bendominik.eu\uFEFF'
        })
      )
    ).toEqual(['bendominik.eu']);
  });

  it('drops blanks rather than printing an empty contact line', () => {
    expect(
      uniqueContactLinks(withLinks({ a: '   ', b: 'example.com' }))
    ).toEqual(['example.com']);
  });
});
