"use client";

import React, { useState } from "react";
import { useLocale } from "next-intl";
import type { Locale } from '@/libs/i18n/config';
import { CVLayout } from "./CVLayout";
import { CVDownloadButton } from "./CVDownloadButton";
import { AtsDownloadButton } from './AtsDownloadButton';
import { CVLanguageSwitcher } from "./CVLanguageSwitcher";
import { CVImportModal } from "./CVImportModal";
import { CVTranslateModal } from "./CVTranslateModal";
import { PortraitModal } from "./PortraitModal";
import { usePortrait } from "../hooks/usePortrait";
import { useCvDocument } from '../hooks/useCvDocument';
import { atsFilename } from '../pdf/atsPdf';
import { ReadinessPanel } from './ReadinessPanel';
import { A4_DIMENSIONS } from '../constants';
import {
  CVHeader,
  CVExperience,
  CVEducation,
  CVCertificates,
  CVLanguages,
  CVFooter,
} from "./sections";
import { SheetNavigation } from "@/components/SheetNavigation";

interface CVContentProps {
  showControls?: boolean;
}

/** Master-CV editor; vacancy-specific variants live only in Submitting. */
function CVContentInner({ showControls = true }: CVContentProps) {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isTranslateOpen, setIsTranslateOpen] = useState(false);
  const [isPortraitOpen, setIsPortraitOpen] = useState(false);
  const { document } = useCvDocument();
  const { portrait } = usePortrait();
  const locale = useLocale() as Locale;

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
    portrait.shape.preset,
    portrait.shape.amplitude,
    portrait.shape.frequency,
    portrait.shape.rounding,
    portrait.zoom,
    portrait.offsetX,
    portrait.offsetY,
    portrait.image?.length ?? 0,
  ].join("-");

  const designedFilename = atsFilename({ document, locale }).replace(
    /_ATS\.pdf$/,
    '_Designed.pdf'
  );

  return (
    <div className="min-h-screen py-8 print:py-0">
      {/* CV Content - Centered with download button */}
      <div className="flex items-start justify-center gap-4 px-4 print:px-0">
        {showControls && (
          <div className="sticky top-8 print:hidden flex flex-col gap-8">
            <SheetNavigation />
          </div>
        )}

        {/* CV column — preview and readiness share the same width/alignment */}
        <div
          className="flex flex-col"
          style={{ width: `${A4_DIMENSIONS.width}px` }}
        >
          <CVLayout key={layoutKey} previewId="master">
            <CVHeader />
            <CVExperience />
            <CVEducation />
            <CVCertificates />
            <CVLanguages />
            <CVFooter />
          </CVLayout>

          {showControls && (
            <div className="mt-5 print:hidden">
              <ReadinessPanel document={document} />
            </div>
          )}
        </div>

        {showControls && (
          <div className="sticky top-8 print:hidden flex flex-col gap-2">
            <button
              onClick={() => setIsImportOpen(true)}
              title="Import a CV from file"
              aria-label="Import a CV from file"
              className="relative flex h-9 w-9 items-center justify-center rounded-md bg-white text-gray-500 shadow-sm transition-colors duration-200 hover:bg-gray-50 hover:text-gray-700"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 22h14a2 2 0 002-2V7l-5-5H6a2 2 0 00-2 2v4"
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
                  d="M2 15h10m-3 3l3-3-3-3"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setIsTranslateOpen(true)}
              title={
                "Fill " +
                locale.toUpperCase() +
                " gaps from the " +
                (locale === "pl" ? "EN" : "PL") +
                " CV"
              }
              aria-label="Translate gaps from the other CV language"
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
                  d="M4 5h8M8 3v2c0 3.5-1.6 6.1-4 8m2.5-5c1.2 2 2.8 3.6 5 4.8M13 19l3.5-9 3.5 9M14.2 16h4.6"
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

            <div className="mt-6 flex flex-col gap-2">
              <CVLanguageSwitcher />
              <AtsDownloadButton document={document} locale={locale} />
              <CVDownloadButton
                filename={designedFilename}
                previewId="master"
              />
            </div>
          </div>
        )}
      </div>

      <CVImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />

      <CVTranslateModal
        isOpen={isTranslateOpen}
        onClose={() => setIsTranslateOpen(false)}
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
  return <CVContentInner {...props} />;
}
