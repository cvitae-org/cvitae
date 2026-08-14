"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MeasuredSection } from "../layout/MeasuredSection";
import { MeasuredItem } from "../layout/MeasuredItem";
import { EditableText } from "../editing/EditableText";
import { useCvDocument } from "../../hooks/useCvDocument";
import { setRoleDescription } from "../../store";

export function CVSummary() {
  // Section headings stay in next-intl: they are chrome, and genuinely
  // translated. Only the content below comes from the CV document.
  const t = useTranslations("cv");
  const { document, locale } = useCvDocument();

  return (
    <MeasuredSection
      id="summary"
      title={t("sections.summary")}
      headerClassName="bg-white px-4 pt-4"
    >
      <MeasuredItem id="summary-content" section="summary">
        <div className="bg-white px-4 pb-2">
          <EditableText
            as="p"
            multiline
            value={document.role_description}
            onCommit={(value) => setRoleDescription(locale, value)}
            placeholder="Write a short professional summary."
            ariaLabel="Professional summary"
            className="text-sm text-gray-700 leading-relaxed font-cv"
          />
        </div>
      </MeasuredItem>
    </MeasuredSection>
  );
}
