/**
 * Reading what a provider actually said when a call failed.
 *
 * The AI SDK's `AI_APICallError.message` is whatever the provider put in
 * `error.message`, and for OpenRouter that is the constant string "Provider
 * returned error" — the same six words for a rate limit, a bad model id and an
 * upstream outage. The explanation is in the response body, one level down in
 * `error.metadata`, and it is specific and actionable:
 *
 *   "google/gemma-4-26b-a4b-it:free is temporarily rate-limited upstream.
 *    Please retry shortly, or add your own key to accumulate your rate limits"
 *
 * Throwing that away is what turned a five-second throttle into an unreadable
 * failure on every row. Nothing here may throw: it runs inside a catch block,
 * and an error while describing an error loses both.
 */

type ApiCallErrorish = {
  statusCode?: number;
  responseBody?: string;
  message?: string;
  cause?: unknown;
};

const asApiCallError = (error: unknown): ApiCallErrorish =>
  error && typeof error === 'object' ? (error as ApiCallErrorish) : {};

/** Walks `cause` links, since a wrapped error keeps the status on the original. */
const chainOf = (error: unknown): ApiCallErrorish[] => {
  const chain: ApiCallErrorish[] = [];
  let current: unknown = error;

  // Bounded rather than `while (current)`: a self-referential cause is rare but
  // an infinite loop inside error handling is unrecoverable.
  for (let depth = 0; depth < 8 && current; depth += 1) {
    const node = asApiCallError(current);
    chain.push(node);
    current = node.cause;
  }

  return chain;
};

type ProviderErrorBody = {
  error?: {
    message?: unknown;
    code?: unknown;
    metadata?: {
      raw?: unknown;
      provider_name?: unknown;
      limit_source?: unknown;
    };
  };
};

const parseBody = (body: unknown): ProviderErrorBody | null => {
  if (typeof body !== 'string' || !body.trim()) return null;
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as ProviderErrorBody) : null;
  } catch {
    return null;
  }
};

const asText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * A one-line explanation fit to show a person, drawn from the response body
 * where there is one and falling back to the message where there is not.
 */
export const providerErrorDetail = (error: unknown): string | undefined => {
  for (const node of chainOf(error)) {
    const body = parseBody(node.responseBody);
    const payload = body?.error;

    if (!payload) continue;

    const provider = asText(payload.metadata?.provider_name);
    const explanation = asText(payload.metadata?.raw) || asText(payload.message);

    if (!explanation) continue;

    const prefix = [
      node.statusCode ? String(node.statusCode) : '',
      provider ? `from ${provider}` : ''
    ]
      .filter(Boolean)
      .join(' ');

    return (prefix ? `${prefix}: ${explanation}` : explanation).slice(0, 500);
  }

  const message = chainOf(error)
    .map((node) => asText(node.message))
    .find(Boolean);

  return message ? message.slice(0, 500) : undefined;
};

/**
 * Which kind of "too many requests" this is, because the advice differs.
 *
 * A daily quota is spent until it resets; a shared-pool throttle clears in
 * seconds. Telling someone to come back at midnight UTC when the answer is
 * "press it again" is worse than saying nothing.
 */
export type RateLimitKind = 'daily' | 'busy';

/**
 * Only a limit that is spent for the rest of the day belongs here.
 *
 * OpenRouter's free tier caps both per minute and per day, and reports them in
 * the same sentence shape: "Rate limit exceeded: free-models-per-min" against
 * "...-per-day". Measured on this account, the one that actually stops a run of
 * offers is the per-minute cap — so matching loosely on "per" would tell
 * somebody to come back tomorrow when the wait is sixty seconds.
 */
const DAILY = /per[- ]day|\bdaily\b|free-models-per-day|quota/i;

/**
 * Classifies a rate limit from text alone.
 *
 * Needed because the analysis usually runs in cvitae-agent-runtime, and a
 * failure crossing that boundary arrives as a flattened string with no status
 * code and no response body left on it.
 */
export const rateLimitFromText = (text: string): RateLimitKind | null => {
  if (!/rate limit|429|too many requests|quota/i.test(text)) return null;
  return DAILY.test(text) ? 'daily' : 'busy';
};

export const rateLimitOf = (error: unknown): RateLimitKind | null => {
  for (const node of chainOf(error)) {
    const body = parseBody(node.responseBody);
    const is429 =
      node.statusCode === 429 || Number(body?.error?.code) === 429;

    if (!is429) continue;

    const haystack = [
      asText(body?.error?.metadata?.raw),
      asText(body?.error?.metadata?.limit_source),
      asText(body?.error?.message),
      asText(node.message)
    ].join(' ');

    return DAILY.test(haystack) ? 'daily' : 'busy';
  }

  // No structured body — fall back to the text, which is all an older provider
  // package or a plain fetch failure leaves behind.
  return rateLimitFromText(
    chainOf(error)
      .map((node) => asText(node.message))
      .join(' ')
  );
};
