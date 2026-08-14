import { AiConfigError, resolveProviderId } from '@/libs/ai/providers';
import { applyBoardFacts, type StatedFacts } from '@/libs/jobs/boardFacts';
import { runBatchCapability, toRuntimeModel } from '@/libs/runtime/client';
import { sseFrame } from '@/libs/runtime/sse';

/**
 * Analyses many stored offers in one go, streaming each row back as it lands.
 *
 * This is the answer to the actual cost of the research table, which was never
 * one offer's five model calls — those have run in parallel from the start — but
 * the fact that an imported scraper file lands N rows with every analysed field
 * empty and no way to fill them except N clicks.
 *
 * It runs against *stored text* only. Every row here already has its posting, so
 * there is no fetching, no scraper and no board to be blocked by — which keeps a
 * long unattended run from failing halfway through on something unrelated to the
 * model.
 *
 * Delegation is not optional here, and this route has no in-process fallback.
 * Batching lives in the runtime; reimplementing it in cvitae would rebuild
 * exactly what the migration is removing, for a feature that by design runs
 * longer than a serverless request may. When the runtime is absent, the table
 * falls back to what it has always offered: one row at a time.
 */

// A batch outlives this on any real deployment, and cannot be raised past it on
// Vercel Hobby. It does not matter, because the runtime binds to loopback and a
// deployed function cannot reach it at all: there, the client reports it
// unavailable in milliseconds and the user analyses rows individually. Batching
// is a local-machine feature, in the same way and for the same reason the
// scraper is.
export const maxDuration = 60;

/**
 * Per offer, not for the batch.
 *
 * A local model takes tens of seconds per offer and there may be forty of them,
 * so no total would be anything but a guess. Three minutes is what one offer is
 * allowed before it is abandoned and the rest carry on.
 */
const PER_OFFER_TIMEOUT_MS = 180_000;

type OfferInput = {
  id: string;
  offerText: string;
  boardFacts?: StatedFacts;
};

export async function POST(req: Request) {
  let body: { offers?: unknown; locale?: unknown; ai?: unknown };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const locale = typeof body.locale === 'string' ? body.locale : 'en';

  const offers = Array.isArray(body.offers)
    ? (body.offers as unknown[]).filter(
        (entry): entry is OfferInput =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as OfferInput).id === 'string' &&
          typeof (entry as OfferInput).offerText === 'string' &&
          (entry as OfferInput).offerText.trim().length > 0
      )
    : [];

  if (offers.length === 0) {
    return Response.json(
      {
        error:
          'No offers with stored text to analyse. Rows imported without their posting have to be re-run individually.'
      },
      { status: 400 }
    );
  }

  let providerId: string;

  try {
    providerId = resolveProviderId();
  } catch (error) {
    if (error instanceof AiConfigError) {
      console.error('AI provider is misconfigured:', error.message);
      return Response.json(
        { error: 'AI provider is not configured' },
        { status: 500 }
      );
    }
    throw error;
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(sseFrame(event, payload)));
        } catch {
          // The browser has gone. The runtime learns the same way — this
          // route's own fetch to it is aborted when this stream is cancelled —
          // so there is nothing to do but stop writing.
        }
      };

      const outcome = await runBatchCapability(
        'analyze_offer',
        offers.map((offer) => ({ offerText: offer.offerText, locale })),
        {
          // Same pinning as the single-offer route: cvitae's own AI_PROVIDER
          // backs the browser's choice so that starting the runtime does not
          // silently move the work to a different provider.
          model: toRuntimeModel(
            body.ai as Record<string, unknown> | undefined,
            'extraction',
            providerId
          ),
          timeoutMs: PER_OFFER_TIMEOUT_MS,
          signal: req.signal
        },
        (item) => {
          const offer = offers[item.index];

          // An index with no offer behind it would mean the runtime reordered
          // or invented one. It cannot, but a row written against the wrong id
          // is silent corruption of the user's table, so it is dropped rather
          // than guessed at.
          if (!offer) return;

          if (item.status === 'failed') {
            send('row', { id: offer.id, status: 'failed', error: item.error });
            return;
          }

          // The board stated these outright, so they replace what the model
          // inferred from the same text — and a degraded step fills its fields
          // with "Not stated", which is exactly the gap worth covering.
          const { analysis, applied } = offer.boardFacts
            ? applyBoardFacts(item.data, offer.boardFacts)
            : { analysis: item.data, applied: [] as string[] };

          const notes = [
            `Analysed by cvitae-agent-runtime in ${(item.elapsedMs / 1000).toFixed(1)}s.`,
            applied.length > 0
              ? `From the board's own listing: ${applied.join(', ')}.`
              : '',
            item.degraded.length > 0
              ? `Incomplete: ${item.degraded.join(', ')} could not be extracted.`
              : ''
          ].filter(Boolean);

          send('row', {
            id: offer.id,
            status: 'ok',
            record: {
              ...analysis,
              source_note: notes.join(' '),
              checked_at: new Date().toISOString(),
              locale
            }
          });
        }
      );

      if (outcome.status === 'ok') {
        send('done', outcome.summary);
      } else {
        // Both remaining cases are final. `unavailable` is not a prompt to fall
        // back — there is nothing here to fall back to — it is the answer that
        // the runtime has to be started for this to work at all.
        send('error', { error: outcome.detail, reason: outcome.status });
      }

      try {
        controller.close();
      } catch {
        // Already cancelled, because the browser went away — the ordinary end
        // of a batch someone stopped. Closing a cancelled stream throws, and an
        // unhandled rejection here would be reported as a route failure for
        // what is the expected outcome of pressing Stop.
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  });
}
