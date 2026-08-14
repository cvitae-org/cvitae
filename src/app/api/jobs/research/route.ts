import { AiConfigError, resolveModel, resolveProviderId } from '@/libs/ai/providers';
import { resolveOffer } from '@/libs/jobs/resolveOffer';
import { applyBoardFacts, type StatedFacts } from '@/libs/jobs/boardFacts';
import type { BoardOffer } from '@/libs/jobs/scraperClient';
import { analyzeOffer, OfferAnalysisError } from '@/libs/jobs/analyzeOffer';
import { runCapability, toRuntimeModel } from '@/libs/runtime/client';

type AiModule = typeof import('ai');

let aiModulePromise: Promise<AiModule> | null = null;
const loadAiModule = async (): Promise<AiModule> => {
  if (!aiModulePromise) {
    aiModulePromise = import('ai');
  }
  return aiModulePromise;
};

// Reading the board plus a model round trip; the free tier cold-starts slowly.
// The scraper's own budget (30s) is set below this so that even a board it has
// to render leaves the five analysis calls room to finish inside the window.
export const maxDuration = 60;

/**
 * What is left of this route's budget, for handing to the runtime.
 *
 * The runtime has no idea it is being called from a serverless function with a
 * hard ceiling, so the deadline has to travel with the request. Subtracting the
 * time already spent matters because the scrape above it can legitimately take
 * 30 of the 60 seconds, and a run started with the full budget would be killed
 * by the platform mid-flight — the provider requests already paid for, and
 * nobody left to receive the answer.
 *
 * The two seconds held back are for getting the response home.
 */
const remainingBudgetMs = (startedAt: number): number =>
  Math.max(5_000, maxDuration * 1_000 - 2_000 - (Date.now() - startedAt));

const RATE_LIMITED = /rate limit|429|quota/i;

/** Providers surface quota exhaustion as a 429 somewhere in the error chain. */
const isRateLimit = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { statusCode?: number; message?: string };
  return candidate.statusCode === 429 || RATE_LIMITED.test(candidate.message ?? '');
};

/**
 * The same condition, reached by a different route.
 *
 * Delegated to the runtime, a quota refusal is no longer an exception with a
 * status code on it — it is a step that failed, with the provider's complaint
 * carried in the message. The user's situation is identical and so is the only
 * useful thing to tell them, so it is worth recognising in both forms rather
 * than letting the delegated path degrade to "the analysis failed".
 */
const detailIsRateLimit = (detail: string): boolean => RATE_LIMITED.test(detail);

/** What a refusal from the runtime means to an HTTP caller. */
const statusForRuntimeReason = (reason: string): number => {
  switch (reason) {
    case 'invalid_input':
      return 400;
    case 'timeout':
    case 'aborted':
      return 504;
    // A capability this route names and the runtime does not have is a version
    // mismatch between the two repositories — cvitae's bug, not the caller's.
    case 'unknown_capability':
    case 'ai_not_configured':
      return 500;
    default:
      return 502;
  }
};

