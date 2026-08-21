"use client";

import { useTranslations } from 'next-intl';
import type { Submission, SubmissionStage } from '../types';
import { stageOf } from '../types';
import { removeSubmission, setActiveSubmission } from '../store';

/**
 * The list of offers being applied to, and which one the panel below is
 * showing.
 *
 * Compact and scrollable rather than a full table: research is where offers
 * are read and compared, and by the time one reaches here the decision has
 * been made — all that is left is to see how far it has got.
 */

type SubmissionQueueProps = {
  submissions: Submission[];
  activeId: string | null;
  /** False while the queue is still being read out of IndexedDB. */
  hydrated: boolean;
};

const stageStyles: Record<SubmissionStage, string> = {
  queued: 'bg-gray-100 text-gray-500',
  tailored: 'bg-[#65B7FF]/15 text-[#2a7fc4]',
  ready: 'bg-amber-100 text-amber-700',
  sent: 'bg-green-100 text-green-700'
};

export function SubmissionQueue({
  submissions,
  activeId,
  hydrated
}: SubmissionQueueProps) {
  const t = useTranslations('submitting');
  const common = useTranslations('common');
  const display = (value: string) =>
    value === 'Unknown'
      ? common('unknown')
      : value === 'Not stated'
        ? common('notStated')
        : value;

  // An unread queue and an empty one look the same; only one of them should
  // be told to go and add something.
  if (!hydrated) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
        <p className="text-sm text-gray-400">{t('queue.loading')}</p>
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
        <p className="text-sm font-medium text-gray-700">
          {t('queue.emptyTitle')}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {t('queue.emptyDescription')}
        </p>
      </div>
    );
  }

  return (
    <ul className="max-h-[288px] divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200 bg-white">
      {submissions.map((submission) => {
        const stage = stageOf(submission);
        const isActive = submission.id === activeId;
        const position = display(submission.offer.position);
        const company = display(submission.offer.company);

        return (
          <li key={submission.id} className="relative">
            <div
              className={`flex items-center gap-2 transition-colors ${
                isActive ? 'bg-gray-50' : 'hover:bg-gray-50/70'
              }`}
            >
              {/* The whole row selects, since selecting is the only thing a
                  row does — the actions all live in the panel below. */}
              <button
                type="button"
                onClick={() => setActiveSubmission(submission.id)}
                aria-current={isActive}
                className="min-w-0 flex-1 px-3 py-2.5 text-left"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`block h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                      isActive ? 'bg-[#65B7FF]' : 'bg-transparent'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold leading-tight text-gray-900">
                      {position}
                    </span>
                    <span className="mt-0.5 block truncate text-xs leading-tight text-gray-500">
                      {company}
                    </span>
                  </span>
                  <span
                    className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${stageStyles[stage]}`}
                  >
                    {t(`stages.${stage}`)}
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => removeSubmission(submission.id)}
                title={t('queue.removeTitle')}
                aria-label={t('queue.removeAria', {
                  position,
                  company
                })}
                className="mr-2 flex-shrink-0 rounded-md p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
