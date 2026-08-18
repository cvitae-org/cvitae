"use client";

import React from "react";
import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/libs/i18n/routing";

/**
 * Button component that switches between PL and EN versions of the CV.
 * Shows the target locale so the label reads as "switch to EN/PL".
 */
export function CVLanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const toggleLocale = () => {
    const newLocale = locale === "pl" ? "en" : "pl";
    router.replace(pathname, { locale: newLocale });
  };

  const otherLang = locale === "pl" ? "EN" : "PL";

  return (
    <button
      onClick={toggleLocale}
      title={`Switch to ${otherLang} version`}
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

