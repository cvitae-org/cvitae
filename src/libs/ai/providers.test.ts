import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiConfigError, assertLoopbackUrl, resolveModel } from './providers';

const CLIENT_KEY = 'sk-client-supplied-key';

describe('model resolution with a caller-supplied key', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('runs without a server key when the caller brings their own', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');

    await expect(
      resolveModel({ providerId: 'openrouter', apiKey: CLIENT_KEY })
    ).resolves.toMatchObject({ providerId: 'openrouter' });
  });

  it('still refuses when neither the server nor the caller has a key', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');

    await expect(resolveModel({ providerId: 'openrouter' })).rejects.toBeInstanceOf(
      AiConfigError
    );
  });

  /**
   * The pairing is the danger: a credential the caller supplies, aimed at an
   * endpoint the caller also supplies, makes this server post someone's key
   * wherever it is told to.
   */
  it('refuses a caller key aimed at a caller-supplied endpoint', async () => {
    await expect(
      resolveModel({
        providerId: 'local',
        apiKey: CLIENT_KEY,
        baseURL: 'http://localhost:11434/v1'
      })
    ).rejects.toBeInstanceOf(AiConfigError);
  });

  /**
   * The cache is process-wide. Handing back a cached client that was built with
   * one caller's credential would authenticate the next caller as them.
   */
  it('never reuses a client-keyed model instance between callers', async () => {
    const first = await resolveModel({
      providerId: 'openrouter',
      apiKey: 'sk-caller-one'
    });
    const second = await resolveModel({
      providerId: 'openrouter',
      apiKey: 'sk-caller-two'
    });

    expect(first.model).not.toBe(second.model);
  });

  it('still caches when the server key is the one being used', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-server');

    const first = await resolveModel({ providerId: 'openrouter' });
    const second = await resolveModel({ providerId: 'openrouter' });

    expect(first.model).toBe(second.model);
  });

  it('keeps the loopback guard on local base URLs', () => {
    expect(() => assertLoopbackUrl('http://evil.example.com/v1')).toThrow(
      AiConfigError
    );
    expect(assertLoopbackUrl('http://localhost:20128/v1')).toBe(
      'http://localhost:20128/v1'
    );
  });
});
