"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MeasuredSection } from "../layout/MeasuredSection";
import { MeasuredItem } from "../layout/MeasuredItem";

export function CVExperience() {
  const t = useTranslations("cv");
  
  // Get experience data as raw object
  // t.raw is available but may not be in types  
  const experienceData = t.raw('experience') as Array<{
    title: string;
    company: string;
    period: string;
    achievements: string[];
  }> || [];

  const isLast = (index: number) => index === experienceData.length - 1;

  return (
    <MeasuredSection
      id="experience"
      title={t("sections.experience")}
      repeatHeaderOnNewPage={false}
      headerClassName="bg-white px-4"
    >
      {experienceData?.map((exp, index) => {
        const { title, company, period, achievements } = exp;

        return (
          <MeasuredItem
            key={`exp-${index}`}
            id={`exp-${index}`}
            section="experience"
          >
            <div className={`bg-white px-4 space-y-2 ${isLast(index) ? 'pb-2' : 'pb-2'}`}>
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-gray-900 font-cv">
                    {title}
                  </h3>
                  <p className="text-xs text-gray-600 font-cv italic">{company}</p>
                </div>
                <span className="text-xs text-gray-500 font-cv whitespace-nowrap">
                  {period}
                </span>
              </div>
              <div className="ml-2 flex">
                <div className="border-l-2 border-black flex-shrink-0" />
                <ul className="text-xs text-gray-700 space-y-1 font-cv flex-1">
                  {achievements.map((achievement, idx) => (
                    <li key={idx} className="leading-relaxed flex" style={{ alignItems: 'flex-start' }}>
                      <div 
                        id={`cv-experience-bullet-${index}-${idx}`}
                        className="flex-shrink-0" 
                        style={{ width: '8px', paddingTop: '7px', display: 'flex', alignItems: 'flex-start' }}
                      >
                        <div style={{ width: '100%', height: '2px', backgroundColor: '#000' }} />
                      </div>
                      <span style={{ paddingLeft: '4px' }}>{achievement}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </MeasuredItem>
        );
      })}
    </MeasuredSection>
  );
}

