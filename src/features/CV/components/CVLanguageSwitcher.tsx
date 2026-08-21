"use client";

import React from "react";
import { useTranslations } from 'next-intl';
import { useMasterCvLocale } from '../contexts/MasterCvLocaleContext';

/**
 * Button component that switches between PL and EN versions of the CV.
 * Shows the target locale so the label reads as "switch to EN/PL".
 */
export function CVLanguageSwitcher() {
  const t = useTranslations('cv.controls');
  const { locale, setLocale } = useMasterCvLocale();

  const toggleLocale = () => {
    const newLocale = locale === "pl" ? "en" : "pl";
    setLocale(newLocale);
  };

  const otherLang = locale === "pl" ? "EN" : "PL";

  return (
    <button
      onClick={toggleLocale}
      title={t('switchDocumentLanguage', { language: otherLang })}
      aria-label={t('switchDocumentLanguage', { language: otherLang })}
      className="
        relative w-9 h-9 rounded-md font-medium
        transition-colors duration-200 shadow-sm flex items-center justify-center
        bg-[#65B7FF] text-gray-100 hover:bg-[#529ED5] active:bg-[#407BA9]
      "
    >
      <span className="text-xs font-semibold">{otherLang}</span>
    </button>
  );
}
