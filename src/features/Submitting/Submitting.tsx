"use client";

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Sheet } from '@/components/Sheet';
import { SheetNavigation } from '@/components/SheetNavigation';
import { CVDownloadButton } from '@/features/CV/components/CVDownloadButton';
import { AtsDownloadButton } from '@/features/CV/components/AtsDownloadButton';
import {
  PdfDownloadInfoPanel,
  PdfDownloadMessagesProvider,
  PdfDownloadWarningButton,
} from '@/features/CV/components/PdfDownloadPanel';
import { A4_DIMENSIONS } from '@/features/CV/constants';
import { useCvDocument } from '@/features/CV/hooks/useCvDocument';
import { useSubmitting } from './hooks/useSubmitting';
import { useOfferAnalysis } from './hooks/useOfferAnalysis';
import { SubmissionQueue } from './components/SubmissionQueue';
import { SubmissionDetail } from './components/SubmissionDetail';
import { SubmittingAuditBar } from './components/SubmittingAuditBar';
import { cvFilename, TailoredCVPreview } from './components/TailoredCVPreview';
import { stageOf } from './types';
import { variantStalenessReasons } from './evidence';

/**
 * The submitting page: offers picked out of research, taken through to sent.
 *
 * One column, the width of the CV, in the order the work happens — the queue,
 * then the application being worked on, then the document it will send. The
 * CV is rendered life-size rather than scaled down, because a preview that
 * cannot be read is not a preview.
 */

export function Submitting() {
  const t = useTranslations('submitting');
  const {
    submissions,
    active,
    activeId,
    hydrated,
    generateCv,
    draftEmail,
    pending,
    error,
    clearError
  } = useSubmitting();

  const {
    recordFor,
    analyse,
    rerun,
    isAnalysing,
    analysisError,
    clearAnalysisError
  } = useOfferAnalysis();
  const { document: liveCv } = useCvDocument(active?.language);

  const pdfBlockedReasons = useMemo(
    () =>
      active?.cv
        ? [
            ...(active.cv.reviewState === 'approved'
              ? []
              : [t('detail.pdfNotApproved')]),
            ...(active.sentAt
              ? []
              : variantStalenessReasons(
                active.cv,
                liveCv,
                active.offer,
                active.language
                ).map((reason) => t(`stale.${reason}`)))
          ]
        : [],
    [active, liveCv, t]
  );

  const counts = submissions.reduce(
    (totals, submission) => {
      const stage = stageOf(submission);
      if (stage === 'sent') totals.sent += 1;
      else if (stage === 'ready') totals.ready += 1;
      return totals;
    },
    { sent: 0, ready: 0 }
  );

  return (
    <PdfDownloadMessagesProvider>
    <div className="min-h-screen py-8 pb-28">
      <div className="flex items-start justify-center gap-4 px-4">
        <div className="sticky top-8 flex flex-col gap-2 print:hidden">
          <SheetNavigation />
        </div>

        <div className="flex flex-col items-center gap-8">
          <Sheet>
            <header className="mb-5">
              <h1 className="text-xl font-semibold text-gray-900">
                {t('title')}
              </h1>
              <p className="mt-0.5 text-sm text-gray-500">
                {!hydrated || submissions.length === 0
                  ? t('emptyDescription')
                  : t('stats', {
                      applications: submissions.length,
                      ready: counts.ready,
                      sent: counts.sent
                    })}
              </p>
            </header>

            <div className="space-y-5">
              <SubmissionQueue
                submissions={submissions}
                activeId={activeId}
                hydrated={hydrated}
              />

              {active ? (
                <SubmissionDetail
                  // Remounting on change drops the transient bits — a "Copied"
                  // flag belonging to the application that was open a moment
                  // ago has nothing to say about this one.
                  key={active.id}
                  submission={active}
                  pending={pending}
                  // One banner for both sources of failure: they come from the
                  // same two buttons' worth of model calls, and only one can
                  // be in flight at a time.
                  error={error ?? analysisError}
                  onGenerateCv={generateCv}
                  onDraftEmail={draftEmail}
                  onDismissError={() => {
                    clearError();
                    clearAnalysisError();
                  }}
                  record={recordFor(active)}
                  onAnalyse={analyse}
                  onRerun={rerun}
                  isAnalysing={isAnalysing}
                />
              ) : (
                hydrated &&
                submissions.length > 0 && (
                  <p className="border-t border-gray-200 pt-4 text-sm text-gray-500">
                    {t('pickApplication')}
                  </p>
                )
              )}

              <p className="text-xs text-gray-400">
                {t('storageNote')}
              </p>
            </div>
          </Sheet>

          {active?.cv && (
            <div
              className="flex flex-col"
              style={{ width: `${A4_DIMENSIONS.width}px` }}
            >
              <TailoredCVPreview cv={active.cv} language={active.language} />
              <PdfDownloadInfoPanel className="mt-5" />
            </div>
          )}
        </div>

        {/* Balances the nav column, and holds the CV's own controls once
            there is a CV — same position as on the CV page. */}
        <div className="sticky top-8 w-9 flex-shrink-0 print:hidden">
          {active?.cv && (
            <div className="flex flex-col gap-2">
              <AtsDownloadButton
                document={active.cv.output}
                locale={active.language}
                targetRole={active.cv.output.skills.role}
                company={active.offer.company}
                blockedReasons={pdfBlockedReasons}
              />
              <CVDownloadButton
                filename={cvFilename(
                  active.offer,
                  active.language,
                  active.cv.output.personal.name
                )}
                previewId={`submission-${active.cv.id}`}
                blockedReasons={pdfBlockedReasons}
              />
              <PdfDownloadWarningButton />
            </div>
          )}
        </div>
      </div>

      <SubmittingAuditBar submissions={submissions} />
    </div>
    </PdfDownloadMessagesProvider>
  );
}
