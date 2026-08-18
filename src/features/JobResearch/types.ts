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

export const offerRequirementPriorities = [
  'required',
  'preferred',
  'unknown'
] as const;
export type OfferRequirementPriority =
  (typeof offerRequirementPriorities)[number];

export const offerRequirementCategories = [
  'skill',
  'responsibility',
  'experience',
  'education',
  'language',
  'certification',
  'location',
  'work-authorization',
  'other'
] as const;
export type OfferRequirementCategory =
  (typeof offerRequirementCategories)[number];

/**
 * A cited request made by the vacancy, kept in its own wording.
 *
 * The id is local to the offer snapshot. It is intentionally not a global
 * identifier: an approved application embeds the requirements it was checked
 * against, so it remains reproducible after the research row changes.
 */
export type OfferRequirement = {
  id: string;
  exactText: string;
  sourceQuote: string;
  category: OfferRequirementCategory;
  priority: OfferRequirementPriority;
};

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
  /** Cited, classified requirements used by evidence-based tailoring. */
  requirements: OfferRequirement[];
};

/**
 * What the board itself stated, as collected by cvitae-scrapper.
 *
 * Kept alongside the analysis rather than only folded into it, because the two
 * disagree and the board wins. Re-analysing a row produces a fresh set of
 * inferred values, and without this the board's exact salary would be replaced
 * by the model's reading of the same text.
 */
export type BoardFacts = {
  company?: string;
  title?: string;
  location?: string;
  work_mode?: string;
  salary?: string;
  seniority?: string;
  start_date?: string;
  required_skills?: string[];
};

/**
 * A tab in the research table.
 *
 * Each imported file becomes one of these, so a scraper run can be read on its
 * own instead of dissolving into everything collected before it.
 */
export type ResearchList = {
  id: string;
  name: string;
  /** ISO timestamp. Orders the strip, and survives a rename. */
  createdAt: string;
};

/**
 * The tab that always exists: offers researched from a URL land in whichever
 * tab is open, and this is the one open by default. It is also where records
 * written before tabs existed are migrated to — so its id is fixed rather than
 * generated, and it cannot be closed.
 */
export const MANUAL_LIST_ID = 'manual';
export const MANUAL_LIST_NAME = 'Manual';

export type ResearchState = {
  records: JobRecord[];
  lists: ResearchList[];
  activeListId: string;
};

export type JobRecord = OfferAnalysis & {
  id: string;
  /** The tab this offer belongs to. Exactly one — tabs partition, not filter. */
  listId: string;
  source_url: string;
  source_mode: SourceMode;
  /**
   * Normalized text that was actually analysed, retained for both imported and
   * URL-based research. It supports cited requirements and reproducible
   * tailoring after the posting expires or the board starts refusing us.
   */
  offer_text?: string;
  board_facts?: BoardFacts;
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
