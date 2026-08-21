import { AiConfigError, resolveModel, resolveProviderId } from '@/libs/ai/providers';
import { resolveOffer } from '@/libs/jobs/resolveOffer';
import { applyBoardFacts, type StatedFacts } from '@/libs/jobs/boardFacts';
import type { BoardOffer } from '@/libs/jobs/scraperClient';
import { analyzeOffer, OfferAnalysisError } from '@/libs/jobs/analyzeOffer';
import {
  carriesClientKey,
  runCapability,
  toRuntimeModel
} from '@/libs/runtime/client';
import {
  normalizeOfferText,
  withNormalizedRequirements
} from '@/features/JobResearch/requirements';
import { apiError } from '@/libs/i18n/errors';
import {
  providerErrorDetail,
  rateLimitFromText,
  rateLimitOf,
  type RateLimitKind
} from '@/libs/ai/errors';

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

/**
 * Turns any 429 into the response that says what to do about it.
 *
 * Two different conditions arrive as the same status. A spent daily quota is
 * over until it resets; a shared free-tier pool that is momentarily saturated
 * clears in seconds and the honest advice is to press the button again. They
 * were previously one message, and it named the wrong remedy for the common
 * case.
 */
const rateLimitResponse = (error: unknown, kind: RateLimitKind): Response => {
  const detail = providerErrorDetail(error);
  console.warn(`Provider rate limit (${kind}):`, detail ?? '(no detail)');

  return Response.json(
    {
      error: apiError(
        kind === 'daily' ? 'research.rateLimit' : 'research.providerBusy',
        undefined,
        detail
      ),
      reason: 'rate_limited'
    },
    { status: 429 }
  );
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
const detailIsRateLimit = (detail: string): RateLimitKind | null =>
  rateLimitFromText(detail);

/**
 * A refusal that came from the model provider rather than from the offer.
 *
 * Worth separating because the two lead somewhere different. "The analysis
 * failed" invites re-reading the posting; a provider refusal is answered in
 * Settings, or by waiting. OpenRouter's constant for any upstream failure is
 * the literal string "Provider returned error", which is what a throttled free
 * model looks like by the time it has crossed the runtime boundary — the status
 * code and the provider's own explanation do not survive that trip, so this
 * cannot claim the cause, only the culprit.
 */
const PROVIDER_REJECTED = /provider returned error|provider error|upstream/i;

const detailIsProviderRejection = (detail: string): boolean =>
  PROVIDER_REJECTED.test(detail);

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
        { error: apiError('research.provideSource') },
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

    if (hasText && hasUrl && !fromScraper) {
      sourceNote = 'Offer text pasted manually; URL kept for reference.';
    }

    if (fromScraper) {
      sourceNote = 'Analysed from the stored scrape; the board was not re-read.';
    }

    // The board's own figures as replayed by an imported row. A *live* scrape
    // produces the same thing, but that now happens inside the runtime, which
    // applies them itself — so this is only for text arriving without a fetch.
    const stated: StatedFacts | undefined =
      fromScraper && boardFacts ? (boardFacts as StatedFacts) : undefined;

    // Keep the posting that was actually analysed. Tailoring needs cited
    // wording later, and a URL is not a durable copy: vacancies expire and
    // boards change or block server fetches. Acquiring here also makes the
    // in-process and delegated paths analyse the same normalized text.
    if (!text && sourceUrl) {
      const outcome = await resolveOffer(sourceUrl);

      if (outcome.status !== 'ok') {
        return Response.json(
          {
            error: apiError('research.sourceUnreadable', undefined, outcome.detail),
            reason: outcome.status,
            needsManualText: true
          },
          { status: 422 }
        );
      }

      text = outcome.text;
      sourceUrl = outcome.finalUrl;
      sourceMode = 'url';
      board = outcome.board;
    }

    text = normalizeOfferText(text);

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
    let viaRuntime = false;

    // URL acquisition above freezes one normalized posting for either
    // implementation. The runtime therefore receives the same retained text
    // as the in-process fallback rather than fetching a second, potentially
    // changed copy of the vacancy.
    /*
     * A request carrying the user's own key is analysed here rather than in the
     * runtime, which cannot spend it — see `carriesClientKey`. The in-process
     * pipeline below is the same five agents with the same prompts, so this
     * changes which process runs the analysis and nothing about the result.
     */
    const delegated = carriesClientKey(override)
      ? ({
          status: 'unavailable',
          detail: 'The request carries its own API key, which only this process can use.'
        } as const)
      : await runCapability<Record<string, unknown>>(
      'analyze_offer',
      {
        offerText: text,
        boardFacts: board ?? stated,
        locale
      },
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

    if (delegated.status === 'failed' && delegated.reason === 'unreadable_source') {
      // Not an error to report as one: the board refused, or published nothing
      // a server can read. The client turns this into a paste prompt, and the
      // runtime's message already ends with what the user can do about it.
      return Response.json(
        {
          error: apiError('research.sourceUnreadable', undefined, delegated.detail),
          reason: 'unreadable_source',
          needsManualText: true
        },
        { status: 422 }
      );
    }

    if (delegated.status === 'failed') {
      // The runtime answered, and the answer was no. Re-running the offer
      // through cvitae's own provider would either fail identically or succeed
      // against a different model than the user configured — which hides the
      // fault at exactly the point the two paths are meant to be comparable.
      const rateLimited = detailIsRateLimit(delegated.detail);
      const providerRejected =
        !rateLimited && detailIsProviderRejection(delegated.detail);

      console.error(
        `cvitae-agent-runtime refused the analysis (${delegated.reason}): ${delegated.detail}`
      );

      return Response.json(
        {
          error: rateLimited
            ? apiError(
                rateLimited === 'daily'
                  ? 'research.rateLimit'
                  : 'research.providerBusy',
                undefined,
                delegated.detail
              )
            : apiError(
                providerRejected
                  ? 'research.providerRejected'
                  : 'research.analysisFailed',
                undefined,
                delegated.detail
              ),
          reason: rateLimited ? 'rate_limited' : delegated.reason
        },
        { status: rateLimited ? 429 : statusForRuntimeReason(delegated.reason) }
      );
    }

    if (delegated.status === 'ok') {
      inferred = delegated.result.data;
      degraded = delegated.result.degraded;
      viaRuntime = true;
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

    // Only the fallback applies these here. The runtime has its own overlay
    // step and has already done it, reporting which keys it touched — applying
    // them a second time would be harmless but would double the note.
    const localStated: StatedFacts | undefined = board ?? stated;

    const { analysis, applied } =
      viaRuntime || !localStated
        ? {
            analysis: inferred,
            applied: (inferred.board_facts_applied as string[] | undefined) ?? []
          }
        : applyBoardFacts(inferred, localStated);

    // The runtime reports its own provenance in the record; cvitae's response
    // shape carries those as top-level fields, so they are lifted out rather
    // than left to leak into the row as analysis keys.
    delete analysis.board_facts_applied;
    const runtimeUrl = analysis.source_url;
    delete analysis.source_url;
    delete analysis.source_mode;
    delete analysis.via;

    if (typeof runtimeUrl === 'string' && runtimeUrl) sourceUrl = runtimeUrl;

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
      ...withNormalizedRequirements(analysis, text),
      source_url: sourceUrl,
      source_mode: sourceMode,
      source_note: sourceNote,
      offer_text: text,
      checked_at: new Date().toISOString(),
      locale
    });
  } catch (error) {
    if (error instanceof AiConfigError) {
      console.error('AI provider is misconfigured:', error.message);
      return Response.json(
        { error: apiError('providerConfig', undefined, error.message) },
        { status: 500 }
      );
    }

    // Checked before the analysis branch, not after it. A 429 raised by a
    // critical agent arrives wrapped in an OfferAnalysisError, so testing that
    // first matched everything and left this unreachable — which is how a
    // throttled free model came to report itself as an unexplained analysis
    // failure on every row.
    const limited = rateLimitOf(error);
    if (limited) return rateLimitResponse(error, limited);

    if (error instanceof OfferAnalysisError) {
      console.error('Offer analysis failed:', error.message);
      return Response.json(
        {
          error: apiError(
            'research.analysisFailed',
            undefined,
            providerErrorDetail(error) ?? error.message
          )
        },
        { status: 502 }
      );
    }

    console.error('Job research failed:', error);
    return Response.json(
      { error: apiError('research.analysisFailed') },
      { status: 500 }
    );
  }
}
