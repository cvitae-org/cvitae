import { NOT_STATED } from '@/features/JobResearch/types';
import type { ApplyDraft, OfferSnapshot, Submission, SubmittingState } from './types';
import { asLocale } from './types';

/**
 * What a stored queue of applications means.
 *
 * Kept under its own key rather than folded into the research payload, so that
 * clearing a research tab — which deletes rows outright — cannot take a
 * half-written application with it. Same versioned-payload and defensive-read
 * discipline as `JobResearch/storage.ts`: a corrupt entry is dropped, not
 * allowed to break the page. Where it is kept is `createPersistedStore`'s job.
 */

export const STORAGE_KEY = 'cvitae.submitting.v1';
const STORAGE_VERSION = 1;

type StoredPayload = {
  version: number;
  submissions: Submission[];
  activeId?: string | null;
};

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const strList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

/**
 * Rebuilds the snapshot field by field.
 *
 * The snapshot is written from a `JobRecord`, and that record's shape has
 * already changed once (see `migrate` in research storage). Filling gaps here
 * means a submission queued under an older shape still renders, instead of
 * printing `undefined` into a prompt.
 */
const toSnapshot = (value: unknown): OfferSnapshot => {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  const text = (key: string) => {
    const found = raw[key];
    return typeof found === 'string' && found.trim() ? found : NOT_STATED;
  };

  return {
    company: text('company'),
    company_type: text('company_type'),
    company_size: text('company_size'),
    position: text('position'),
    role_profile: text('role_profile'),
    seniority: text('seniority'),
    location: text('location'),
    work_mode:
      raw.work_mode === 'remote' ||
      raw.work_mode === 'hybrid' ||
      raw.work_mode === 'onsite'
        ? raw.work_mode
        : 'unknown',
    salary: text('salary'),
    contract_type: text('contract_type'),
    engagement_length: text('engagement_length'),
    start_date: text('start_date'),
    ideal_candidate: text('ideal_candidate'),
    responsibilities: strList(raw.responsibilities),
    team: text('team'),
    how_to_apply: text('how_to_apply'),
    required_skills: strList(raw.required_skills),
    source_url: str(raw.source_url),
    locale: str(raw.locale, 'en')
  };
};

const toApply = (value: unknown): ApplyDraft => {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  return {
    email: str(raw.email),
    subject: str(raw.subject),
    body: str(raw.body)
  };
};

/**
 * An entry is kept if it can be identified and pointed at an offer. Everything
 * below that — the draft, the tailored CV — is optional by design: a submission
 * queued a minute ago has none of it.
 */
const toSubmission = (value: unknown): Submission | null => {
  if (typeof value !== 'object' || value === null) return null;

  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string') return null;

  const cv =
    typeof raw.cv === 'object' && raw.cv !== null
      ? (raw.cv as Record<string, unknown>)
      : null;

  const offer = toSnapshot(raw.offer);

  return {
    id: raw.id,
    recordId: str(raw.recordId),
    offer,
    // Written since the first release. An entry from before it falls back to
    // the locale the offer was researched in, which is the locale the app was
    // being used in at the time — the same value the field would have been
    // given had it existed.
    language: asLocale(raw.language ?? offer.locale),
    queuedAt: str(raw.queuedAt) || new Date().toISOString(),
    // A CV with no summary is not a tailored CV; treat it as not generated
    // rather than rendering the default document as if it were customised.
    cv:
      cv && typeof cv.summary === 'string' && cv.summary.trim()
        ? {
            title: str(cv.title),
            summary: cv.summary,
            // Entries written before the language was recorded were generated
            // in the only language there was: the submission's.
            language: asLocale(cv.language ?? raw.language ?? offer.locale),
            generatedAt: str(cv.generatedAt) || new Date().toISOString()
          }
        : undefined,
    apply: toApply(raw.apply),
    offerUpdatedAt:
      typeof raw.offerUpdatedAt === 'string' ? raw.offerUpdatedAt : undefined,
    sentAt: typeof raw.sentAt === 'string' ? raw.sentAt : undefined
  };
};

export const emptyState = (): SubmittingState => ({
  submissions: [],
  activeId: null
});

export const parseState = (stored: unknown): SubmittingState => {
  try {
    const parsed = stored as StoredPayload;
    if (!parsed || !Array.isArray(parsed.submissions)) return emptyState();

    const submissions = parsed.submissions
      .map(toSubmission)
      .filter((item): item is Submission => item !== null);

    // A stored selection that no longer exists would leave the detail panel
    // blank with no way to tell why.
    const activeId =
      typeof parsed.activeId === 'string' &&
      submissions.some((item) => item.id === parsed.activeId)
        ? parsed.activeId
        : null;

    return { submissions, activeId };
  } catch (error) {
    console.warn('Could not read stored submissions; starting empty.', error);
    return emptyState();
  }
};

export const serializeState = (state: SubmittingState): StoredPayload => ({
  version: STORAGE_VERSION,
  ...state
});
