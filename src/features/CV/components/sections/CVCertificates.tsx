"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MeasuredSection } from "../layout/MeasuredSection";
import { MeasuredItem } from "../layout/MeasuredItem";
import { entryOrder, sectionOrder } from "../../order";

export function CVCertificates() {
  const t = useTranslations("cv");

  // Get the number of certificates
  const certificateCount = 1; // Based on the data structure

  const isLast = (index: number) => index === certificateCount - 1;

  return (
    <MeasuredSection 
      id="certificates" 
      order={sectionOrder("certificates")}
      title={t("sections.certificates")}
      headerClassName="bg-white px-4"
    >
      {Array.from({ length: certificateCount }).map((_, index) => {
        const cert = `certificates.${index}`;
        const title = t(`${cert}.title`);
        const description = t(`${cert}.description`);
        const date = t(`${cert}.date`);

        return (
          <MeasuredItem
            key={`cert-${index}`}
            id={`cert-${index}`}
            order={entryOrder("certificates", index)}
            section="certificates"
          >
            <div className={`bg-white px-4 space-y-1 ${isLast(index) ? 'pb-2' : 'pb-2'}`}>
              <h3 className="text-xs font-semibold text-gray-900 font-cv">
                {title}
              </h3>
              <p className="text-xs text-gray-600 font-cv">{description}</p>
              <p className="text-xs text-gray-500 font-cv">{date}</p>
            </div>
          </MeasuredItem>
        );
      })}
    </MeasuredSection>
  );
}

