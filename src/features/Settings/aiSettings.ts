import type { ProviderId } from '@/libs/ai/providers';

/**
 * AI settings held in the browser and sent with each analysis request.
 *
 * Deliberately holds no API keys: those stay in server-side env vars. A key in
 * localStorage is readable by any script on the page, and the server would have
 * to trust a browser-supplied credential. Settings here choose *which* provider
 * and model to use; the server supplies the secret for it.
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
};

export const DEFAULT_LOCAL_BASE_URL = 'http://localhost:11434/v1';

export const defaultSettings: AiSettings = {
  providerId: '',
  modelId: '',
  extractionModelId: '',
  localBaseUrl: DEFAULT_LOCAL_BASE_URL
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
          : DEFAULT_LOCAL_BASE_URL
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
    settings.providerId === 'local' ? settings.localBaseUrl.trim() : undefined
});
