import { AiConfigError, resolveModel } from '@/libs/ai/providers';
import { resolveOffer } from '@/libs/jobs/resolveOffer';
import { applyBoardFacts } from '@/libs/jobs/boardFacts';
import type { BoardOffer } from '@/libs/jobs/scraperClient';
import { analyzeOffer, OfferAnalysisError } from '@/libs/jobs/analyzeOffer';

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

/** Providers surface quota exhaustion as a 429 somewhere in the error chain. */
const isRateLimit = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { statusCode?: number; message?: string };
  return (
    candidate.statusCode === 429 ||
    /rate limit|429|quota/i.test(candidate.message ?? '')
  );
};

export async function POST(req: Request) {
  try {
    const { url, offerText, locale = 'en', ai } = await req.json();

    const hasUrl = typeof url === 'string' && url.trim().length > 0;
    const hasText = typeof offerText === 'string' && offerText.trim().length > 0;

    if (!hasUrl && !hasText) {
      return Response.json(
        { error: 'Provide a job offer URL or paste the offer text.' },
        { status: 400 }
      );
    }

    let text = hasText ? offerText.trim() : '';
    let sourceMode: 'url' | 'manual' = hasText ? 'manual' : 'url';
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

    if (hasText && hasUrl) {
      sourceNote = 'Offer text pasted manually; URL kept for reference.';
    }

    const override = ai ?? {};

    // Research is pure extraction — copying values that are already in the
    // text — so it runs entirely on the extraction model, and the main model
    // setting belongs to CV customisation. Falling back to `modelId` keeps
    // single-model setups working without configuring anything.
    const [aiModule, { model, providerId }] = await Promise.all([
      loadAiModule(),
      resolveModel({
        ...override,
        modelId: override.extractionModelId || override.modelId
      })
    ]);
    const { generateObject, NoObjectGeneratedError } = aiModule;

    const { analysis: inferred, degraded } = await analyzeOffer({
      model,
      offerText: text,
      locale,
      // A local server is one GPU: overlapping calls only contend. Hosted
      // providers run them genuinely in parallel.
      concurrency: providerId === 'local' ? 1 : 5,
      generateObject,
      isNoObjectError: (error) => NoObjectGeneratedError.isInstance(error)
    });

    // The board stated these outright, so they replace what the model inferred
    // from the same text. Applied after analysis rather than before because a
    // degraded agent fills its fields with "Not stated", and those are exactly
    // the gaps worth covering.
    const { analysis, applied } = board
      ? applyBoardFacts(inferred, board)
      : { analysis: inferred, applied: [] as string[] };

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
