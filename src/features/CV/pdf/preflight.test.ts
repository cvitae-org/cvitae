import { describe, expect, it } from 'vitest';
import {
  meaningfulTokenRecovery,
  meaningfulTokenRecoveryDetails,
  withoutSeparatelyVerifiedLines
} from './preflight';

describe('meaningful PDF token recovery', () => {
  it('reports missing duplicate tokens and counts', () => {
    const result = meaningfulTokenRecoveryDetails(
      'React React TypeScript 40%',
      'React TypeScript'
    );

    expect(result).toEqual({
      recovery: 0.5,
      expectedCount: 4,
      recoveredCount: 2,
      missingTokens: [
        { token: 'react', count: 1 },
        { token: '40', count: 1 }
      ]
    });
  });

  it('normalizes Unicode before matching Polish text', () => {
    expect(
      meaningfulTokenRecovery('Żółć doświadczenie', 'Żółć'.normalize('NFD') + ' doświadczenie')
    ).toBe(1);
  });

  it('does not count a wrapped HTTP URL as missing prose', () => {
    expect(
      meaningfulTokenRecovery(
        'Portfolio https://example.com/a-very-long/path Built React interfaces',
        'Portfolio Built React interfaces'
      )
    ).toBe(1);
  });

  it('excludes only the independently verified occurrence of repeated text', () => {
    expect(
      withoutSeparatelyVerifiedLines(
        'Frontend Developer\nFrontend Developer\nWork Experience',
        ['Frontend Developer']
      )
    ).toBe('Frontend Developer\nWork Experience');
  });
});
