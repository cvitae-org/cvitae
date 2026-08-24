"use client";

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/libs/i18n/config';
import type { CvDocument } from '../document';
import { generateAtsPdf, saveBlob } from '../pdf/atsPdf';
import { portraitSource } from '../portrait';
import { usePortrait } from '../hooks/usePortrait';
import type { PdfPreflightIssue } from '../pdf/preflight';
import {
  useRegisterPdfDownloadMessages,
  type PdfDownloadMessage,
} from './PdfDownloadPanel';

const EMPTY_BLOCKED_REASONS: string[] = [];

type AtsDownloadButtonProps = {
  document: CvDocument;
  locale: Locale;
  targetRole?: string;
  company?: string;
  blockedReasons?: string[];
  className?: string;
};

export function AtsDownloadButton({
  document,
  locale,
  targetRole,
  company,
  blockedReasons = EMPTY_BLOCKED_REASONS,
  className = ''
}: AtsDownloadButtonProps) {
  const t = useTranslations('cv.pdf');
  // The same photograph the header shows, so the exported CV and the one on
  // screen are the same document.
  const { portrait } = usePortrait();
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState<PdfPreflightIssue[]>([]);
  const [error, setError] = useState<{
    text: string;
    detail?: string;
  } | null>(null);

  const messages = useMemo((): PdfDownloadMessage[] => {
    const items: PdfDownloadMessage[] = [];
    if (blockedReasons.length > 0) {
      items.push({
        key: 'ats-blocked',
        text: t('atsBlocked', { reasons: blockedReasons.join('; ') }),
        severity: 'error',
      });
    }
    if (error) {
      items.push({
        key: 'ats-error',
        text: error.text,
        detail: error.detail,
        severity: 'error'
      });
    }
    issues.forEach((issue) => {
      items.push({
        key: `ats-issue-${issue.code}-${issue.message}`,
        text: t(`issues.${issue.code}`, issue.values),
        detail: issue.detail,
        severity: issue.severity === 'block' ? 'error' : 'warning',
      });
    });
    return items;
  }, [blockedReasons, error, issues, t]);

  useRegisterPdfDownloadMessages('ats', messages);

  const download = async () => {
    if (blockedReasons.length > 0) {
      setError({
        text: t('downloadBlocked', { reasons: blockedReasons.join('; ') })
      });
      return;
    }
    setPending(true);
    setError(null);
    setIssues([]);
    try {
      const result = await generateAtsPdf({
        document,
        locale,
        targetRole,
        company,
        portrait: portraitSource(portrait)
      });
      setIssues(result.preflight.issues);
      if (!result.preflight.ok) {
        setError({ text: t('integrityBlocked') });
        return;
      }
      saveBlob(result.blob, result.filename);
    } catch (cause) {
      setError({
        text: t('atsFailed'),
        detail: cause instanceof Error ? cause.message : undefined
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={download}
        disabled={pending || blockedReasons.length > 0}
        title={t('downloadAtsTitle')}
        aria-label={t('downloadAts')}
        className="relative flex h-9 w-9 items-center justify-center rounded-md bg-[#65B7FF] text-gray-100 shadow-sm transition-colors hover:bg-[#529ED5] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
      >
        {pending ? (
          <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          <span className="text-[10px] font-semibold leading-none">ATS</span>
        )}
      </button>
    </div>
  );
}
