"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MeasuredSection } from "../layout/MeasuredSection";
import { MeasuredItem } from "../layout/MeasuredItem";

export function CVLanguages() {
  const t = useTranslations("cv");

  // Get the number of languages
  const languageCount = 1; // Based on the data structure (+ Polish native)

  return (
    <MeasuredSection 
      id="languages" 
      title={t("sections.languages")}
      headerClassName="bg-white px-4"
    >
      <MeasuredItem id="languages-content" section="languages">
        <div className="bg-white px-4 pb-2 space-y-2">
          {/* Polish (native) - hardcoded as it's not in translations */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-900 font-cv">
              Polish:
            </span>
            <span className="text-xs text-gray-700 font-cv">Native</span>
          </div>

          {/* Other languages from translations */}
          {Array.from({ length: languageCount }).map((_, index) => {
            const lang = `languages.${index}`;
            const name = t(`${lang}.name`);
            const level = t(`${lang}.level`);

            return (
              <div key={`lang-${index}`} className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-900 font-cv">
                  {name}:
                </span>
                <span className="text-xs text-gray-700 font-cv">{level}</span>
              </div>
            );
          })}
        </div>
      </MeasuredItem>
    </MeasuredSection>
  );
}

