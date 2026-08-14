import type { Locale } from '@/libs/i18n/config';
import type {
  ApplyDraft,
  OfferSnapshot,
  Submission,
  SubmittingState,
  TailoredCV
} from './types';
import { createPersistedStore } from '@/libs/storage/persistedStore';
import {
  emptyState,
  parseState,
  serializeState,
  STORAGE_KEY
} from './storage';

/**
 * Module-level store over IndexedDB, read through useSyncExternalStore — the
 * same shape as `JobResearch/store.ts`, and for the same reason: an external
 * mutable source read during render, without hydrating inside an effect.
 *
 * Everything here touches this feature's own state only. Actions that also
 * have to move the research row live in `queue.ts`, so that the dependency
 * between the two features sits in one readable place instead of being spread
 * across mutations.
 */

const store = createPersistedStore<SubmittingState>({
  key: STORAGE_KEY,
  empty: emptyState,
  parse: parseState,
  serialize: serializeState
});

export const {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  getState: getSubmittingState
} = store;

const commit = store.update;

const mapSubmissions = (
  id: string,
  patch: (submission: Submission) => Submission
) => {
  commit((current) =>
    current.submissions.some((item) => item.id === id)
      ? {
          ...current,
          submissions: current.submissions.map((item) =>
            item.id === id ? patch(item) : item
          )
        }
      : current
  );
};

export const findSubmission = (id: string): Submission | undefined =>
  getSubmittingState().submissions.find((item) => item.id === id);

/** The submission already queued for a research row, if there is one. */
export const findByRecord = (recordId: string): Submission | undefined =>
  getSubmittingState().submissions.find((item) => item.recordId === recordId);

/**
 * Adds a submission and selects it.
 *
 * Selecting is the point: queueing an offer is the start of working on it, and
 * landing it in a list without opening it reads as nothing having happened.
 */
export const addSubmission = (submission: Submission) => {
  commit((current) => ({
    submissions: [submission, ...current.submissions],
    activeId: submission.id
  }));
};

export const removeSubmission = (id: string) => {
  commit((current) => {
    const submissions = current.submissions.filter((item) => item.id !== id);
    if (submissions.length === current.submissions.length) return current;

    return {
      submissions,
      activeId: current.activeId === id ? null : current.activeId
    };
  });
};

export const setActiveSubmission = (id: string | null) => {
  commit((current) =>
    current.activeId === id ? current : { ...current, activeId: id }
  );
};

/** Records a generated CV. Regenerating replaces it — there is only ever one. */
export const setTailoredCV = (id: string, cv: TailoredCV) => {
  mapSubmissions(id, (submission) => ({ ...submission, cv }));
};

/**
 * Sets the language the CV and email are written in.
 *
 * Anything already generated is left alone rather than cleared: the previous
 * draft is still the better starting point for an edit than an empty box, and
 * the panel says which language it was written in so the mismatch is visible
 * instead of silent.
 */
export const setLanguage = (id: string, language: Locale) => {
  mapSubmissions(id, (submission) => ({ ...submission, language }));
};

/**
 * Replaces the offer snapshot after the research row has been re-analysed.
 *
 * Stamped, so a CV generated from the earlier and thinner reading can be
 * flagged as predating it.
 */
export const setOffer = (id: string, offer: OfferSnapshot) => {
  mapSubmissions(id, (submission) => ({
    ...submission,
    offer,
    offerUpdatedAt: new Date().toISOString()
  }));
};

export const patchApply = (id: string, patch: Partial<ApplyDraft>) => {
  mapSubmissions(id, (submission) => ({
    ...submission,
    apply: { ...submission.apply, ...patch }
  }));
};

/**
 * Marks the application as sent, or unsent.
 *
 * Both directions exist because sending hands off to a mail client: the click
 * that opens the draft is the last thing this app sees, and the user is the
 * only one who knows whether they went through with it.
 *
 * Callers should use `sendSubmission` / `reopenSubmission` in `queue.ts`
 * instead, so the research row's status follows.
 */
export const setSentAt = (id: string, sentAt: string | undefined) => {
  mapSubmissions(id, (submission) => ({ ...submission, sentAt }));
};
