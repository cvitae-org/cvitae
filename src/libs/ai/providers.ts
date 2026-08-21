import type { LanguageModel } from 'ai';

type OpenAIImport = typeof import('@ai-sdk/openai');
type OpenAICompatibleImport = typeof import('@ai-sdk/openai-compatible');

export const providerIds = [
  'openrouter',
  'huggingface',
  'openai',
  'local'
] as const;
export type ProviderId = (typeof providerIds)[number];

type ProviderDefinition = {
  label: string;
  /**
   * Omitted for OpenAI proper, which goes through the native provider package
   * instead of the OpenAI-compatible one.
   */
  baseURL?: string;
  /** Empty for providers that need no credential, i.e. a local server. */
  apiKeyEnvVar: string;
  defaultModel: string;
  /**
   * Whether the default model honours `response_format: json_schema`.
   * generateObject falls back to plain JSON mode when this is false, which is
   * looser and occasionally returns malformed objects.
   */
  supportsStructuredOutputs: boolean;
};

export const providers = {
  openrouter: {
    label: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    /**
     * Free tier, and the choice has to be re-checked rather than assumed.
     *
     * This was `google/gemma-4-26b-a4b-it:free`, picked because it was then the
     * only Gemma variant advertising `structured_outputs`. It no longer
     * advertises it — neither Gemma free variant does — and generateObject
     * against it fails with "No object generated: could not parse the
     * response". The catalogue moved; the constant did not.
     *
     * Of the six free models that still advertise `structured_outputs`, only
     * two completed a real offer analysis when measured end to end: this one
     * (2 of 3 attempts) and `liquid/lfm-2.5-2.6b:free` (3 of 3, but 2.6B is
     * thin for CV customisation). The others returned unparseable objects or
     * were refused outright by their upstream.
     *
     * Free models are rate-limited per minute, so a run of offers will still
     * hit a wall — `/api/ai/models` lists the current alternatives so the
     * choice can be made from live data instead of from this comment.
     */
    defaultModel: 'nvidia/nemotron-nano-9b-v2:free',
    supportsStructuredOutputs: true
  },
  huggingface: {
    label: 'Hugging Face',
    baseURL: 'https://router.huggingface.co/v1',
    apiKeyEnvVar: 'HF_TOKEN',
    // Served by the publicai provider at $0.40/M tokens both directions, drawn
    // from the account's monthly credits ($0.10 free, $2.00 on PRO).
    defaultModel: 'speakleash/Bielik-11B-v3.0-Instruct',
    supportsStructuredOutputs: true
  },
  openai: {
    label: 'OpenAI',
    baseURL: undefined,
    apiKeyEnvVar: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    supportsStructuredOutputs: true
  },
  local: {
    label: 'Local server',
    // Ollama's OpenAI-compatible endpoint. LM Studio uses :1234/v1, llama.cpp
    // and vLLM :8080/v1 — all overridable from Settings.
    baseURL: 'http://localhost:11434/v1',
    // Local servers accept any bearer token, so there is no secret to manage.
    apiKeyEnvVar: '',
    defaultModel: 'gemma4:12b',
    supportsStructuredOutputs: true
  }
} satisfies Record<ProviderId, ProviderDefinition>;

export const defaultProviderId: ProviderId = 'openrouter';

export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiConfigError';
  }
}

export const isProviderId = (value: unknown): value is ProviderId =>
  typeof value === 'string' && (providerIds as readonly string[]).includes(value);

export const resolveProviderId = (): ProviderId => {
  const configured = process.env.AI_PROVIDER?.trim();

  if (!configured) {
    return defaultProviderId;
  }

  if (!isProviderId(configured)) {
    throw new AiConfigError(
      `Unknown AI_PROVIDER "${configured}". Supported values: ${providerIds.join(', ')}.`
    );
  }

  return configured;
};

/**
 * Settings sent by the browser to override the server's env configuration.
 *
 * `apiKey` reverses what this comment used to say, and the reversal is
 * deliberate rather than a relaxation. The old rule — credentials live in env,
 * never in the browser — is the right rule when the server's key is the one
 * being spent, because a key in localStorage is readable by any script on the
 * page and the server would be trusting a caller-supplied credential.
 *
 * It is the wrong rule when the *user's own* key is the one being spent. Then
 * there is no server key to protect, the only key at risk belongs to the person
 * who typed it, and refusing to carry it means the only ways to use the app are
 * running a model locally or spending the operator's money. Three constraints
 * keep the reversal narrow:
 *
 *   - a client key is never persisted server-side and never logged;
 *   - a client key is never combined with a client-supplied base URL, or the
 *     key could be aimed at a server of the caller's choosing;
 *   - a model built with a client key is never cached, so one request's
 *     credential cannot be reused by the next caller's request.
 */
export type ModelOverride = {
  providerId?: unknown;
  modelId?: unknown;
  /** Small-model override for extraction; resolved as a second model. */
  extractionModelId?: unknown;
  baseURL?: unknown;
  /** The caller's own provider credential. Never stored, never logged. */
  apiKey?: unknown;
};

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * The base URL arrives from the browser, so the server would otherwise fetch
 * whatever a caller names — an SSRF hole, and a worse one when deployed inside
 * a private network. Restricting it to loopback covers every local runner
 * (Ollama, LM Studio, llama.cpp, vLLM) while making the setting inert anywhere
 * the server is not the user's own machine.
 */
