/**
 * Talks to cvitae-agent-runtime, when it is running.
 *
 * The runtime is a separate process, so this is written to be absent — the same
 * shape as `scraperClient`, and for the same reason. If it is not listening, the
 * caller falls back to cvitae's in-process pipeline and behaves exactly as it
 * did before. Starting it is an upgrade, not a dependency. `RUNTIME_URL=`
 * (empty) disables the attempt entirely.
 *
 * What it buys is that the provider credentials, the prompts and the store stop
 * living in the Next.js server. What it costs is a second process to run, which
 * is why the fallback exists for as long as both paths do.
 *
 * The rule about *when* to fall back is lifted from `scraperClient` because that
 * file already got it right: decide on the body, never on the HTTP code. Every
 * outcome the runtime names is its final answer — a 500 for a missing API key is
 * the runtime working correctly and telling us its configuration is broken, and
 * quietly re-running the offer through cvitae's own provider would hide exactly
 * the fault the migration needs to surface. Only silence means "fall back".
 */

import { readSseStream } from './sse';

const DEFAULT_URL = 'http://127.0.0.1:8788';

/**
 * Long enough to reach a process on loopback that may be resolving a model for
 * the first time, short enough that a runtime which is up but wedged does not
 * consume the caller's whole budget before the fallback gets a turn. The run
 * itself is bounded separately, by the `timeoutMs` sent with the request.
 */
const CONNECT_TIMEOUT_MS = 5_000;

/** Mirrors the runtime's `RunResult`. */
export type RunResult<T = Record<string, unknown>> = {
  capability: string;
  data: T;
  /** Non-critical steps that failed. Empty on a clean run. */
  degraded: string[];
  elapsedMs: number;
};

export type RuntimeOutcome<T = Record<string, unknown>> =
  /** The runtime ran the capability. */
  | { status: 'ok'; result: RunResult<T> }
  /**
   * The runtime is not reachable or is switched off. This says nothing about
   * the request, so the caller should fall back and behave as cvitae always did.
   */
  | { status: 'unavailable'; detail: string }
  /**
   * The runtime answered, and the answer was a refusal: a bad request, a
   * missing credential, a step that failed, a run that timed out. Falling back
   * would either fail the same way or — worse — succeed against a different
   * provider than the one the user configured, which makes the two paths
   * incomparable at exactly the point they are meant to be compared.
   */
  | { status: 'failed'; reason: string; detail: string };

const baseUrl = (): string => {
  const configured = process.env.RUNTIME_URL;
  // Unset means "use the default port"; explicitly empty means "off".
  if (configured === undefined) return DEFAULT_URL;
  return configured.trim();
};

export const isRuntimeEnabled = (): boolean => baseUrl().length > 0;

/**
 * Which provider and model the runtime should use for this call.
 *
 * Never a credential. The runtime holds those, and the browser has never had
 * them — `toRequestOverride` deliberately sends only a choice of provider and
 * model, and the runtime validates the provider name and enforces loopback on
 * `baseURL` at its end.
 */
export type RuntimeModel = {
  providerId?: string;
  modelId?: string;
  baseURL?: string;
};

/** cvitae's settings arrive from the browser as JSON, so every field is unknown. */
type SettingsOverride = {
  providerId?: unknown;
  modelId?: unknown;
  extractionModelId?: unknown;
  baseURL?: unknown;
};

const text = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

/**
 * Maps cvitae's two-tier model setting onto the runtime's single one.
 *
 * cvitae distinguishes a main model from an extraction model; the runtime does
 * not, and should not — which tier a piece of work belongs to is a property of
 * the work, and the caller is the one that knows. So the choice is made here,
 * per capability, and the runtime receives one `modelId` with no idea a split
 * existed.
 *
 * `extraction` is for work that only copies values already present in the
 * prompt, which runs well on a much smaller and faster model. Offer analysis is
 * the whole of it today. Falling back to `modelId` keeps single-model setups
 * working without configuring anything, exactly as the route did before.
 */
