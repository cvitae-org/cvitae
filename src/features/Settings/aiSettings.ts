import { isProviderId, type ProviderId } from '@/libs/ai/providers';

/**
 * AI settings held in the browser and sent with each analysis request.
 *
 * `apiKeys` holds the user's own credentials, in full knowledge of what that
 * costs: localStorage is readable by any script on the page, so a key here is
 * exactly as safe as the page is. They are offered anyway because the
 * alternative is worse for the person they belong to — without them the only
 * ways to run the app are a local model or the operator's key, and neither is
 * something a user can choose for themselves. A key is never sent anywhere but
 * this app's own server, which forwards it to the chosen provider and keeps no
 * copy. Leaving one empty falls back to the server's env credential.
 *
 * Keyed by provider rather than held as one string, because a key belongs to
 * exactly one account at one company. A single field survived a change of
 * provider — switching reset the model and kept the credential — so an
 * OpenRouter key would be posted to OpenAI the moment the dropdown moved. That
 * is not a failed request; it is handing a live secret to a third party.
 */

export type AiSettings = {
  /** Empty means "use whatever AI_PROVIDER says on the server". */
  providerId: ProviderId | '';
  /** Drives CV customisation. Empty means the provider's default model. */
  modelId: string;
  /**
   * Drives structured extraction and faithful translation tasks, which only
   * copy or translate values already present and therefore run well on a
   * smaller, much faster model. Empty means reuse `modelId`.
   */
  extractionModelId: string;
  /** Only meaningful for the local provider. */
  localBaseUrl: string;
  /**
   * The user's own key per provider. A missing entry means "use the server's".
   *
   * The server refuses a key that arrives without a provider named, and refuses
   * one paired with a custom base URL — so a key can only ever reach the
   * provider it was entered for.
   */
  apiKeys: Partial<Record<ProviderId, string>>;
};

export const DEFAULT_LOCAL_BASE_URL = 'http://localhost:11434/v1';

export const defaultSettings: AiSettings = {
  providerId: '',
  modelId: '',
  extractionModelId: '',
  localBaseUrl: DEFAULT_LOCAL_BASE_URL,
  apiKeys: {}
};

/**
 * Reads the stored keys, discarding anything that is not a string under a known
 * provider id.
 *
 * The legacy single `apiKey` is carried over only when the settings also name
 * the provider it was being sent to. Without that, which account it belongs to
 * is unknowable from here, and guessing would reintroduce exactly the leak this
 * shape exists to prevent — so it is dropped, and the user re-enters it against
 * a provider.
 */
const readKeys = (parsed: Partial<AiSettings> & { apiKey?: unknown }) => {
  const keys: Partial<Record<ProviderId, string>> = {};

  if (parsed.apiKeys && typeof parsed.apiKeys === 'object') {
    Object.entries(parsed.apiKeys).forEach(([providerId, value]) => {
      if (isProviderId(providerId) && typeof value === 'string' && value.trim()) {
        keys[providerId] = value;
      }
    });
  }

  if (
    typeof parsed.apiKey === 'string' &&
    parsed.apiKey.trim() &&
    isProviderId(parsed.providerId) &&
    !keys[parsed.providerId]
  ) {
    keys[parsed.providerId] = parsed.apiKey;
  }

  return keys;
};

const STORAGE_KEY = 'cvitae.ai-settings.v1';

export const loadSettings = (): AiSettings => {
  if (typeof window === 'undefined') return defaultSettings;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;

    const parsed = JSON.parse(raw) as Partial<AiSettings> & { apiKey?: unknown };
    return {
      providerId: (parsed.providerId as AiSettings['providerId']) ?? '',
      modelId: typeof parsed.modelId === 'string' ? parsed.modelId : '',
      extractionModelId:
        typeof parsed.extractionModelId === 'string'
          ? parsed.extractionModelId
          : '',
      localBaseUrl:
        typeof parsed.localBaseUrl === 'string' && parsed.localBaseUrl
          ? parsed.localBaseUrl
          : DEFAULT_LOCAL_BASE_URL,
      apiKeys: readKeys(parsed)
    };
  } catch {
    return defaultSettings;
  }
};

export const saveSettings = (settings: AiSettings): boolean => {
  if (typeof window === 'undefined') return false;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
};

/** The subset sent to the API. Omitted keys let the server decide. */
export const toRequestOverride = (settings: AiSettings) => ({
  providerId: settings.providerId || undefined,
  modelId: settings.modelId.trim() || undefined,
  extractionModelId: settings.extractionModelId.trim() || undefined,
  baseURL:
    settings.providerId === 'local' ? settings.localBaseUrl.trim() : undefined,
  /*
   * Only the selected provider's own key, and only when a provider is selected
   * at all. Deferring to the server's provider means deferring to its key too:
   * the browser cannot know which company the server is configured to call, so
   * it has nothing it could safely send.
   */
  apiKey:
    settings.providerId === '' || settings.providerId === 'local'
      ? undefined
      : settings.apiKeys[settings.providerId]?.trim() || undefined
});
