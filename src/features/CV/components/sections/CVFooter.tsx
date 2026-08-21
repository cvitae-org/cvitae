"use client";

import React from "react";
import { MeasuredItem } from "../layout/MeasuredItem";
import { sectionOrder } from "../../order";
import { useCvDocumentTranslations } from '../../hooks/useCvDocumentTranslations';

export function CVFooter() {
  const t = useCvDocumentTranslations();

  return (
    <MeasuredItem id="cv-footer" section="footer" order={sectionOrder("footer")}>
      <div className="bg-white px-4 py-4 border-t border-gray-300">
        <p className="text-xs text-center text-gray-600 font-cv italic">
          {t("footer")}
        </p>
      </div>
    </MeasuredItem>
  );
}