export const toRuntimeModel = (
  override: SettingsOverride | undefined,
  tier: 'main' | 'extraction',
  /**
   * The provider to pin when the browser did not choose one.
   *
   * Not optional in spirit, only in signature. The two processes have separate
   * `.env` files, and they disagree — measured, not hypothesised: cvitae's said
   * `local` while the runtime's said `openrouter`. With nothing in the request
   * to settle it, each side falls back to its own, so merely *starting* the
   * runtime moved the analysis from Ollama to a hosted free tier. For a user
   * who chose `local` that is their CV and their job search leaving the machine,
   * which is the one thing this architecture is supposed to make impossible.
   *
   * So cvitae states its provider explicitly for as long as it still has one.
   * When its AI config is deleted and the runtime's `.env` becomes the only
   * answer, that is a deliberate change with nothing left to contradict it.
   */
  fallbackProviderId?: string
): RuntimeModel | undefined => {
  const modelId =
    tier === 'extraction'
      ? text(override?.extractionModelId) ?? text(override?.modelId)
      : text(override?.modelId);

  const model: RuntimeModel = {
    providerId: text(override?.providerId) ?? text(fallbackProviderId),
    modelId,
    baseURL: text(override?.baseURL)
  };

  // An object of nothing but undefined is noise on the wire and reads, at the
  // other end, as a caller that meant to override something and failed to.
  return Object.values(model).some((value) => value !== undefined)
    ? model
    : undefined;
};

/**
 * Runs a capability.
 *
 * `timeoutMs` is the runtime's own budget for the work, sent so that it stops
 * on the caller's schedule rather than its own — a Next.js route has a hard
 * ceiling the runtime knows nothing about, and a run that outlives the request
 * is quota spent on an answer nobody will read.
 */
