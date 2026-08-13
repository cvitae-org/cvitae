/**
 * Record format for a researched job offer.
 *
 * Every analysed offer lands here with the same fields filled, or it does not
 * land at all — there is no partially-researched state. Fields the offer is
 * silent about read "Not stated" rather than going missing.
 *
 * This records what an offer says; it deliberately does not score fit. That
 * judgement needed the CV in every prompt, was the slowest and least reliable
 * step, and produced a number nobody trusted.
 */

export const workModes = ['remote', 'hybrid', 'onsite', 'unknown'] as const;
export type WorkMode = (typeof workModes)[number];

/** Where the offer text came from, since it changes how much to trust it. */
export const sourceModes = ['url', 'manual'] as const;
export type SourceMode = (typeof sourceModes)[number];

/** User-managed pipeline state, untouched by the analysis. */
export const applicationStatuses = [
  'new',
  'applied',
  'interview',
  'rejected',
  'archived'
] as const;
export type ApplicationStatus = (typeof applicationStatuses)[number];

/**
 * Fields that describe the offer rather than the fit. Every one is a plain
 * string so an absent detail reads as "Not stated" instead of vanishing —
 * knowing the offer is silent about salary is itself worth recording.
 */
export const NOT_STATED = 'Not stated';

/** The part the model produces. Kept separate so it can be re-run in place. */
export type OfferAnalysis = {
  company: string;
  /** What the business actually does, e.g. "IT outsourcing", "AI diagnostics". */
  company_type: string;
  company_size: string;
  position: string;
  /** Role plus its core stack, e.g. "Frontend Developer (React, TypeScript)". */
  role_profile: string;
  seniority: string;
  location: string;
  work_mode: WorkMode;
  salary: string;
  /** B2B, UoP, zlecenie, or a combination. */
  contract_type: string;
  /** Long-term vs a fixed project, when the offer says. */
  engagement_length: string;
  start_date: string;
  /** Prose description of the candidate the offer is looking for. */
  ideal_candidate: string;
  responsibilities: string[];
  team: string;
  /** Application route: form, email, recruiter contact, referral. */
  how_to_apply: string;
  /** Everything the offer asks for, in the offer's own words. */
  required_skills: string[];
};

export type JobRecord = OfferAnalysis & {
  id: string;
  source_url: string;
  source_mode: SourceMode;
  /** Populated when the fetch degraded, e.g. bot-blocked and pasted by hand. */
  source_note: string;
  /** ISO timestamp of the analysis. */
  checked_at: string;
  locale: string;
  status: ApplicationStatus;
  notes: string;
};

export const isApplicationStatus = (
  value: unknown
): value is ApplicationStatus =>
  typeof value === 'string' &&
  (applicationStatuses as readonly string[]).includes(value);
