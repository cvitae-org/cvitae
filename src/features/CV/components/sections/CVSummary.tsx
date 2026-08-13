"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MeasuredSection } from "../layout/MeasuredSection";
import { MeasuredItem } from "../layout/MeasuredItem";

export function CVSummary() {
  const t = useTranslations("cv");

  return (
    <MeasuredSection 
      id="summary" 
      title={t("sections.summary")}
      headerClassName="bg-white px-4 pt-4"
    >
      <MeasuredItem id="summary-content" section="summary">
        <div className="bg-white px-4 pb-2">
          <p className="text-sm text-gray-700 leading-relaxed font-cv">
            {t("summary")}
          </p>
        </div>
      </MeasuredItem>
    </MeasuredSection>
  );
}

