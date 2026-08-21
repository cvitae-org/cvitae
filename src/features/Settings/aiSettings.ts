import type { ProviderId } from '@/libs/ai/providers';

/**
 * AI settings held in the browser and sent with each analysis request.
 *
 * `apiKey` is the user's own credential, and it is held here in full knowledge
 * of what that costs: localStorage is readable by any script on the page, so a
 * key here is exactly as safe as the page is. It is offered anyway because the
 * alternative is worse for the person it belongs to — without it the only ways
 * to run the app are a local model or the operator's key, and neither is
 * something a user can choose for themselves. It is never sent anywhere but
 * this app's own server, which forwards it to the chosen provider and keeps no
 * copy. Leaving it empty falls back to the server's env credential.
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
   * The user's own provider key. Empty means "use the server's".
   *
   * Refused by the server when a custom base URL is also set, so it can never
   * be pointed at an endpoint other than the provider's own.
   */
  apiKey: string;
};

export const DEFAULT_LOCAL_BASE_URL = 'http://localhost:11434/v1';

export const defaultSettings: AiSettings = {
  providerId: '',
  modelId: '',
  extractionModelId: '',
  localBaseUrl: DEFAULT_LOCAL_BASE_URL,
  apiKey: ''
};

const STORAGE_KEY = 'cvitae.ai-settings.v1';

export const loadSettings = (): AiSettings => {
  if (typeof window === 'undefined') return defaultSettings;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;

    const parsed = JSON.parse(raw) as Partial<AiSettings>;
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
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : ''
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
  // Never sent alongside a base URL: the server refuses that pairing, and the
  // local provider needs no credential anyway.
  apiKey:
    settings.providerId === 'local' ? undefined : settings.apiKey.trim() || undefined
});
