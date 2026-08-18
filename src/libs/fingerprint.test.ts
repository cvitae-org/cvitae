import { describe, expect, it } from 'vitest';
import { fingerprintContent, stableSerialize } from './fingerprint';

describe('content fingerprints', () => {
  it('is stable across object key ordering and Unicode normalization', () => {
    expect(fingerprintContent({ b: 2, a: 'Ż' })).toBe(
      fingerprintContent({ a: 'Z\u0307', b: 2 })
    );
    expect(stableSerialize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it('changes when nested content changes', () => {
    expect(fingerprintContent({ a: ['React'] })).not.toBe(
      fingerprintContent({ a: ['React', 'TypeScript'] })
    );
  });
});