export const runCapability = async <T = Record<string, unknown>>(
  capability: string,
  input: Record<string, unknown>,
  options: { model?: RuntimeModel; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<RuntimeOutcome<T>> => {
  const base = baseUrl();

  if (!base) {
    return { status: 'unavailable', detail: 'RUNTIME_URL is empty.' };
  }

  // The connect budget guards the reach; the run budget guards the work. Both
  // are needed: a runtime that never accepts the socket and one that accepts it
  // and then hangs are different failures with the same symptom.
  //
  // The grace is what decides which of the two clocks fires first, and it has
  // to be the runtime's. Given identical deadlines the race is a coin toss, and
  // losing it is expensive: this side would abort, read the silence as "not
  // running", and fall back to the in-process pipeline with none of the route's
  // budget left — turning a clean "the run timed out" into a killed request.
  // Letting the runtime answer first makes that a 504 with something to act on.
  const budget =
    Math.max(CONNECT_TIMEOUT_MS, options.timeoutMs ?? CONNECT_TIMEOUT_MS) +
    (options.timeoutMs ? 2_000 : 0);

  let response: Response;

  try {
    response = await fetch(`${base}/run/${capability}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input,
        model: options.model,
        timeoutMs: options.timeoutMs
      }),
      cache: 'no-store',
      signal: options.signal ?? AbortSignal.timeout(budget)
    });
  } catch (error) {
    // Connection refused is the ordinary case of "not started", and on loopback
    // it fails in milliseconds, so the fallback costs nothing.
    const detail =
      error instanceof Error && error.name === 'TimeoutError'
        ? `cvitae-agent-runtime did not answer within ${Math.round(budget / 1000)}s.`
        : 'cvitae-agent-runtime is not running.';
    return { status: 'unavailable', detail };
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    return {
      status: 'unavailable',
      detail: 'cvitae-agent-runtime returned no JSON.'
    };
  }

  const body = payload as Partial<RunResult<T>> & {
    error?: string;
    reason?: string;
  };

  if (response.ok && body.capability && body.data) {
    return {
      status: 'ok',
      result: {
        capability: body.capability,
        data: body.data,
        degraded: Array.isArray(body.degraded) ? body.degraded : [],
        elapsedMs: typeof body.elapsedMs === 'number' ? body.elapsedMs : 0
      }
    };
  }

  // A named error is the runtime's final answer, whatever the status code.
  if (typeof body.error === 'string') {
    return {
      status: 'failed',
      reason: typeof body.reason === 'string' ? body.reason : 'error',
      detail: body.error
    };
  }

  // An unrecognised shape is not the runtime talking — a proxy error page, or a
  // version that no longer agrees with this client. Fall back.
  return {
    status: 'unavailable',
    detail: `cvitae-agent-runtime answered HTTP ${response.status} in an unrecognised shape.`
  };
};

/** One finished input. Mirrors the runtime's `BatchItem`. */
export type BatchItem<T = Record<string, unknown>> =
  | {
      index: number;
      status: 'ok';
      data: T;
      degraded: string[];
      elapsedMs: number;
    }
  | { index: number; status: 'failed'; reason: string; error: string };

export type BatchSummary = {
  completed: number;
  failed: number;
  elapsedMs: number;
  aborted: boolean;
};

/** What a batch that never started, or was stopped at once, amounts to. */
const EMPTY_SUMMARY: BatchSummary = {
  completed: 0,
  failed: 0,
  elapsedMs: 0,
  aborted: true
};

export type BatchOutcome =
  | { status: 'ok'; summary: BatchSummary }
  | { status: 'unavailable'; detail: string }
  | { status: 'failed'; reason: string; detail: string };

/**
 * Runs a capability over many inputs, handing back each result as it arrives.
 *
 * There is deliberately no fallback here, unlike `runCapability`. Batching
 * exists only in the runtime, and building a second implementation in cvitae to
 * cover its absence would rebuild the thing this migration is removing — for a
 * feature whose whole premise is running longer than a serverless request is
 * allowed to. When the runtime is not up, the caller offers row-by-row analysis
 * instead, which is what cvitae has always done.
 *
 * No overall timeout, for the same reason the runtime has none: any total would
 * be a guess from the input count, and cutting off a run that is still making
 * progress is the one failure a long unattended job must not have. `signal` is
 * how a caller stops it, and stopping is safe — everything already emitted has
 * been handed over.
 */
export const runBatchCapability = async <T = Record<string, unknown>>(
  capability: string,
  inputs: Record<string, unknown>[],
  options: {
    model?: RuntimeModel;
    /** Bounds one input, not the batch. */
    timeoutMs?: number;
    concurrency?: number;
    signal?: AbortSignal;
  } = {},
  onItem: (item: BatchItem<T>) => void | Promise<void>
): Promise<BatchOutcome> => {
  const base = baseUrl();

  if (!base) {
    return { status: 'unavailable', detail: 'RUNTIME_URL is empty.' };
  }

  let response: Response;

  try {
    response = await fetch(`${base}/run-batch/${capability}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs,
        model: options.model,
        timeoutMs: options.timeoutMs,
        concurrency: options.concurrency
      }),
      cache: 'no-store',
      signal: options.signal
    });
  } catch (error) {
    // A cancellation is not the runtime being absent, and reporting it as one
    // would tell a user who just pressed Stop to go and start a service that is
    // running perfectly well.
    if (options.signal?.aborted) {
      return { status: 'ok', summary: EMPTY_SUMMARY };
    }

    return {
      status: 'unavailable',
      detail:
        error instanceof Error && error.name === 'TimeoutError'
          ? 'cvitae-agent-runtime stopped responding.'
          : 'cvitae-agent-runtime is not running.'
    };
  }

  // A refusal arrives before the stream opens and is ordinary JSON.
  if (!response.ok || !response.body) {
    const detail = await response
      .json()
      .then((body: { error?: string; reason?: string }) => body)
      .catch(() => null);

    if (detail?.error) {
      return {
        status: 'failed',
        reason: detail.reason ?? 'error',
        detail: detail.error
      };
    }

    return {
      status: 'unavailable',
      detail: `cvitae-agent-runtime answered HTTP ${response.status} in an unrecognised shape.`
    };
  }

  let summary: BatchSummary | null = null;
  let failure: { reason: string; detail: string } | null = null;

  // Wrapped, because a cancelled stream rejects here rather than ending. Every
  // item already handed to `onItem` has been dealt with by the caller — written
  // to storage, in cvitae's case — so an interrupted read is a short batch, not
  // a failed one, and must not throw away the report of how far it got.
  try {
    await readSseStream(response.body, async (frame) => {
      if (frame.event === 'result') {
        await onItem(JSON.parse(frame.data) as BatchItem<T>);
        return;
      }

      if (frame.event === 'done') {
        summary = JSON.parse(frame.data) as BatchSummary;
        return;
      }

      if (frame.event === 'error') {
        const body = JSON.parse(frame.data) as { error?: string; reason?: string };
        failure = {
          reason: body.reason ?? 'error',
          detail: body.error ?? 'The batch could not be started.'
        };
      }
    });
  } catch (error) {
    if (!options.signal?.aborted) {
      return {
        status: 'unavailable',
        detail:
          error instanceof Error
            ? `The batch stream ended early: ${error.message}`
            : 'The batch stream ended early.'
      };
    }
  }

  if (failure) return { status: 'failed', ...(failure as { reason: string; detail: string }) };

  // The stream ended without a summary: the runtime died, or something between
  // here and it closed the connection. Whatever was already emitted is kept —
  // the caller has it — so this reports how far it got rather than failing.
  return {
    status: 'ok',
    summary: summary ?? { completed: 0, failed: 0, elapsedMs: 0, aborted: true }
  };
};
