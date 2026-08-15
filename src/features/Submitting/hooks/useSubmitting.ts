"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { loadSettings, toRequestOverride } from '@/features/Settings/aiSettings';
import { getCvState } from '@/features/CV/store';
import {
  getServerSnapshot,
  getSnapshot,
  patchApply,
  setTailoredCV,
  subscribe
} from '../store';
import { liveOfferText, toOfferBrief } from '../offerText';
import type { ApplyDraft, Submission } from '../types';

/**
 * Reads the queue, and runs the two model calls the flow needs.
 *
 * Both calls are per-submission but only one can be in flight at a time — they
 * are triggered by buttons in a single detail panel, and a shared pending flag
 * is what stops a second click landing on top of the first.
 */

export type PendingAction = 'cv' | 'email' | null;

export const useSubmitting = () => {
  const {
    data: { submissions, activeId },
    // False until the queue has been read back out of IndexedDB — an empty
    // list and an unread one look identical otherwise.
    hydrated
  } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Sent applications sink to the bottom. They are kept — a record of where
   * the CV went is the point of the list — but the work is in the ones above.
   */
  const ordered = useMemo(() => {
    const rank = (submission: Submission) => (submission.sentAt ? 1 : 0);
    return [...submissions].sort((a, b) => rank(a) - rank(b));
  }, [submissions]);

  const active = useMemo(
    () => submissions.find((item) => item.id === activeId) ?? null,
    [submissions, activeId]
  );

  const call = useCallback(
    async (
      action: Exclude<PendingAction, null>,
      url: string,
      // The locale here is the submission's own, not the app's: it decides
      // what language the model writes in, and that is a choice made per
      // application rather than by whichever version of the site is open.
      payload: Record<string, unknown> & { locale: string },
      onSuccess: (data: Record<string, unknown>) => void
    ) => {
      setPending(action);
      setError(null);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            ai: toRequestOverride(loadSettings())
          })
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error ?? 'The model could not be reached.');
          return false;
        }

        onSuccess(data);
        return true;
      } catch {
        setError('Could not reach the AI service.');
        return false;
      } finally {
        setPending(null);
      }
    },
    []
  );

  /**
   * Rewrites the CV's title and summary for this offer.
   *
   * The rest of the document — experience, education, skills — is fixed; those
   * are facts, and this is the part of a CV that is genuinely per-application.
   */
  const generateCv = useCallback(
    async (submission: Submission) => {
      const brief = toOfferBrief(
        submission.offer,
        liveOfferText(submission.recordId)
      );

      return call(
        'cv',
        '/api/cv/generate',
        {
          jobOffer: brief,
          locale: submission.language,
          // Read at send time rather than subscribed to: this is an event
          // handler, and the CV that matters is the one for the language the
          // application is being written in, not the one the page is showing.
          cv: getCvState()[submission.language]
        },
        (data) => {
          if (typeof data.summary !== 'string') return;
          setTailoredCV(submission.id, {
            title: typeof data.title === 'string' ? data.title : '',
            summary: data.summary,
            language: submission.language,
            generatedAt: new Date().toISOString()
          });
        }
      );
    },
    [call]
  );

  /** Drafts the email the CV is attached to. Overwrites whatever is there. */
  const draftEmail = useCallback(
    async (submission: Submission) => {
      const brief = toOfferBrief(
        submission.offer,
        liveOfferText(submission.recordId)
      );

      return call(
        'email',
        '/api/jobs/apply-email',
        {
          offer: brief,
          locale: submission.language,
          company: submission.offer.company,
          position: submission.offer.position,
          cvTitle: submission.cv?.title,
          cvSummary: submission.cv?.summary,
          cv: getCvState()[submission.language]
        },
        (data) => {
          // Built key by key rather than spread: an explicit `subject:
          // undefined` would land in the patch and blank a subject the user
          // had already written, which is the opposite of leaving it alone.
          const patch: Partial<ApplyDraft> = {
            body: typeof data.body === 'string' ? data.body : ''
          };

          if (typeof data.subject === 'string' && data.subject.trim()) {
            patch.subject = data.subject;
          }

          patchApply(submission.id, patch);
        }
      );
    },
    [call]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    submissions: ordered,
    active,
    activeId,
    hydrated,
    generateCv,
    draftEmail,
    pending,
    error,
    clearError
  };
};

/**
 * Just the queued research ids, for the research table.
 *
 * Separate from `useSubmitting` so the research page subscribes to the queue
 * without pulling in the drafting state — and without the AI settings read
 * that comes with it.
 */
export const useQueuedRecordIds = (): Set<string> => {
  const {
    data: { submissions }
  } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(
    () => new Set(submissions.map((item) => item.recordId)),
    [submissions]
  );
};