const RATE_LIMIT_MESSAGE =
  'Daily free-model limit reached. It resets at 00:00 UTC — or switch AI_PROVIDER / add credits to keep going.';

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const {
      url,
      offerText,
      locale = 'en',
      ai,
      // Set when the text is a stored scrape rather than something a person
      // pasted. Both skip the fetch, but only one of them is "manual".
      textSource,
      // The board's own figures, replayed from an imported row so that
      // re-analysing it cannot lose them.
      boardFacts
    } = await req.json();

    const hasUrl = typeof url === 'string' && url.trim().length > 0;
    const hasText = typeof offerText === 'string' && offerText.trim().length > 0;

    if (!hasUrl && !hasText) {
      return Response.json(
        { error: 'Provide a job offer URL or paste the offer text.' },
        { status: 400 }
      );
    }

    const fromScraper = textSource === 'scraper';

    let text = hasText ? offerText.trim() : '';
    let sourceMode: 'url' | 'manual' = hasText && !fromScraper ? 'manual' : 'url';
    let sourceNote = '';
    let sourceUrl = hasUrl ? url.trim() : '';
    /** Set when cvitae-scrapper read the offer and handed back board data. */
    let board: BoardOffer | undefined;

    // Pasted text wins: if the user supplied it, the fetch already failed or
    // was never wanted, so there is nothing to gain from hitting the board.
    if (!hasText && hasUrl) {
      const outcome = await resolveOffer(sourceUrl);

      if (outcome.status !== 'ok') {
        // The fetch failure is the answer, not a 500 — the client turns this
        // into a "paste it manually" prompt with the real reason attached.
        // The scraper's refusals (bot-blocked, robots-disallowed, a board it
        // will not crawl) reach the user through the same path, and its
        // messages already end with what to do about it.
        return Response.json(
          { error: outcome.detail, reason: outcome.status, needsManualText: true },
          { status: 422 }
        );
      }

      text = outcome.text;
      sourceUrl = outcome.finalUrl;
      sourceMode = 'url';
      board = outcome.board;
    }

    if (hasText && hasUrl && !fromScraper) {
      sourceNote = 'Offer text pasted manually; URL kept for reference.';
    }

    if (fromScraper) {
      sourceNote = 'Analysed from the stored scrape; the board was not re-read.';
    }

    const override = ai ?? {};

    // Research is pure extraction — copying values that are already in the
    // text — so it runs entirely on the extraction model, and the main model
    // setting belongs to CV customisation. Falling back to `modelId` keeps
    // single-model setups working without configuring anything.
    //
    // Two implementations of that sit behind this now. cvitae-agent-runtime
    // owns the capability and is tried first; the in-process pipeline below is
    // what runs when it is not up. The five agents, their prompts and their
    // token ceilings are the same code in both places, carried over verbatim,
    // so the two should agree — and while both exist, disagreeing on a real
    // offer is the thing worth looking at.
    let inferred: Record<string, unknown>;
    let degraded: string[];
    let analysedBy = '';

    const delegated = await runCapability<Record<string, unknown>>(
      'analyze_offer',
      { offerText: text, locale },
      {
        // cvitae's own AI_PROVIDER backs the browser's choice, so that starting
        // the runtime changes where the analysis runs and not which provider it
        // reaches. The two `.env` files disagree by default, and without this
        // the disagreement is settled silently in the runtime's favour.
        model: toRuntimeModel(override, 'extraction', resolveProviderId()),
        // What is left of this route's own ceiling. The scrape above may have
        // spent 30s of it, and a runtime still working after the route has been
        // cut off is quota spent on an answer nobody can receive.
        timeoutMs: remainingBudgetMs(startedAt)
      }
    );

    if (delegated.status === 'failed') {
      // The runtime answered, and the answer was no. Re-running the offer
      // through cvitae's own provider would either fail identically or succeed
      // against a different model than the user configured — which hides the
      // fault at exactly the point the two paths are meant to be comparable.
      const rateLimited = detailIsRateLimit(delegated.detail);

      console.error(
        `cvitae-agent-runtime refused the analysis (${delegated.reason}): ${delegated.detail}`
      );

      return Response.json(
        {
          error: rateLimited ? RATE_LIMIT_MESSAGE : delegated.detail,
          reason: rateLimited ? 'rate_limited' : delegated.reason
        },
        { status: rateLimited ? 429 : statusForRuntimeReason(delegated.reason) }
      );
    }

    if (delegated.status === 'ok') {
      inferred = delegated.result.data;
      degraded = delegated.result.degraded;
      analysedBy = `Analysed by cvitae-agent-runtime in ${(delegated.result.elapsedMs / 1000).toFixed(1)}s.`;
    } else {
      // Not running, or switched off. Says nothing about the offer, so this is
      // the path cvitae has always taken. Logged rather than surfaced: for
      // anyone who has not started the runtime, it is not a fault and does not
      // belong in the table.
      console.info(
        `cvitae-agent-runtime unavailable (${delegated.detail}); analysing in-process.`
      );

      const [aiModule, { model, providerId }] = await Promise.all([
        loadAiModule(),
        resolveModel({
          ...override,
          modelId: override.extractionModelId || override.modelId
        })
      ]);
      const { generateObject, NoObjectGeneratedError } = aiModule;

      const local = await analyzeOffer({
        model,
        offerText: text,
        locale,
        // A local server is one GPU: overlapping calls only contend. Hosted
        // providers run them genuinely in parallel.
        concurrency: providerId === 'local' ? 1 : 5,
        generateObject,
        isNoObjectError: (error) => NoObjectGeneratedError.isInstance(error)
      });

      inferred = local.analysis;
      degraded = local.degraded;
    }

    // The board stated these outright, so they replace what the model inferred
    // from the same text. Applied after analysis rather than before because a
    // degraded agent fills its fields with "Not stated", and those are exactly
    // the gaps worth covering.
    //
    // `board` comes from a live scrape; `boardFacts` is the same information
    // replayed by an imported row that is being analysed from stored text. One
    // or the other, never both.
    const stated: StatedFacts | undefined =
      board ?? (fromScraper && boardFacts ? (boardFacts as StatedFacts) : undefined);

    const { analysis, applied } = stated
      ? applyBoardFacts(inferred, stated)
      : { analysis: inferred, applied: [] as string[] };

    // Recorded on the row while both implementations exist, because the whole
    // point of running them side by side is being able to tell which one
    // produced a given record when the two disagree. It goes when the
    // in-process path does.
    if (analysedBy) {
      sourceNote = [sourceNote, analysedBy].filter(Boolean).join(' ');
    }

    if (applied.length > 0) {
      sourceNote = [sourceNote, `From the board's own listing: ${applied.join(', ')}.`]
        .filter(Boolean)
        .join(' ');
    }

    if (degraded.length > 0) {
      sourceNote = [sourceNote, `Incomplete: ${degraded.join(', ')} could not be extracted.`]
        .filter(Boolean)
        .join(' ');
    }

    return Response.json({
      ...analysis,
      source_url: sourceUrl,
      source_mode: sourceMode,
      source_note: sourceNote,
      checked_at: new Date().toISOString(),
      locale
    });
  } catch (error) {
    if (error instanceof AiConfigError) {
      console.error('AI provider is misconfigured:', error.message);
      return Response.json(
        { error: 'AI provider is not configured' },
        { status: 500 }
      );
    }

    if (error instanceof OfferAnalysisError) {
      console.error('Offer analysis failed:', error.message);
      return Response.json({ error: error.message }, { status: 502 });
    }

    // The free tier allows 50 requests/day, and one offer now costs five of
    // them. Hitting the ceiling is an ordinary operating condition, not a bug.
    if (isRateLimit(error)) {
      console.warn('Provider rate limit reached.');
      return Response.json(
        {
          error:
            'Daily free-model limit reached. It resets at 00:00 UTC — or switch AI_PROVIDER / add credits to keep going.',
          reason: 'rate_limited'
        },
        { status: 429 }
      );
    }

    console.error('Job research failed:', error);
    return Response.json(
      { error: 'Failed to analyse the job offer' },
      { status: 500 }
    );
  }
}
