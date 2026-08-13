import { z } from 'zod';
import type { LanguageModel } from 'ai';
import { workModes } from '@/features/JobResearch/types';

/**
 * Offer analysis split across narrow-schema calls.
 *
 * One 23-field object was the source of the recurring failures: long JSON gives
 * a small model more room to truncate or corrupt a key, and a single slip
 * discards the whole response. Five focused calls each emit a short object.
 *
 * Whether the split costs wall time depends entirely on the provider. A hosted
 * one runs all five at once and pays for the slowest; a local server is a
 * single GPU, so `concurrency` drops to 1 and the caller pays the sum — one
 * offer measured at 143s on gemma4:12b against 10-20s on gemma3:4b, which is
 * why the extraction model is the setting that matters for local runs.
 *
 * The other cost is request count: one offer is five provider calls, which
 * matters against a per-day request quota rather than a token budget.
 */

const factsSchema = z.object({
  company: z.string().describe('Company name, or "Unknown".'),
  company_type: z.string().describe('What the business does, e.g. "IT outsourcing", "car parts e-commerce", "AI medical imaging". Not "software company".'),
  company_size: z.string().describe('Headcount if stated, else "Not stated".'),
  team: z.string().describe('Team size or structure if described, else "Not stated".')
});

const roleSchema = z.object({
  position: z.string().describe('Job title exactly as stated.'),
  role_profile: z.string().describe('Role plus core stack, e.g. "Frontend Developer (React, TypeScript)".'),
  seniority: z.string().describe('Junior/Mid/Senior/Lead, or "Unknown".'),
  ideal_candidate: z.string().describe('1-2 sentences describing the candidate the offer wants.')
});

const compensationSchema = z.object({
  salary: z.string().describe('Range exactly as stated including currency and period, else "Not stated".'),
  contract_type: z.string().describe('Form of employment only: B2B, UoP (umowa o pracę), zlecenie, or a combination. Never a date. "Not stated" if absent.'),
  engagement_length: z.string().describe('How long the engagement runs: long-term, permanent, or a fixed project duration such as "6 months". Never a start date, and never how long the posting stays online ("valid until", "Oferta ważna do"). "Not stated" if absent.')
});

const logisticsSchema = z.object({
  location: z.string().describe('City, or "Unknown".'),
  work_mode: z.enum(workModes),
  start_date: z.string().describe('When the work begins: a date or "ASAP". "Not stated" if absent.'),
  how_to_apply: z.string().describe('How to apply: apply form or button, email address, recruiter contact, or referral. "Not stated" if absent.')
});

const dutiesSchema = z.object({
  responsibilities: z.array(z.string()).describe('Day-to-day duties from the offer. Empty array if none listed.'),
  required_skills: z.array(z.string()).describe('Every skill, technology or qualification the offer requires.')
});

// Kept deliberately plain. An earlier wording of these two lines made
// gemma4:12b return an empty completion every time, while the identical schema
// with a one-line instruction succeeded — the phrasing, not the schema, was the
// trigger. Prefer short declarative sentences here over emphatic instructions.
const EXTRACTION_RULES = `Use only information present in the offer. Do not infer or invent.
When the offer does not mention a field, answer: Not stated`;

type AgentName = 'facts' | 'role' | 'compensation' | 'logistics' | 'duties';

type Agent = {
  name: AgentName;
  schema: z.ZodTypeAny;
  system: (locale: string) => string;
  maxOutputTokens: number;
  /** A failure here invalidates the record; others degrade to "Not stated". */
  critical: boolean;
};

const agents: Agent[] = [
  {
    name: 'facts',
    schema: factsSchema,
    system: () => `Extract company details from the job offer.\n${EXTRACTION_RULES}`,
    maxOutputTokens: 800,
    critical: false
  },
  {
    name: 'role',
    // Kept to the bare instruction. Appending the extraction rules or a
    // language directive here made gemma4:12b return an empty completion every
    // time, with the same schema that succeeds without them. The field
    // descriptions carry the guidance instead.
    schema: roleSchema,
    system: () => 'Extract the role being advertised.',
    maxOutputTokens: 900,
    critical: true
  },
  {
    name: 'compensation',
    schema: compensationSchema,
    system: () =>
      `Extract the commercial terms of the job offer: pay, form of employment, and how long the engagement lasts.\n${EXTRACTION_RULES}`,
    maxOutputTokens: 900,
    critical: false
  },
  {
    name: 'logistics',
    schema: logisticsSchema,
    // Split out of a single 7-field "terms" agent, which repeatedly put a start
    // date into contract_type and engagement_length. Separating pay from
    // place-and-time keeps each field next to the ones it can be confused with.
    system: () =>
      `Extract where and when the work happens, and how to apply.\n${EXTRACTION_RULES}`,
    maxOutputTokens: 700,
    critical: false
  },
  {
    name: 'duties',
    schema: dutiesSchema,
    system: () =>
      `List the responsibilities and required skills from the job offer.\n${EXTRACTION_RULES}`,
    // Two arrays in one object: measured at exactly 900 output tokens with
    // finishReason "length", i.e. truncated mid-array. This is the widest
    // output of any agent and needs the most headroom, not the least.
    maxOutputTokens: 2_500,
    critical: false
  }
];

