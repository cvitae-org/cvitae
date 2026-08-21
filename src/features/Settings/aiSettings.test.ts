import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCAL_BASE_URL,
  defaultSettings,
  loadSettings,
  saveSettings,
  toRequestOverride
} from './aiSettings';

const STORAGE_KEY = 'cvitae.ai-settings.v1';

/**
 * A localStorage of its own, because the suite runs on the node environment and
 * this module is one of the few browser-only ones worth testing. Cheaper than
 * pulling in a DOM implementation for a Map with four methods.
 */
const store = new Map<string, string>();

const localStorageStub = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear()
};

beforeAll(() => {
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: localStorageStub },
    configurable: true
  });
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

const settings = (patch: Partial<Parameters<typeof toRequestOverride>[0]> = {}) => ({
  ...defaultSettings,
  ...patch
});

describe('AI settings keys', () => {
  beforeEach(() => store.clear());

  /**
   * The regression this shape exists for: one key field survived a change of
   * provider, so moving the dropdown posted an OpenRouter credential to OpenAI.
   */
  it('never sends one provider’s key to another', () => {
    const stored = settings({
      providerId: 'openai',
      apiKeys: { openrouter: 'sk-or-secret' }
    });

    expect(toRequestOverride(stored).apiKey).toBeUndefined();
  });

  it('sends the key belonging to the selected provider', () => {
    const stored = settings({
      providerId: 'openrouter',
      apiKeys: { openrouter: 'sk-or-secret', openai: 'sk-openai-secret' }
    });

    expect(toRequestOverride(stored).apiKey).toBe('sk-or-secret');
  });

  /** Deferring to the server's provider means deferring to its key too. */
  it('sends no key when no provider is selected', () => {
    const stored = settings({
      providerId: '',
      apiKeys: { openrouter: 'sk-or-secret' }
    });

    expect(toRequestOverride(stored).apiKey).toBeUndefined();
  });

  it('sends no key to a local runner, which authenticates nothing', () => {
    const stored = settings({
      providerId: 'local',
      apiKeys: { openrouter: 'sk-or-secret' },
      localBaseUrl: DEFAULT_LOCAL_BASE_URL
    });

    const override = toRequestOverride(stored);
    expect(override.apiKey).toBeUndefined();
    expect(override.baseURL).toBe(DEFAULT_LOCAL_BASE_URL);
  });

  it('keeps a key per provider through a round-trip', () => {
    saveSettings(
      settings({ providerId: 'openai', apiKeys: { openai: 'sk-a', openrouter: 'sk-b' } })
    );

    expect(loadSettings().apiKeys).toEqual({ openai: 'sk-a', openrouter: 'sk-b' });
  });

  it('carries a legacy single key over to the provider it was being sent to', () => {
    localStorageStub.setItem(
      STORAGE_KEY,
      JSON.stringify({ providerId: 'openrouter', apiKey: 'sk-legacy' })
    );

    expect(loadSettings().apiKeys).toEqual({ openrouter: 'sk-legacy' });
  });

  /**
   * Which account an unscoped key belongs to cannot be known from the browser,
   * and guessing would reintroduce the leak. Dropping it costs one re-entry.
   */
  it('drops a legacy key that names no provider rather than guessing', () => {
    localStorageStub.setItem(
      STORAGE_KEY,
      JSON.stringify({ providerId: '', apiKey: 'sk-legacy' })
    );

    expect(loadSettings().apiKeys).toEqual({});
  });

  it('discards stored entries that are not keys of a known provider', () => {
    localStorageStub.setItem(
      STORAGE_KEY,
      JSON.stringify({
        providerId: 'openai',
        apiKeys: { openai: 'sk-a', 'evil-provider': 'sk-b', huggingface: 42 }
      })
    );

    expect(loadSettings().apiKeys).toEqual({ openai: 'sk-a' });
  });
});
