"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useLocale } from "next-intl";
import { useCVCustomization } from "../contexts/CVCustomizationContext";
import { useCvDocument } from "../hooks/useCvDocument";
import { loadSettings, toRequestOverride } from "@/features/Settings/aiSettings";

interface GeneratedContent {
  title: string;
  summary: string;
}

interface JobOfferModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function JobOfferModal({ isOpen, onClose }: JobOfferModalProps) {
  const [jobOffer, setJobOffer] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);

  const locale = useLocale();
  // Not destructured as `document`: this component attaches a keydown listener
  // to the real one, and shadowing it here would break Escape.
  const { document: cvDocument } = useCvDocument();
  const { setCustomTexts, resetToDefaults, hasCustomTexts } = useCVCustomization();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setGeneratedContent(null);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isGenerating) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, isGenerating, onClose]);

  const handleGenerate = useCallback(async () => {
    if (!jobOffer.trim()) {
      setError("Please paste a job offer description");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedContent(null);

    try {
      const response = await fetch("/api/cv/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobOffer,
          locale,
          ai: toRequestOverride(loadSettings()),
          // The route has no way to read the document itself — it is a server
          // route and the CV lives in this browser's IndexedDB.
          cv: cvDocument,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate content");
      }

      const data = await response.json();
      setGeneratedContent(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  }, [jobOffer, locale, cvDocument]);

  const handleApply = useCallback(() => {
    if (generatedContent) {
      setCustomTexts(generatedContent);
      onClose();
    }
  }, [generatedContent, setCustomTexts, onClose]);

  const handleReset = useCallback(() => {
    resetToDefaults();
    setGeneratedContent(null);
    setJobOffer("");
  }, [resetToDefaults]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={isGenerating ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-[#65B7FF]/10 to-transparent">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Customize CV for Job Offer
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              AI will generate a tailored title and summary
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Job Offer Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Job Offer Description
            </label>
            <textarea
              value={jobOffer}
              onChange={(e) => setJobOffer(e.target.value)}
              disabled={isGenerating}
              placeholder="Paste the job offer description here..."
              className="w-full h-40 px-4 py-3 text-sm text-gray-900 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-[#65B7FF] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 transition-colors placeholder:text-gray-400"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          {/* Generated Preview */}
          {generatedContent && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Generated Content Preview
              </div>

              <div className="space-y-3">
                <div>
                  <span className="text-xs uppercase tracking-wider text-gray-500">Title</span>
                  <p className="mt-1 font-semibold text-gray-900">{generatedContent.title}</p>
                </div>
                <div>
                  <span className="text-xs uppercase tracking-wider text-gray-500">Summary</span>
                  <p className="mt-1 text-sm text-gray-700 italic leading-relaxed">
                    {generatedContent.summary}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Current Status */}
          {hasCustomTexts && !generatedContent && (
            <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              You have custom texts applied. Generate new ones or reset to defaults.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div>
            {hasCustomTexts && (
              <button
                onClick={handleReset}
                disabled={isGenerating}
                className="text-sm text-gray-600 hover:text-gray-800 underline underline-offset-2 disabled:opacity-50"
              >
                Reset to defaults
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isGenerating}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>

            {generatedContent ? (
              <>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !jobOffer.trim()}
                  className="px-4 py-2 text-sm font-medium text-[#65B7FF] bg-white border border-[#65B7FF] rounded-lg hover:bg-[#65B7FF]/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Regenerate
                    </>
                  )}
                </button>
                <button
                  onClick={handleApply}
                  disabled={isGenerating}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Apply to CV
                </button>
              </>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !jobOffer.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-[#65B7FF] rounded-lg hover:bg-[#529ED5] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Generate
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