export const assertLoopbackUrl = (value: string): string => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new AiConfigError(`"${value}" is not a valid URL.`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AiConfigError('The local server URL must be http or https.');
  }

  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new AiConfigError(
      `The local server URL must point at localhost, not "${url.hostname}".`
    );
  }

  return url.toString().replace(/\/$/, '');
};

let openaiModulePromise: Promise<OpenAIImport> | null = null;
const loadOpenAIModule = async (): Promise<OpenAIImport> => {
  if (!openaiModulePromise) {
    openaiModulePromise = import('@ai-sdk/openai');
  }
  return openaiModulePromise;
};

let openaiCompatibleModulePromise: Promise<OpenAICompatibleImport> | null = null;
const loadOpenAICompatibleModule = async (): Promise<OpenAICompatibleImport> => {
  if (!openaiCompatibleModulePromise) {
    openaiCompatibleModulePromise = import('@ai-sdk/openai-compatible');
  }
  return openaiCompatibleModulePromise;
};

const modelCache = new Map<string, Promise<LanguageModel>>();

const buildModel = async (
  providerId: ProviderId,
  modelId: string,
  baseURL: string | undefined,
  clientKey?: string
): Promise<LanguageModel> => {
  const provider = providers[providerId];
  const needsKey = provider.apiKeyEnvVar !== '';
  const apiKey = needsKey
    ? clientKey || process.env[provider.apiKeyEnvVar]?.trim()
    : // Local runners ignore the value but the SDK still sends the header.
      'local';

  if (needsKey && !apiKey) {
    throw new AiConfigError(
      `Missing ${provider.apiKeyEnvVar}. Set it on the server, or enter your own key in Settings, to use "${providerId}" (${provider.label}).`
    );
  }

  if (!provider.baseURL) {
    const { createOpenAI } = await loadOpenAIModule();
    return createOpenAI({ apiKey })(modelId);
  }

  const { createOpenAICompatible } = await loadOpenAICompatibleModule();

  return createOpenAICompatible({
    name: providerId,
    baseURL: baseURL ?? provider.baseURL,
    apiKey,
    supportsStructuredOutputs: provider.supportsStructuredOutputs
  })(modelId);
};

export type ResolvedModel = {
  providerId: ProviderId;
  modelId: string;
  model: LanguageModel;
};

/**
 * Resolves the model selected by `AI_PROVIDER` (and optionally `AI_MODEL`).
 * Instances are cached per provider/model pair so repeated requests reuse the
 * same client.
 */
export const resolveModel = async (
  override: ModelOverride = {}
): Promise<ResolvedModel> => {
  let providerId: ProviderId;

  if (override.providerId !== undefined && override.providerId !== '') {
    if (!isProviderId(override.providerId)) {
      throw new AiConfigError(
        `Unknown provider "${String(override.providerId)}". Supported: ${providerIds.join(', ')}.`
      );
    }
    providerId = override.providerId;
  } else {
    providerId = resolveProviderId();
  }

  const overrideModel =
    typeof override.modelId === 'string' ? override.modelId.trim() : '';
  const modelId =
    overrideModel ||
    process.env.AI_MODEL?.trim() ||
    providers[providerId].defaultModel;

  // Only the local provider may be repointed; the hosted ones have fixed
  // endpoints and accepting a URL for them would be an open proxy.
  const overrideBaseUrl =
    providerId === 'local' && typeof override.baseURL === 'string'
      ? override.baseURL.trim()
      : '';
  const baseURL = overrideBaseUrl
    ? assertLoopbackUrl(overrideBaseUrl)
    : undefined;

  const clientKey =
    typeof override.apiKey === 'string' ? override.apiKey.trim() : '';

  // A caller-supplied key aimed at a caller-supplied endpoint is a way to make
  // this server post someone's credential wherever it is told to. The two are
  // individually reasonable and jointly are not, so they are refused together.
  if (clientKey && overrideBaseUrl) {
    throw new AiConfigError(
      'A base URL cannot be combined with your own API key.'
    );
  }

  // Never cached. The cache is process-wide and keyed by provider and model, so
  // caching a client-keyed client would hand the next caller a model instance
  // authenticated as this one.
  if (clientKey) {
    return {
      providerId,
      modelId,
      model: await buildModel(providerId, modelId, baseURL, clientKey)
    };
  }

  const cacheKey = `${providerId}:${modelId}:${baseURL ?? ''}`;

  let modelPromise = modelCache.get(cacheKey);

  if (!modelPromise) {
    modelPromise = buildModel(providerId, modelId, baseURL);
    modelCache.set(cacheKey, modelPromise);
    // A failed build (e.g. a missing key) must not be cached, or the process
    // keeps serving the rejection after the environment is fixed.
    modelPromise.catch(() => modelCache.delete(cacheKey));
  }

  return { providerId, modelId, model: await modelPromise };
};
