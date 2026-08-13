"use client";

import React, { useState } from "react";
import { useLocale } from "next-intl";
import { CVLayout } from "./CVLayout";
import { CVDownloadButton } from "./CVDownloadButton";
import { CVLanguageSwitcher } from "./CVLanguageSwitcher";
import { JobOfferModal } from "./JobOfferModal";
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
  const { customTexts } = useCVCustomization();
  const locale = useLocale();

  // Create a key that changes when custom texts change to force CVLayout re-measurement
  const layoutKey = `cv-layout-${customTexts.title ?? "default"}-${customTexts.summary ?? "default"}`;

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
