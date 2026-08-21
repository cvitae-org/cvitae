"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import {
  errorFromApi,
  type ErrorDescriptor
} from '@/libs/i18n/errors';
import { loadSettings, toRequestOverride } from '@/features/Settings/aiSettings';
import { getCvState } from '@/features/CV/store';
import {
  getServerSnapshot,
  getSnapshot,
  patchApply,
  setEvidenceCV,
  subscribe
} from '../store';
import { liveOfferText, toOfferBrief } from '../offerText';
import type {
  ApplyDraft,
  EvidenceProposalResponse,
  Submission
} from '../types';
import {
  buildEvidenceRequest,
  createEvidenceVariant,
  EvidenceValidationError
} from '../evidence';

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
  const [error, setError] = useState<ErrorDescriptor | null>(null);

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
      payload: Record<string, unknown>,
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
          const descriptor = errorFromApi(
            data,
            action === 'cv'
              ? 'cv.generateFailed'
              : 'submitting.emailFailed'
          );
          const issues = Array.isArray(data.issues)
            ? data.issues
                .filter((issue: unknown): issue is string =>
                  typeof issue === 'string'
                )
                .slice(0, 3)
                .join(' ')
            : '';
          setError({
            ...descriptor,
            detail: [descriptor.detail, issues].filter(Boolean).join(' ') || undefined
          });
          return false;
        }

        try {
          onSuccess(data);
        } catch (cause) {
          setError(
            cause instanceof EvidenceValidationError
              ? {
                  code: 'submitting.evidenceRejected',
                  detail: cause.issues.slice(0, 3).join(' ')
                }
              : {
                  code: 'submitting.materializeFailed',
                  detail:
                    cause instanceof Error ? cause.message.slice(0, 500) : undefined
                }
          );
          return false;
        }
        return true;
      } catch (cause) {
        setError({
          code: 'submitting.serviceUnreachable',
          detail:
            cause instanceof Error ? cause.message.slice(0, 500) : undefined
        });
        return false;
      } finally {
        setPending(null);
      }
    },
    []
  );

  /** Builds a cited proposal and materializes only the permitted CV fields. */
  const generateCv = useCallback(
    async (submission: Submission) => {
      const sourceCv = getCvState()[submission.language];
      const request = buildEvidenceRequest(
        sourceCv,
        submission.offer,
        submission.language
      );

      return call(
        'cv',
        '/api/cv/generate',
        { ...request },
        (data) => {
          const response = data as EvidenceProposalResponse;
          if (response.version !== 'evidence-v2' || !response.proposal) {
            throw new Error('Unexpected evidence proposal response.');
          }
          setEvidenceCV(
            submission.id,
            createEvidenceVariant({
              sourceCv,
              sourceOffer: submission.offer,
              language: submission.language,
              response
            })
          );
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
        liveOfferText(submission.recordId) ?? submission.offer.offer_text
      );

      return call(
        'email',
        '/api/jobs/apply-email',
        {
          offer: brief,
          locale: submission.language,
          company: submission.offer.company,
          position: submission.offer.position,
          cvTitle: submission.cv?.output.skills.role,
          cvSummary: submission.cv?.output.role_description,
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
