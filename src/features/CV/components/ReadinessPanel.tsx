"use client";

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  AuditBar,
  type AuditSection,
  type AuditSeverity
} from '@/components/AuditBar';
import type { CvDocument } from '../document';
import type { EvidenceCvVariant } from '@/features/Submitting/types';
import { runReadinessChecks, type ReadinessCategory } from '../readiness';
import { PDF_DOWNLOAD_INFO_ID, usePdfDownloadMessages } from './PdfDownloadPanel';

const categories: ReadinessCategory[] = [
  'pdf-integrity',
  'parsed-field-coverage',
  'role-evidence',
  'human-scan-quality',
  'application-knockouts'
];

/**
 * The audit for the CV stage: is this document going to survive being read by
 * a parser, and by a person.
 *
 * The designed-vs-ATS advice and the download warnings used to sit in their own
 * box directly above this one, which meant two bordered panels stacked under the
 * sheet saying related things about the same file. They are one box now: the
 * advice is the first line inside the disclosure, so the collapsed state is a
 * single row and the expanded state is the whole story.
 *
 * `docked` also decides whether this panel is the merged box. Submitting keeps
 * the two apart — the audit sits in the CV step of its sheet, the download
 * notices under the preview in the other column — so there it still renders a
 * `PdfDownloadInfoPanel`, and only one of the two may carry the id the warning
 * button reaches for.
 */
export function ReadinessPanel({
  document,
  variant,
  docked = false,
  className = ''
}: {
  document: CvDocument;
  variant?: EvidenceCvVariant;
  docked?: boolean;
  className?: string;
}) {
  const t = useTranslations('cv.readiness');
  const pdfT = useTranslations('cv.pdf');
  const pdfIssueT = useTranslations('cv.pdf.issues');
  const commonT = useTranslations('common');
  const downloadMessages = usePdfDownloadMessages();

  // Recomputed from the document, so every committed edit re-audits: the
  // editable fields write to the store on blur, and this is downstream of that
  // store. `pdf-integrity` is the exception — it can only be judged on a real
  // generated file, so it stays whatever the last download reported.
  const report = useMemo(
    () => runReadinessChecks({ document, variant }),
    [document, variant]
  );

  const merged = docked;
  const messages = useMemo(
    () => (merged ? downloadMessages : []),
    [merged, downloadMessages]
  );

  const sections: AuditSection[] = [
    ...(messages.length > 0
      ? [
          {
            key: 'downloads',
            span: true,
            title: pdfT('downloadIssues'),
            items: messages.map((message) => ({
              key: message.key,
              severity: (message.severity === 'error'
                ? 'block'
                : 'warning') as AuditSeverity,
              text: message.text,
              detail: message.detail ? (
                <details className="mt-1 text-[10px] text-gray-500">
                  <summary className="cursor-pointer">
                    {commonT('technicalDetails')}
                  </summary>
                  <p className="mt-1 break-words font-mono">{message.detail}</p>
                </details>
              ) : undefined
            }))
          }
        ]
      : []),
    ...categories.map((category) => ({
      key: category,
      title: t(`categories.${category}`),
      items: report[category].map((item, index) => ({
        key: `${item.code}-${index}`,
        severity: item.severity,
        text:
          item.source === 'pdf'
            ? pdfIssueT(item.messageKey, item.values)
            : t(`findings.${item.messageKey}`, {
                ...item.values,
                ...(item.messageKey === 'requirement-gap' && item.values?.status
                  ? { status: t(`statuses.${item.values.status}`) }
                  : {})
              })
      }))
    }))
  ];

  return (
    <AuditBar
      id={merged ? PDF_DOWNLOAD_INFO_ID : undefined}
      title={t('title')}
      sections={sections}
      docked={docked}
      className={className}
      forceOpen={messages.length > 0}
      disclaimer={t('disclaimer')}
      notice={
        merged ? (
          <p className="text-[10px] leading-snug text-amber-700">
            {pdfT('designedInfo')}
          </p>
        ) : undefined
      }
    />
  );
}
