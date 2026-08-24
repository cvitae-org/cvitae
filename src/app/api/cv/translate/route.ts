import {
  clientKeyBlocksDelegation,
  runCapability,
  toRuntimeModel
} from '@/libs/runtime/client';
import { apiError } from '@/libs/i18n/errors';

/**
 * Translates selected sections of the browser-owned CV through the local
 * runtime. Like import, this has no in-process fallback: provider credentials,
 * prompts and structured generation belong to cvitae-agent-runtime.
 */

export const maxDuration = 60;

const DEFAULT_TIMEOUT_MS = 240_000;
const RUNTIME_ABSENT =
  'cvitae-agent-runtime is not running. Translating a CV needs it, so start it with pnpm dev in that project and try again.';

const LOCALES = ['en', 'pl'] as const;
type Locale = (typeof LOCALES)[number];
const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && LOCALES.includes(value as Locale);

const TRANSLATION_SECTIONS = [
  'personal',
  'role_description',
  'skills',
  'experience',
  'education',
  'certificates',
  'languages'
] as const;
type TranslationSection = (typeof TRANSLATION_SECTIONS)[number];
const isTranslationSection = (value: unknown): value is TranslationSection =>
  typeof value === 'string' &&
  TRANSLATION_SECTIONS.includes(value as TranslationSection);

type RuntimeTranslation = {
  document: unknown;
  translated: TranslationSection[];
  source_language: Locale;
  target_language: Locale;
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

  const {
    document,
    source_language,
    target_language,
    sections,
    ai,
    timeoutMs
  } = (body ?? {}) as {
    document?: unknown;
    source_language?: unknown;
    target_language?: unknown;
    sections?: unknown;
    ai?: Record<string, unknown>;
    timeoutMs?: unknown;
  };

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return Response.json(
      { error: apiError('invalidRequest', undefined, 'Missing CV document.') },
      { status: 400 }
    );
  }

  if (
    !isLocale(source_language) ||
    !isLocale(target_language) ||
    source_language === target_language
  ) {
    return Response.json(
      {
        error: apiError(
          'invalidRequest',
          undefined,
          'Source and target languages must be different EN/PL locales.'
        )
      },
      { status: 400 }
    );
  }

  if (
    !Array.isArray(sections) ||
    sections.length === 0 ||
    !sections.every(isTranslationSection) ||
    new Set(sections).size !== sections.length
  ) {
    return Response.json(
      {
        error: apiError(
          'invalidRequest',
          undefined,
          'Choose one or more distinct supported CV sections.'
        )
      },
      { status: 400 }
    );
  }

  const requestedSections = sections as TranslationSection[];

  const budget =
    typeof timeoutMs === 'number' && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_TIMEOUT_MS;

  /*
   * The user's own key is forwarded to the runtime, which spends it for the one
   * call — so this only refuses when the key cannot get there safely, meaning a
   * remote `RUNTIME_URL` on plain HTTP. Delegating anyway would drop the key in
   * transit and answer on the server's credential, quietly spending someone
   * else's quota while the user believed they were spending their own.
   */
  if (clientKeyBlocksDelegation(ai)) {
    return Response.json(
      { error: apiError('clientKeyNotDelegable'), reason: 'client_key' },
      { status: 400 }
    );
  }

  const outcome = await runCapability<RuntimeTranslation>(
    'translate_cv',
    {
      document,
      source_language,
      target_language,
      sections: requestedSections
    },
    {
      // Translation is a constrained, schema-driven copy task. Use the
      // independently configurable extraction model so a large customisation
      // model cannot hold every section behind its much slower inference.
      // `toRuntimeModel` falls back to the main model when no extraction model
      // has been selected.
      model: toRuntimeModel(ai, 'extraction', process.env.AI_PROVIDER),
      timeoutMs: budget
    }
  );

  if (outcome.status === 'unavailable') {
    return Response.json(
      {
        error: apiError('cv.translationFailed', undefined, RUNTIME_ABSENT),
        reason: 'runtime_unavailable'
      },
      { status: 503 }
    );
  }

  if (outcome.status === 'failed') {
    return Response.json(
      {
        error: apiError('cv.translationFailed', undefined, outcome.detail),
        reason: outcome.reason
      },
      { status: outcome.reason === 'invalid_input' ? 400 : 502 }
    );
  }

  const translated = outcome.result.data;
  const returnedSections = Array.isArray(translated.translated)
    ? translated.translated
    : [];
  const contractMatches =
    translated.document !== null &&
    typeof translated.document === 'object' &&
    !Array.isArray(translated.document) &&
    translated.source_language === source_language &&
    translated.target_language === target_language &&
    returnedSections.length === requestedSections.length &&
    requestedSections.every(
      (section, index) => returnedSections[index] === section
    );

  if (!contractMatches) {
    return Response.json(
      {
        error: apiError(
          'cv.translationFailed',
          undefined,
          'Runtime response language or section did not match the request.'
        ),
        reason: 'runtime_contract_mismatch'
      },
      { status: 502 }
    );
  }

  return Response.json({
    document: translated.document,
    translated: returnedSections,
    source_language: translated.source_language,
    target_language: translated.target_language,
    degraded: outcome.result.degraded,
    elapsedMs: outcome.result.elapsedMs
  });
}
