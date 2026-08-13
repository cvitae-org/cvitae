"use client";

import React from "react";
import { usePDFGenerator } from "../hooks/usePDFGenerator";

interface CVDownloadButtonProps {
  filename?: string;
  className?: string;
}

/**
 * Button component that triggers PDF download of the CV.
 * Shows loading state and progress during generation.
 */
export function CVDownloadButton({
  filename = "Dominik_Ben_CV.pdf",
  className = "",
}: CVDownloadButtonProps) {
  const { generatePDF, isGenerating, error } = usePDFGenerator({
    filename,
    quality: 2,
  });

  return (
    <div className={className}>
      <button
        onClick={generatePDF}
        disabled={isGenerating}
        title="Download PDF"
        className={`
          relative w-9 h-9 rounded-md font-medium
          transition-colors duration-200 shadow-sm bg-[#65B7FF] flex items-center justify-center
          ${
            isGenerating
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
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
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
      {error && <p className="mt-1 text-xs text-red-600">Error</p>}
    </div>
  );
}
