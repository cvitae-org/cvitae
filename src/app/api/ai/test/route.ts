import { AiConfigError, resolveModel } from '@/libs/ai/providers';
import { apiError } from '@/libs/i18n/errors';

type AiModule = typeof import('ai');

let aiModulePromise: Promise<AiModule> | null = null;
const loadAiModule = async (): Promise<AiModule> => {
  if (!aiModulePromise) {
    aiModulePromise = import('ai');
  }
  return aiModulePromise;
};

export const maxDuration = 60;

/**
 * Round-trips a one-token prompt so Settings can report whether the chosen
 * provider actually answers, rather than letting the user find out during a
 * 40-second offer analysis.
 */
export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const { ai } = await req.json();

    const [{ generateText }, { model, providerId, modelId }] =
      await Promise.all([loadAiModule(), resolveModel(ai ?? {})]);

    const { text } = await generateText({
      model,
      prompt: 'Reply with the single word: ok',
      // Generous enough that a model which emits reasoning tokens first still
      // produces visible output, so a working connection never looks empty.
      maxOutputTokens: 64
    });

    return Response.json({
      ok: true,
      providerId,
      modelId,
      latencyMs: Date.now() - startedAt,
      reply: text.trim().slice(0, 40)
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: apiError(
          error instanceof AiConfigError ? 'providerConfig' : 'providerFailed',
          undefined,
          error
        ),
        latencyMs: Date.now() - startedAt
      },
      { status: 200 }
    );
  }
}
