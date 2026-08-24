import { z } from 'zod';
import { apiError } from '@/libs/i18n/errors';
import { resolveProviderId } from '@/libs/ai/providers';
import {
  clientKeyBlocksDelegation,
  runCapability,
  toRuntimeModel
} from '@/libs/runtime/client';

/**
 * Checks where an application is about to be sent.
 *
 * The address under "Where it goes" is whatever the posting printed, and a
 * posting written to collect CVs prints whatever its author wants. This asks
 * the runtime what other sources say it should be — the employer's own site,
 * and the same role on other boards — and hands back an ordered list with the
 * evidence attached.
 *
 * It suggests and never decides: the response is rendered as chips beside the
 * field, and only a click changes the recipient. The runtime says the same
 * thing in its own payload as `suggestion_only`.
 *
 * Unlike every other route here, no model decides anything. The pages being
 * read are written by strangers and the result lands beside a Send button, so
 * nothing on them is allowed to decide anything — they are scanned for `@` and
 * weighed on facts a page cannot assert about itself. The one model call in the
 * chain, behind `searchWeb`, proposes a website to go and check; what comes
 * back is then verified like any other tier.
 */

export const maxDuration = 60;

/**
 * Generous, because this is three fetch tiers deep — the employer's site, then
 * a board sweep, then the matching offers — and every hop is throttled per host
 * by cvitae-scrapper. Measured at 12.6s for the company tier alone.
 */
const RUNTIME_BUDGET_MS = 50_000;

const bodySchema = z.object({
  offerText: z.string().max(200_000).optional(),
  url: z.string().url().optional(),
  company: z.string().max(200).default(''),
  companyUrl: z.string().url().optional(),
  position: z.string().max(200).default(''),
  /** The city, used to tell same-named companies apart when guessing a domain. */
  location: z.string().max(200).default(''),
  /** What is in the field now, so the answer can speak to it directly. */
  current: z.string().max(254).default(''),
  /** Off for a fast re-check: the board sweep is the slow third of this. */
  checkOtherBoards: z.boolean().default(true),
  /**
   * Ask a model to propose the employer's website.
   *
   * Opt-in per request, because it is the only part of this that costs a model
   * call. The panel offers it as an escalation after the free tiers have run
   * and come back with nothing worth trusting.
   */
  searchWeb: z.boolean().default(false),
  /**
   * The browser's AI settings. Only `searchWeb` spends them, but they are sent
   * on every call because they also decide *which* provider the run is pinned
   * to, and that has to be settled before the runtime falls back to its own.
   */
  ai: z.record(z.string(), z.unknown()).optional()
});

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: apiError('invalidRequest') }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      {
        error: apiError(
          'invalidRequest',
          undefined,
          parsed.error.issues
            .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
            .join('; ')
        )
      },
      { status: 400 }
    );
  }

  const { ai } = parsed.data;

  let configuredProvider: string;

  try {
    configuredProvider = resolveProviderId();
  } catch (error) {
    // Only reachable when this process's own `AI_PROVIDER` names something
    // unknown — a typo in configuration rather than anything about the request.
    // Answered as an error the panel can render, because the alternative is an
    // unhandled throw and a blank failure beside the Send button.
    return Response.json(
      {
        error: apiError(
          'submitting.verifyFailed',
          undefined,
          (error as Error).message
        )
      },
      { status: 500 }
    );
  }

  /*
   * The user's own key travels to the runtime, which spends it for the one call.
   * Only a key that cannot get there safely — a remote `RUNTIME_URL` on plain
   * HTTP — is a refusal, and only when this run would actually spend one. With
   * `searchWeb` off the whole verification is fetches and comparisons, so
   * dropping the key costs nothing and there is nothing to protect.
   */
  if (parsed.data.searchWeb && clientKeyBlocksDelegation(ai)) {
    return Response.json(
      { error: apiError('clientKeyNotDelegable'), reason: 'client_key' },
      { status: 400 }
    );
  }

  const outcome = await runCapability<Record<string, unknown>>(
    'verify_recipient',
    {
      offerText: parsed.data.offerText,
      url: parsed.data.url,
      company: parsed.data.company,
      company_url: parsed.data.companyUrl,
      position: parsed.data.position,
      location: parsed.data.location,
      current: parsed.data.current,
      check_other_boards: parsed.data.checkOtherBoards,
      search_web: parsed.data.searchWeb
    },
    {
      /*
       * Sent even though the default run reaches no model, because the two
       * `.env` files disagree and the runtime settles that silently in its own
       * favour otherwise. This route was the one delegating route that stated
       * nothing: cvitae configured for `local` had its verification answered by
       * a runtime configured for `openrouter`, which then refused the whole run
       * over a missing OpenRouter key it had no use for.
       *
       * `main` rather than `extraction`, because the only model step here asks
       * where an employer's website is — world knowledge, and on OpenRouter an
       * `:online` model — rather than copying values out of the prompt.
       */
      model: toRuntimeModel(ai, 'main', configuredProvider),
      timeoutMs: RUNTIME_BUDGET_MS
    }
  );

  if (outcome.status === 'ok') {
    return Response.json({
      ...outcome.result.data,
      // Which tiers came back empty, so the panel can say "the company site
      // could not be read" rather than implying nothing was found.
      degraded: outcome.result.degraded
    });
  }

  // There is no in-process fallback for this one — unlike analysis, cvitae has
  // no version of it. The runtime being off means the feature is off, which the
  // panel says plainly rather than failing the page.
  if (outcome.status === 'unavailable') {
    return Response.json(
      { error: apiError('submitting.verifyUnavailable', undefined, outcome.detail) },
      { status: 503 }
    );
  }

  return Response.json(
    {
      error: apiError('submitting.verifyFailed', undefined, outcome.detail),
      reason: outcome.reason
    },
    { status: outcome.reason === 'unreadable_source' ? 422 : 502 }
  );
}
