/** Stable JSON: object key order and undefined values cannot change a fingerprint. */
const canonical = (value: unknown): string => {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'));
  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  }
  return 'null';
};

const fnv = (value: string, seed: number): string => {
  let result = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
};

/**
 * A fast content fingerprint for local staleness detection.
 * It is not presented as a security digest; two independently seeded hashes
 * make accidental collisions sufficiently remote for browser-held documents.
 */
export const fingerprintContent = (value: unknown): string => {
  const serialized = canonical(value);
  return `fp-v1-${fnv(serialized, 0x811c9dc5)}${fnv(serialized, 0x9e3779b9)}`;
};

export const stableSerialize = canonical;
