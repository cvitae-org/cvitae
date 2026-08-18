import type { Locale } from '@/libs/i18n/config';
import type { JobRecord } from '@/features/JobResearch/types';
import { createId } from '@/features/JobResearch/storage';
import {
  advanceStatus,
  moveRecordToEnd,
  revertStatus
} from '@/features/JobResearch/store';
import {
  addSubmission,
  findByRecord,
  findSubmission,
  setActiveSubmission,
  setSentAt
} from './store';
import type { Submission } from './types';
import { isSendable, toOfferSnapshot } from './types';
import { findApplyEmail } from './offerText';
import { getCvState } from '@/features/CV/store';
import { variantStalenessReasons } from './evidence';

/**
 * The seam between research and submitting.
 *
 * Everything that has to change both stores lives here, so the coupling is one
 * file to read rather than a call to `@/features/JobResearch` buried in each
 * mutation. The dependency only points one way: research knows nothing about
 * submissions, which is what lets a research row be deleted without leaving a
 * dangling application behind.
 */

/**
 * Queues an offer, and moves its research row to the bottom of its tab.
 *
 * Queueing the same offer twice is a mis-click, not an intent to apply twice,
 * so the second attempt opens the submission that already exists rather than
 * making a rival copy of it.
 *
 * `language` is the one the application will be written in. It starts as
 * whatever the app is being used in, which is also what the CV renders in, and
 * is changed per application from the panel.
 *
 * Returns the submission that is now selected, whether it was made here or
 * already existed.
 */
export const queueOffer = (record: JobRecord, language: Locale): Submission => {
  const existing = findByRecord(record.id);

  if (existing) {
    setActiveSubmission(existing.id);
    return existing;
  }

  const submission: Submission = {
    id: createId(),
    recordId: record.id,
    offer: toOfferSnapshot(record),
    language,
    queuedAt: new Date().toISOString(),
    apply: {
      // Prefilled when the posting printed an address, because typing it back
      // out of the offer is the most tedious part of applying. Blank means the
      // offer applies some other way, and the flow says so rather than
      // pretending there is somewhere to send.
      email: findApplyEmail(record),
      subject: '',
      body: ''
    }
  };

  addSubmission(submission);
  moveRecordToEnd(record.id);

  return submission;
};

/**
 * Records that the application went out, and marks the research row applied.
 *
 * The status is advanced rather than set: a row the user has already moved to
 * "interview" stays there.
 */
export const sendSubmission = (id: string): boolean => {
  const submission = findSubmission(id);
  if (!submission || submission.sentAt || !submission.cv || !isSendable(submission)) {
    return false;
  }

  const liveCv = getCvState()[submission.language];
  if (
    variantStalenessReasons(
      submission.cv,
      liveCv,
      submission.offer,
      submission.language
    ).length > 0
  ) {
    return false;
  }

  setSentAt(id, new Date().toISOString());
  advanceStatus(submission.recordId, 'applied');
  return true;
};

/**
 * Takes back a send — the mail client was opened and the draft abandoned.
 *
 * The research row rewinds with it, but only if it still reads "applied": that
 * is exactly what the send put there, and anything else is the user's own
 * more recent knowledge.
 */
export const reopenSubmission = (id: string) => {
  const submission = findSubmission(id);
  if (!submission?.sentAt) return;

  setSentAt(id, undefined);
  revertStatus(submission.recordId, 'applied', 'new');
};
