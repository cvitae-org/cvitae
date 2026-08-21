"use client";

import React, { useMemo } from "react";
import { useTranslations } from 'next-intl';
import { usePDFGenerator } from "../hooks/usePDFGenerator";
import {
  useRegisterPdfDownloadMessages,
  type PdfDownloadMessage,
} from "./PdfDownloadPanel";

const EMPTY_BLOCKED_REASONS: string[] = [];

interface CVDownloadButtonProps {
  filename?: string;
  previewId: string;
  blockedReasons?: string[];
  className?: string;
}

/**
 * Button component that triggers PDF download of the CV.
 * Shows loading state and progress during generation.
 */
export function CVDownloadButton({
  filename = "CV_Designed.pdf",
  previewId,
  blockedReasons = EMPTY_BLOCKED_REASONS,
  className = "",
}: CVDownloadButtonProps) {
  const t = useTranslations('cv.pdf');
  const { generatePDF, isGenerating, error, warnings } = usePDFGenerator({
    filename,
    quality: 2,
    previewId,
  });

  const messages = useMemo((): PdfDownloadMessage[] => {
    const items: PdfDownloadMessage[] = [];
    if (blockedReasons.length > 0) {
      items.push({
        key: "designed-blocked",
        text: t('designedBlocked', { reasons: blockedReasons.join('; ') }),
        severity: "error",
      });
    }
    warnings.forEach((warning) => {
      items.push({ key: `designed-warning-${warning}`, text: warning, severity: "warning" });
    });
    if (error) {
      items.push({
        key: "designed-error",
        text: error.text,
        detail: error.detail,
        severity: "error"
      });
    }
    return items;
  }, [blockedReasons, warnings, error, t]);

  useRegisterPdfDownloadMessages("designed", messages);

  return (
    <div className={className}>
      <button
        onClick={generatePDF}
        disabled={isGenerating || blockedReasons.length > 0}
        title={t('designedTitle')}
        aria-label={t('downloadDesigned')}
        className={`
          relative w-9 h-9 rounded-md font-medium
          transition-colors duration-200 shadow-sm bg-[#65B7FF] flex items-center justify-center
          ${
            isGenerating || blockedReasons.length > 0
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "text-gray-100 hover:bg-[#529ED5] active:bg-[#407BA9]"
          }
        `}
      >
        {/* Icon */}
        {!isGenerating && (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M14 2v4a2 2 0 002 2h4"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 12v6m0 0l-3-3m3 3l3-3"
            />
          </svg>
        )}

        {/* Loading Spinner */}
        {isGenerating && (
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
