import { describe, expect, it } from 'vitest';
import { parseDocument } from './document';
import { LINK_SLOTS } from './links';
import { mergeDocument } from './merge';

const parseLinks = (links: Record<string, string>) =>
  parseDocument({
    personal: { name: 'X', email: 'x@y.z', phone: '', location: '', links }
  }).personal.links;

describe('contact link slots', () => {
  it('moves the CV’s old named keys into slots, in their usual order', () => {
    expect(
      parseLinks({
        github: 'github.com/me',
        linkedin: 'linkedin.com/in/me',
        website: 'me.dev'
      })
    ).toEqual({
      link1: 'me.dev',
      link2: 'github.com/me',
      link3: 'linkedin.com/in/me'
    });
  });

  /**
   * The reported case: an import added its own keys holding the same three
   * destinations, spelled differently. Three slots, three destinations.
   */
  it('folds an import’s duplicate keys into one slot each', () => {
    expect(
      parseLinks({
        website: 'bendominik.eu',
        github: 'github.com/fijisoo',
        linkedin: 'linkedin.com/in/dominik-ben/',
        portfolio: 'bendominik.eu',
        source: 'github.com/fijisoo',
        profile: 'https://www.linkedin.com/in/dominik-ben/'
      })
    ).toEqual({
      link1: 'bendominik.eu',
      link2: 'github.com/fijisoo',
      link3: 'linkedin.com/in/dominik-ben/'
    });
  });

  it('holds any address, not just the three it used to name', () => {
    const links = { link1: 'behance.net/me', link2: 'x.com/me', link3: 'me.substack.com' };
    expect(parseLinks(links)).toEqual(links);
  });

  /** Slots already written are authoritative; the map is not re-derived. */
  it('does not reshuffle a document that has been through here before', () => {
    expect(parseLinks({ link1: 'a.com', link3: 'c.com', website: 'legacy.com' })).toEqual({
      link1: 'a.com',
      link2: 'legacy.com',
      link3: 'c.com'
    });
  });

  it('keeps only as many links as there are slots', () => {
    const parsed = parseLinks({
      a: 'one.com', b: 'two.com', c: 'three.com', d: 'four.com'
    });
    expect(Object.keys(parsed)).toEqual([...LINK_SLOTS]);
    expect(parsed.link3).toBe('three.com');
  });
});

/**
 * The other two ways a link reaches the slots. Both used to fill by key name,
 * which cannot see that slot two of the incoming document holds what slot one
 * of this one already holds, spelled with a scheme and a trailing slash.
 */
describe('merging links into the slots', () => {
  const withLinks = (links: Record<string, string>) =>
    parseDocument({
      personal: { name: 'X', email: 'x@y.z', phone: '', location: '', links }
    });

  it('fills the free slots from an import, in order', () => {
    const { document, report } = mergeDocument(
      withLinks({ link1: 'me.dev' }),
      withLinks({ link1: 'github.com/me', link2: 'x.com/me' })
    );

    expect(document.personal.links).toEqual({
      link1: 'me.dev',
      link2: 'github.com/me',
      link3: 'x.com/me'
    });
    expect(report.filled).toEqual(
      expect.arrayContaining(['links.link2', 'links.link3'])
    );
  });

  /**
   * A slot taken here does not consume the incoming link that shares its index.
   * Position is where a link lands, not what identifies it, so an import's first
   * link takes the first free slot rather than being dropped for colliding.
   */
  it('does not lose an incoming link to an index that is already taken', () => {
    const { document } = mergeDocument(
      withLinks({ link1: 'me.dev' }),
      withLinks({ link1: 'github.com/me' })
    );

    expect(document.personal.links).toEqual({
      link1: 'me.dev',
      link2: 'github.com/me'
    });
  });

  it('does not spend a second slot on a link the CV already has', () => {
    const { document, report } = mergeDocument(
      withLinks({ link1: 'bendominik.eu' }),
      withLinks({ link2: 'https://www.bendominik.eu/' })
    );

    expect(document.personal.links).toEqual({ link1: 'bendominik.eu' });
    expect(report.filled).not.toContain('links.link2');
  });

  it('never overwrites a link already written', () => {
    const { document } = mergeDocument(
      withLinks({ link1: 'mine.dev', link2: 'github.com/me', link3: 'x.com/me' }),
      withLinks({ link1: 'theirs.dev', link2: 'github.com/them', link3: 'x.com/them' })
    );

    expect(document.personal.links).toEqual({
      link1: 'mine.dev',
      link2: 'github.com/me',
      link3: 'x.com/me'
    });
  });
});
