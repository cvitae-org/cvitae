"use client";

import React, { useState } from "react";
import { useLocale } from "next-intl";
import { CVLayout } from "./CVLayout";
import { CVDownloadButton } from "./CVDownloadButton";
import { CVLanguageSwitcher } from "./CVLanguageSwitcher";
import { JobOfferModal } from "./JobOfferModal";
import { CVImportModal } from "./CVImportModal";
import { PortraitModal } from "./PortraitModal";
import { usePortrait } from "../hooks/usePortrait";
import { CVCustomizationProvider, useCVCustomization } from "../contexts/CVCustomizationContext";
import {
  CVHeader,
  CVExperience,
  CVEducation,
  CVCertificates,
  CVLanguages,
  CVFooter,
} from "./sections";
import { SheetNavLink } from "@/components/SheetNavLink";

interface CVContentProps {
  showControls?: boolean;
}

/**
 * Button to open the AI customization modal
 */
function CustomizeButton({ onClick }: { onClick: () => void }) {
  const { hasCustomTexts } = useCVCustomization();

  return (
    <button
      onClick={onClick}
      title="Customize for job offer"
      className={`
        relative w-9 h-9 rounded-md font-medium
        transition-colors duration-200 shadow-sm flex items-center justify-center
        ${
          hasCustomTexts
            ? "bg-green-500 text-white hover:bg-green-600"
            : "bg-[#65B7FF] text-gray-100 hover:bg-[#529ED5] active:bg-[#407BA9]"
        }
      `}
    >
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
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
      {hasCustomTexts && (
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-300 rounded-full border-2 border-white" />
      )}
    </button>
  );
}

/**
 * Inner component that has access to the customization context
 */
function CVContentInner({ showControls = true }: CVContentProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isPortraitOpen, setIsPortraitOpen] = useState(false);
  const { customTexts } = useCVCustomization();
  const { portrait } = usePortrait();
  const locale = useLocale();

  /**
   * Remounts the layout when anything it cannot detect by itself changes.
   *
   * `MeasuredItem` re-registers its subtree only when the measured height or
   * text changes — that guard is what keeps the always-mounted measurement tree
   * from looping. A portrait change is neither: the canvases are drawn
   * imperatively and the two shapes have almost the same aspect, so the header
   * measures identically and the paginated copy kept showing the previous
   * silhouette. Keying on it is the same escape hatch the tailored texts already
   * use, and the reason both need one is the same.
   *
   * The image is reduced to its length rather than included: it is a data URL of
   * tens of thousands of characters, and React compares keys by value.
   */
  const layoutKey = [
    "cv-layout",
    customTexts.title ?? "default",
    customTexts.summary ?? "default",
    portrait.shape.preset,
    portrait.shape.amplitude,
    portrait.shape.frequency,
    portrait.shape.rounding,
    portrait.zoom,
    portrait.offsetX,
    portrait.offsetY,
    portrait.image?.length ?? 0,
  ].join("-");

  // Generate filename based on locale
  const filename = `Dominik_Ben_CV_${locale.toUpperCase()}.pdf`;

  return (
    <div className="min-h-screen py-8 print:py-0">
      {/* CV Content - Centered with download button */}
      <div className="flex items-start justify-center gap-4 px-4 print:px-0">
        {showControls && (
          <div className="sticky top-8 print:hidden flex flex-col gap-2">
            <SheetNavLink href="/research" title="Job offer research">
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
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </SheetNavLink>
            <SheetNavLink href="/submitting" title="Submitting">
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
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </SheetNavLink>
          </div>
        )}

        {/* CV Layout - key forces re-render when custom texts change */}
        <CVLayout key={layoutKey}>
          <CVHeader />
          <CVExperience />
          <CVEducation />
          <CVCertificates />
          <CVLanguages />
          <CVFooter />
        </CVLayout>

        {/* Control Buttons */}
        {showControls && (
          <div className="sticky top-8 print:hidden flex flex-col gap-2">
            <CustomizeButton onClick={() => setIsModalOpen(true)} />
            <button
              onClick={() => setIsImportOpen(true)}
              title="Import a CV"
              className="relative flex h-9 w-9 items-center justify-center rounded-md bg-white text-gray-500 shadow-sm transition-colors duration-200 hover:bg-gray-50 hover:text-gray-700"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12l-4 4m4-4l4 4"
                />
              </svg>
            </button>
            <button
              onClick={() => setIsPortraitOpen(true)}
              title="Portrait"
              className="relative flex h-9 w-9 items-center justify-center rounded-md bg-white text-gray-500 shadow-sm transition-colors duration-200 hover:bg-gray-50 hover:text-gray-700"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" />
                <circle cx="12" cy="10" r="2.5" strokeWidth={2} />
                <path strokeLinecap="round" strokeWidth={2} d="M6.5 19c1.2-2.6 3.2-3.9 5.5-3.9s4.3 1.3 5.5 3.9" />
              </svg>
            </button>
            <CVLanguageSwitcher />
            <CVDownloadButton filename={filename} />
          </div>
        )}
      </div>

      {/* Job Offer Modal */}
      <JobOfferModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      <CVImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />

      <PortraitModal
        isOpen={isPortraitOpen}
        onClose={() => setIsPortraitOpen(false)}
      />
    </div>
  );
}

/**
 * Main CV content component with real data from translations.
 * Renders Dominik Beń's CV in Paginated (A4) format.
 */
export function CVContent(props: CVContentProps) {
  return (
    <CVCustomizationProvider>
      <CVContentInner {...props} />
    </CVCustomizationProvider>
  );
}
