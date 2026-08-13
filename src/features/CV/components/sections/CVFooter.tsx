"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MeasuredItem } from "../layout/MeasuredItem";

export function CVFooter() {
  const t = useTranslations("cv");

  return (
    <MeasuredItem id="cv-footer" section="footer">
      <div className="bg-white px-4 py-4 border-t border-gray-300 rounded-b-lg">
        <p className="text-xs text-center text-gray-600 font-cv italic">
          {t("footer")}
        </p>
      </div>
    </MeasuredItem>
  );
}

