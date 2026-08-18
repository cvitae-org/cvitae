"use client";

import { useState } from 'react';
import type { Locale } from '@/libs/i18n/config';
import type { CvDocument } from '../document';
import { generateAtsPdf, saveBlob } from '../pdf/atsPdf';
import type { PdfPreflightIssue } from '../pdf/preflight';

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
  blockedReasons = [],
  className = ''
}: AtsDownloadButtonProps) {
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState<PdfPreflightIssue[]>([]);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    if (blockedReasons.length > 0) {
      setError(`Download blocked: ${blockedReasons.join('; ')}.`);
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
        company
      });
      setIssues(result.preflight.issues);
      if (!result.preflight.ok) {
        setError('Download blocked because the generated PDF failed integrity checks.');
        return;
      }
      saveBlob(result.blob, result.filename);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate the ATS PDF.');
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
        title="Download native-text ATS PDF"
        aria-label="Download ATS PDF"
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
      {blockedReasons.length > 0 && (
        <div className="mt-2 w-72 rounded-md border border-red-200 bg-white p-2 text-[11px] leading-relaxed shadow-sm">
          <p className="text-red-700">
            ATS PDF blocked: {blockedReasons.join('; ')}.
          </p>
        </div>
      )}
      {(error || issues.length > 0) && (
        <div className="mt-2 w-72 rounded-md border border-gray-200 bg-white p-2 text-[11px] leading-relaxed shadow-sm">
          {error && <p className="text-red-700">{error}</p>}
          {issues.map((issue) => (
            <p key={`${issue.code}-${issue.message}`} className={issue.severity === 'block' ? 'text-red-700' : 'text-amber-700'}>
              {issue.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
