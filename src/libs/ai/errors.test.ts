import { describe, expect, it } from 'vitest';
import {
  providerErrorDetail,
  rateLimitFromText,
  rateLimitOf
} from './errors';

/** The exact body OpenRouter returned while every row was failing to analyse. */
const upstreamThrottle = {
  statusCode: 429,
  message: 'Provider returned error',
  responseBody: JSON.stringify({
    error: {
      message: 'Provider returned error',
      code: 429,
      metadata: {
        raw: 'google/gemma-4-26b-a4b-it:free is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits: https://openrouter.ai/settings/integrations',
        provider_name: 'Google AI Studio',
        is_byok: false,
        limit_source: 'upstream_provider_shared_pool'
      }
    }
  })
};

describe('provider errors', () => {
  it('recovers the explanation OpenRouter hides behind "Provider returned error"', () => {
    const detail = providerErrorDetail(upstreamThrottle);
    expect(detail).toContain('429');
    expect(detail).toContain('Google AI Studio');
    expect(detail).toContain('temporarily rate-limited upstream');
  });

  it('reads through a wrapped error to the original response', () => {
    const wrapped = new Error('The "role" step failed', { cause: upstreamThrottle });
    expect(providerErrorDetail(wrapped)).toContain('temporarily rate-limited upstream');
    expect(rateLimitOf(wrapped)).toBe('busy');
  });

  it('falls back to the message when there is no structured body', () => {
    expect(providerErrorDetail(new Error('socket hang up'))).toBe('socket hang up');
  });

  it('classifies an upstream throttle as transient, not as a spent quota', () => {
    expect(rateLimitOf(upstreamThrottle)).toBe('busy');
  });

  /**
   * The two caps read almost identically, and the advice is opposite: one is a
   * sixty-second wait, the other is over until midnight UTC.
   */
  it('separates the per-minute cap from the per-day one', () => {
    expect(rateLimitFromText('Rate limit exceeded: free-models-per-min.')).toBe('busy');
    expect(rateLimitFromText('Rate limit exceeded: free-models-per-day.')).toBe('daily');
  });

  it('does not call an ordinary failure a rate limit', () => {
    expect(rateLimitOf(new Error('No object generated: could not parse the response.'))).toBeNull();
    expect(rateLimitFromText('The "role" step failed: Provider returned error')).toBeNull();
  });

  it('survives a self-referential cause chain', () => {
    const looping: { message: string; cause?: unknown } = { message: 'looping' };
    looping.cause = looping;
    expect(() => providerErrorDetail(looping)).not.toThrow();
    expect(rateLimitOf(looping)).toBeNull();
  });
});
