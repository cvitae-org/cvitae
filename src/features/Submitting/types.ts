import type { JobRecord, OfferAnalysis } from '@/features/JobResearch/types';
import { NOT_STATED } from '@/features/JobResearch/types';
import { defaultLocale, locales, type Locale } from '@/libs/i18n/config';

/**
 * An offer picked out of research and taken through to a sent application.
 *
 * Research answers "what does this offer say"; this answers "what have I done
 * about it". The two are separate stores because they have separate lifetimes:
 * a research row can be cleared, re-run or deleted with its whole tab, and none
 * of that should take a half-written application with it.
 */

/**
 * The offer as it stood when it was queued, minus the scraped text.
 *
 * A copy rather than a pointer, because the research row it came from can be
 * deleted, re-analysed, or lost with its tab, and an application already in
 * flight must not blank out when that happens. The offer text is deliberately
 * left behind — it is the largest thing in the record, it already sits in the
 * research store, and copying it per submission is the fastest route to a
 * localStorage quota failure. `toOfferBrief` reads the live row for it when a
 * prompt needs it, and falls back to these fields when the row is gone.
 */
export type OfferSnapshot = OfferAnalysis & {
  source_url: string;
  locale: string;
};

/** The tailored half of the CV: everything else is the same document. */
export type TailoredCV = {
  title: string;
  summary: string;
  /**
   * What it was written in, which is not necessarily what the application is
   * set to now. Recorded so that switching the language after generating says
   * so, instead of leaving an English summary inside a Polish CV.
   */
  language: Locale;
  /** ISO timestamp. Shows whether the preview predates the last edit. */
  generatedAt: string;
};

/**
 * The application itself, as opposed to the CV attached to it.
 *
 * Held as plain editable text rather than regenerated on demand: the model
 * writes a first draft, the user rewrites the half of it that is wrong, and
 * that edit has to survive a reload.
 */
export type ApplyDraft = {
  /** Recipient. Empty when the offer applies through a form instead. */
  email: string;
  subject: string;
  body: string;
};

export type Submission = {
  id: string;
  /**
   * The research row this came from. Used to write the status back, and to
   * reach the stored offer text when the analysis is re-run — the submission
   * is readable without it, and keeps working once it is gone.
   */
  recordId: string;
  offer: OfferSnapshot;
  /**
   * The language this application is written in: the CV, and the email.
   *
   * Per submission rather than per session, because it is a property of the
   * application and not of how the app is being browsed — a Kraków posting
   * written in Polish is worth answering in Polish from an English UI, and the
   * next application in the queue may go the other way.
   */
  language: Locale;
  /** ISO timestamp of when it was queued. */
  queuedAt: string;
  cv?: TailoredCV;
  apply: ApplyDraft;
  /**
   * ISO timestamp of the last time the offer snapshot was refreshed by
   * re-analysing it. Kept so a CV generated from the thinner earlier reading
   * can say so, rather than looking equally current.
   */
  offerUpdatedAt?: string;
  /** ISO timestamp. Its presence is what "sent" means. */
  sentAt?: string;
};

export const asLocale = (value: unknown): Locale =>
  typeof value === 'string' && (locales as readonly string[]).includes(value)
    ? (value as Locale)
    : defaultLocale;

/**
 * Fields only a reading of the offer text can fill.
 *
 * Imported rows arrive with all of these empty — the board publishes none of
 * them — and they are most of what makes a tailored CV specific rather than
 * generic. Counting them is what gives the "Analyse" action a visible reason.
 */
const inferredFields: (keyof OfferSnapshot)[] = [
  'company_type',
  'company_size',
  'role_profile',
  'engagement_length',
  'ideal_candidate',
  'team',
  'how_to_apply'
];

export const countOfferGaps = (offer: OfferSnapshot): number => {
  const missing = inferredFields.filter((field) => {
    const value = offer[field];
    return typeof value !== 'string' || !value || value === NOT_STATED;
  }).length;

  return missing + (offer.responsibilities.length === 0 ? 1 : 0);
};

/** Whether the CV was written before the offer was last re-analysed. */
export const isCvStale = (submission: Submission): boolean =>
  Boolean(
    submission.cv &&
      submission.offerUpdatedAt &&
      submission.offerUpdatedAt > submission.cv.generatedAt
  );

export type SubmittingState = {
  submissions: Submission[];
  /** Which one the detail panel is showing. Null before anything is picked. */
  activeId: string | null;
};

/**
 * How far an application has got.
 *
 * Derived from the record rather than stored on it. A stored stage is a second
 * copy of facts already present — a CV that exists, a body that is written, a
 * send that happened — and the two drift the moment one of them is written
 * without the other.
 */
export const submissionStages = ['queued', 'tailored', 'ready', 'sent'] as const;
export type SubmissionStage = (typeof submissionStages)[number];

/**
 * How the application leaves: a mail client, or the board's own form.
 *
 * Driven by whether there is an address to send to, because that is the only
 * thing that actually decides it. An offer that says "apply through our portal"
 * has no address to fill in, and one whose posting prints a recruiter's address
 * does — no separate switch needed.
 */
export type ApplyMethod = 'email' | 'link';

export const applyMethodOf = (submission: Submission): ApplyMethod =>
  submission.apply.email.trim() ? 'email' : 'link';

/**
 * Whether there is enough here to actually send.
 *
 * The subject is not part of it: an empty one falls back to a default built
 * from the position, so it can never be the thing standing in the way.
 */
export const isSendable = (submission: Submission): boolean => {
  if (!submission.cv) return false;

  return applyMethodOf(submission) === 'email'
    ? submission.apply.body.trim() !== ''
    : submission.offer.source_url.trim() !== '';
};

export const stageOf = (submission: Submission): SubmissionStage => {
  if (submission.sentAt) return 'sent';
  if (isSendable(submission)) return 'ready';
  return submission.cv ? 'tailored' : 'queued';
};

export const stageLabels: Record<SubmissionStage, string> = {
  queued: 'Queued',
  tailored: 'CV ready',
  ready: 'Ready to send',
  sent: 'Sent'
};

/** Drops the parts of a research row a submission has no business copying. */
export const toOfferSnapshot = (record: JobRecord): OfferSnapshot => ({
  company: record.company,
  company_type: record.company_type,
  company_size: record.company_size,
  position: record.position,
  role_profile: record.role_profile,
  seniority: record.seniority,
  location: record.location,
  work_mode: record.work_mode,
  salary: record.salary,
  contract_type: record.contract_type,
  engagement_length: record.engagement_length,
  start_date: record.start_date,
  ideal_candidate: record.ideal_candidate,
  responsibilities: record.responsibilities,
  team: record.team,
  how_to_apply: record.how_to_apply,
  required_skills: record.required_skills,
  source_url: record.source_url,
  locale: record.locale
});
