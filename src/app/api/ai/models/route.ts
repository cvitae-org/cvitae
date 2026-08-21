import { isProviderId } from '@/libs/ai/providers';
import { apiError } from '@/libs/i18n/errors';

/**
 * The free models that can actually do the job, read from the live catalogue.
 *
 * Hardcoding one was the mistake this exists to stop repeating: the model named
 * in `providers.ts` silently stopped advertising `structured_outputs`, and
 * every analysis failed with an unparseable object until someone diffed the
 * catalogue by hand. A list the user can refresh is the difference between a
 * five-minute fix and a dead end.
 *
 * `structured_outputs` is the filter that matters, not price. `generateObject`
 * sends a JSON schema and rejects anything that comes back malformed, so a
 * model without it is not a cheaper option — it is a broken one.
 */

const CATALOGUE_URL = 'https://openrouter.ai/api/v1/models';

/** Public and slow-moving. Long enough to survive a settings page being poked. */
const CACHE_SECONDS = 900;

type CatalogueEntry = {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  supported_parameters?: unknown;
};

export type AiModelOption = {
  id: string;
  name: string;
  contextLength: number | null;
};

const asStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

export async function GET(request: Request) {
  const providerId = new URL(request.url).searchParams.get('providerId') ?? '';

  if (providerId && !isProviderId(providerId)) {
    return Response.json(
      { error: apiError('invalidRequest') },
      { status: 400 }
    );
  }

  // Only OpenRouter publishes a catalogue worth filtering. Everywhere else the
  // answer is an empty list and the free-text field the settings page already
  // has — an empty list is a valid answer here, not a failure.
  if (providerId !== 'openrouter') {
    return Response.json({ models: [] satisfies AiModelOption[] });
  }

  try {
    const response = await fetch(CATALOGUE_URL, {
      // No credential: the catalogue is public, and sending the account key to
      // read a public list would put it on the wire for no reason.
      next: { revalidate: CACHE_SECONDS },
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      return Response.json(
        {
          error: apiError(
            'ai.catalogueUnavailable',
            undefined,
            `OpenRouter answered HTTP ${response.status}.`
          )
        },
        { status: 502 }
      );
    }

    const body = (await response.json()) as { data?: unknown };
    const entries = Array.isArray(body.data) ? (body.data as CatalogueEntry[]) : [];

    const models = entries
      .filter((entry) => {
        const id = typeof entry.id === 'string' ? entry.id : '';
        return (
          id.endsWith(':free') &&
          asStrings(entry.supported_parameters).includes('structured_outputs')
        );
      })
      .map((entry) => ({
        id: entry.id as string,
        name: typeof entry.name === 'string' ? entry.name : (entry.id as string),
        contextLength:
          typeof entry.context_length === 'number' ? entry.context_length : null
      }))
      // Widest context first: the offer text is the long half of every prompt,
      // and a model that cannot hold a full posting is the one that truncates.
      .sort((a, b) => (b.contextLength ?? 0) - (a.contextLength ?? 0));

    return Response.json({ models });
  } catch (error) {
    return Response.json(
      {
        error: apiError(
          'ai.catalogueUnavailable',
          undefined,
          error instanceof Error ? error.message : undefined
        )
      },
      { status: 502 }
    );
  }
}
