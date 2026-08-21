import { runCapability, toRuntimeModel } from '@/libs/runtime/client';
import { apiError } from '@/libs/i18n/errors';

/**
 * Reads a CV out of uploaded files and pasted text.
 *
 * A thin pass-through to `extract_cv`, and deliberately nothing more: the seven
 * extractions, the format readers and the vision call all live in the runtime,
 * and duplicating any of it here would put a second, worse extractor in the
 * process that is not supposed to talk to models any more.
 *
 * Unlike offer research, there is **no fallback**. That route can analyse an
 * offer in-process when the runtime is down; this one cannot, because cvitae has
 * no extractor of its own and never will — extraction is the whole reason the
 * runtime exists. So import is a local-only feature: on a deployed cvitae there
 * is no loopback runtime to reach, and the honest answer is to say so rather
 * than to fail obscurely.
 *
 * `persist: false` is what keeps this side authoritative. The runtime would
 * otherwise merge the result into its own `cv.json`, which is a single document
 * while cvitae holds one per language — so importing a Polish CV would fold
 * Polish into the same file as the English one. Sending `false` returns the
 * extraction and stores nothing, and the browser decides what to do with it.
 */

// The Vercel Hobby ceiling, declared because the platform reads it. It does not
// bind in development, which is the only place this route can work at all — see
// the note above about there being no runtime to reach from a deployment.
export const maxDuration = 60;

/**
 * How long the runtime may take, when the caller does not say.
 *
 * Not the 55s the other routes use. That number is shaped by Vercel's ceiling,
 * and it is the wrong shape here: this only ever runs against loopback, and the
 * work is seven passes over a whole CV rather than one pass over an offer.
 *
 * Measured: 30s on `gemma3:4b`. But the model that actually runs is whichever
 * the runtime defaults to when Settings has chosen none, and here that was
 * `gemma4:12b` — which blew 55s and returned a timeout for a request that was
 * working correctly. A budget that fails on the default configuration is worse
 * than no budget, so this is set for the slow case; the ceiling exists to catch
 * a hang, not to enforce a latency target.
 */
const DEFAULT_TIMEOUT_MS = 240_000;

const RUNTIME_ABSENT =
  'cvitae-agent-runtime is not running. Importing a CV needs it — cvitae has no extractor of its own — so start it with `pnpm dev` in that project and try again.';

type Source =
  | { kind: 'text'; label?: string; content: string }
  | { kind: 'upload'; filename: string; content: string };

const isSource = (value: unknown): value is Source => {
  if (!value || typeof value !== 'object') return false;
  const source = value as Record<string, unknown>;

  if (source.kind === 'text') return typeof source.content === 'string' && source.content.trim().length > 0;
  if (source.kind === 'upload') {
    return typeof source.filename === 'string' && typeof source.content === 'string';
  }

  return false;
};

export async function POST(req: Request) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: apiError('invalidRequest') },
      { status: 400 }
    );
  }

  const { sources, ai, timeoutMs, sections, known_skills } = (body ?? {}) as {
    sources?: unknown;
    ai?: Record<string, unknown>;
    timeoutMs?: unknown;
    /**
     * Which artefacts to extract. Forwarded untouched — the runtime's enum is
     * the authority on the names, and duplicating the list here would be a
     * second place to update when one is added.
     *
     * Omitted means all seven in one request, which is what times out on a
     * large local model. The caller that cares sends one section at a time.
     */
    sections?: unknown;
    /** Skills already extracted, so the runtime's guards still cross-check. */
    known_skills?: unknown;
  };

  if (!Array.isArray(sources) || sources.length === 0 || !sources.every(isSource)) {
    return Response.json(
      {
        error: apiError(
          'invalidRequest',
          undefined,
          'Send at least one uploaded file or text source.'
        )
      },
      { status: 400 }
    );
  }

  // `kind: 'file'` is filtered out rather than passed through. It would make the
  // runtime read an arbitrary path off this machine's disk on behalf of whoever
  // sent the request, which is a different and much larger permission than "read
  // the bytes I attached".
  const budget =
    typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;

  const outcome = await runCapability(
    'extract_cv',
    {
      sources,
      persist: false,
      ...(Array.isArray(sections) && sections.length ? { sections } : {}),
      ...(Array.isArray(known_skills) && known_skills.length ? { known_skills } : {})
    },
    {
      // Extraction copies values already in the prompt, which is what the
      // extraction tier is for — the same choice offer analysis makes.
      model: toRuntimeModel(ai, 'extraction', process.env.AI_PROVIDER),
      timeoutMs: budget
    }
  );

  if (outcome.status === 'unavailable') {
    return Response.json(
      {
        error: apiError('cv.importFailed', undefined, RUNTIME_ABSENT),
        reason: 'runtime_unavailable'
      },
      { status: 503 }
    );
  }

  if (outcome.status === 'failed') {
    // The runtime's message already ends with what to do about it — a scanned
    // PDF says to screenshot it, an unreadable format lists the ones it takes.
    // Rewriting them here would lose that.
    return Response.json(
      {
        error: apiError('cv.importFailed', undefined, outcome.detail),
        reason: outcome.reason
      },
      { status: outcome.reason === 'invalid_input' ? 400 : 502 }
    );
  }

  /**
   * `degraded` travels with the document, because it changes what the result
   * means.
   *
   * Each of the seven extractions is non-critical — a certificate PDF genuinely
   * has no job history — so a step that fails contributes `{}` and the import
   * succeeds with that section empty. From the outside "no jobs found" and "the
   * jobs step failed" are the same document, and only one of them is worth
   * retrying. Measured while wiring this up: the same PDF returned 7 jobs on one
   * run and 3 on the next from `gemma3:4b`, so this is the ordinary case rather
   * than an exotic one.
   */
  return Response.json({
    ...outcome.result.data,
    degraded: outcome.result.degraded,
    elapsedMs: outcome.result.elapsedMs
  });
}

// No body-size configuration here on purpose. App Router route handlers have no
// `bodyParser` knob — that is Pages Router — and reading `req.json()` is bounded
// by the platform, not by this file. The limit that actually rejects an oversized
// upload is the runtime's 12MB per file, which reports which file it was.
