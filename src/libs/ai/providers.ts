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
    // Free tier. Picked over gemma-4-31b-it:free because only the MoE variant
    // advertises `structured_outputs`, which generateObject depends on.
    defaultModel: 'google/gemma-4-26b-a4b-it:free',
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
 * No API key is ever accepted from the client — credentials stay in env.
 */
export type ModelOverride = {
  providerId?: unknown;
  modelId?: unknown;
  /** Small-model override for extraction; resolved as a second model. */
  extractionModelId?: unknown;
  baseURL?: unknown;
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
  baseURL: string | undefined
): Promise<LanguageModel> => {
  const provider = providers[providerId];
  const needsKey = provider.apiKeyEnvVar !== '';
  const apiKey = needsKey
    ? process.env[provider.apiKeyEnvVar]?.trim()
    : // Local runners ignore the value but the SDK still sends the header.
      'local';

  if (needsKey && !apiKey) {
    throw new AiConfigError(
      `Missing ${provider.apiKeyEnvVar}. It is required when the provider is "${providerId}" (${provider.label}).`
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
