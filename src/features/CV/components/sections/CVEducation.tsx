"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MeasuredSection } from "../layout/MeasuredSection";
import { MeasuredItem } from "../layout/MeasuredItem";

export function CVEducation() {
  const t = useTranslations("cv");

  return (
    <MeasuredSection 
      id="education" 
      title={t("sections.education")}
      headerClassName="bg-white px-4"
    >
      <MeasuredItem id="education-1" section="education">
        <div className="bg-white px-4 pb-2 space-y-1">
          <h3 className="text-sm font-bold text-gray-900 font-cv">
            {t("education.degree")}
          </h3>
          <p className="text-xs text-gray-600 font-cv">
            {t("education.university")}
          </p>
          <p className="text-xs text-gray-500 font-cv">{t("education.period")}</p>
        </div>
      </MeasuredItem>
    </MeasuredSection>
  );
}