/**
 * Keys whose values are enums, not prose. `work_mode` legitimately carries the
 * lowercase literal "unknown" and must not be title-cased into an invalid one.
 */
const ENUM_KEYS = new Set(['work_mode']);

/**
 * Models spell absence half a dozen ways — "not_stated", "N/A", "none",
 * "brak". The UI greys out a field by comparing against the canonical string,
 * so anything else renders as though the offer really said it.
 */
const ABSENT = /^(not[\s_-]?stated|n\/?a|none|brak|nie podano|unspecified)$/i;
const UNKNOWN = /^(unknown|nieznane|nieznany)$/i;

const canonicalise = (analysis: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(analysis)) {
    if (typeof value !== 'string' || ENUM_KEYS.has(key)) continue;
    const trimmed = value.trim();
    if (ABSENT.test(trimmed)) analysis[key] = 'Not stated';
    else if (UNKNOWN.test(trimmed)) analysis[key] = 'Unknown';
    else if (trimmed !== value) analysis[key] = trimmed;
  }
  return analysis;
};

/** Values used when a non-critical agent fails, so the shape stays complete. */
const fallbacks: Record<string, unknown> = {
  company: 'Unknown',
  company_type: 'Not stated',
  company_size: 'Not stated',
  team: 'Not stated',
  location: 'Unknown',
  work_mode: 'unknown',
  salary: 'Not stated',
  contract_type: 'Not stated',
  engagement_length: 'Not stated',
  start_date: 'Not stated',
  how_to_apply: 'Not stated',
  responsibilities: [],
  required_skills: []
};

const fallbackFor = (schema: z.ZodTypeAny): Record<string, unknown> => {
  const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
  return Object.fromEntries(
    Object.keys(shape).map((key) => [key, fallbacks[key] ?? 'Not stated'])
  );
};

export type AnalyzeResult = {
  analysis: Record<string, unknown>;
  /** Non-critical agents that failed; surfaced so the gap is not silent. */
  degraded: AgentName[];
};

export class OfferAnalysisError extends Error {}

/**
 * Runs tasks with at most `limit` in flight.
 *
 * Concurrency has to match what is on the other end. A hosted API absorbs all
 * five at once; a single local GPU serialises them anyway, and firing five
 * together just starves each one until requests drop — measured as a 4m39s run
 * where one agent returned nothing at all.
 */
const runPooled = async <T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<PromiseSettledResult<T>[]> => {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < tasks.length) {
      const index = cursor++;
      try {
        results[index] = { status: 'fulfilled', value: await tasks[index]() };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker)
  );

  return results;
};

export const analyzeOffer = async ({
  model,
  offerText,
  locale,
  concurrency,
  generateObject,
  isNoObjectError
}: {
  /**
   * Every agent copies values that are already in the text, so one model runs
   * all five. An earlier two-tier split reserved a stronger model for judging
   * CV fit; that step is gone, and with it the reason to resolve two.
   */
  model: LanguageModel;
  offerText: string;
  locale: string;
  concurrency: number;
  generateObject: typeof import('ai').generateObject;
  isNoObjectError: (error: unknown) => boolean;
}): Promise<AnalyzeResult> => {
  const prompt = `JOB OFFER:\n${offerText}`;

  const runAgent = async (agent: Agent) => {
    const call = () =>
      generateObject({
        model,
        schema: agent.schema,
        system: agent.system(locale),
        prompt,
        maxOutputTokens: agent.maxOutputTokens
      });

    try {
      return await call();
    } catch (error) {
      // A malformed short object is cheap to redo, unlike the combined call.
      if (!isNoObjectError(error)) throw error;
      console.warn(`Agent "${agent.name}" returned malformed JSON; retrying.`);
      return call();
    }
  };

  const settled = await runPooled(
    agents.map((agent) => () => runAgent(agent)),
    concurrency
  );

  const analysis: Record<string, unknown> = {};
  const degraded: AgentName[] = [];

  settled.forEach((result, index) => {
    const agent = agents[index];

    if (result.status === 'fulfilled') {
      Object.assign(analysis, result.value.object as Record<string, unknown>);
      return;
    }

    if (agent.critical) {
      throw new OfferAnalysisError(
        `The "${agent.name}" step failed: ${String(result.reason?.message ?? result.reason).slice(0, 160)}`
      );
    }

    console.warn(`Agent "${agent.name}" failed; filling defaults.`, result.reason);
    Object.assign(analysis, fallbackFor(agent.schema));
    degraded.push(agent.name);
  });

  return { analysis: canonicalise(analysis), degraded };
};
