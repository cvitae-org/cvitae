"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MeasuredItem } from "../layout/MeasuredItem";
import { MaskedPortrait } from "../common/MaskedPortrait";
import { MaskedBackground } from "../common/MaskedBackground";
import { useCVCustomizationOptional } from "../../contexts/CVCustomizationContext";

const skillCategories = [
  { key: "languages", label: "Languages" },
  { key: "frameworks", label: "Frameworks" },
  { key: "libraries", label: "Libraries & Tools" },
  { key: "styling", label: "Styling & Design" },
  { key: "other", label: "Other Technologies" },
] as const;

export function CVHeader() {
  const t = useTranslations("cv");
  const customization = useCVCustomizationOptional();

  // Use custom texts if available, otherwise fall back to translations
  const displayTitle = customization?.customTexts.title ?? t("title");
  const displaySummary = customization?.customTexts.summary ?? t("summary");

  return (
    <MeasuredItem id="cv-header" section="header">
      <div className="relative">
        {/* Main header: Portrait + Info */}
        <div className="relative grid grid-cols-1 md:grid-cols-[0.85fr_2fr] items-center">
          {/* Gap cover for PDF rendering - placed at grid level to avoid cell clipping */}
          <div 
            className="hidden md:block absolute top-0 bottom-0 w-[6px] bg-white z-10"
            style={{ left: 'calc(29.8% - 5px)' }}
          />
          <div className="flex justify-center md:justify-start">
            <MaskedBackground
              shapeSrc="/background-layer.svg"
              fillColor="#ffffff"
            >
              <MaskedPortrait
                src="/me2.png"
                hoverSrc="/me.png"
                alt={t("name")}
                maskSrc="/portrait-mask.svg"
                className="relative -top-[3px]"
              />
            </MaskedBackground>
          </div>

          <div className="relative space-y-2 pl-1 text-center md:text-left bg-white h-full rounded-tr-md flex flex-col justify-center">
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-3xl font-bold text-gray-900 font-cv leading-tight">
                {t("name")}
              </h1>
              <h2 className="text-sm sm:text-base md:text-lg font-semibold text-gray-700 tracking-[0.16em] font-cv">
                {displayTitle}
              </h2>
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-3 gap-y-1 text-xs sm:text-sm text-gray-800 font-cv">
              <a
                href={`mailto:${t("contact.email")}`}
                className="hover:text-sky-700 transition-colors"
              >
                {t("contact.email")}
              </a>
              <span className="hidden sm:inline text-gray-400">/</span>
              <span>{t("contact.phone")}</span>
            </div>

            <p className="text-[11px] pr-4 sm:text-xs md:text-sm text-gray-700 italic leading-relaxed font-cv max-w-xl mx-auto md:mx-0">
              {displaySummary}
            </p>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-[10px] sm:text-[11px] text-gray-600 font-cv">
            <a
                href={`https://${t("contact.website")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-sky-700 transition-colors underline underline-offset-2"
              >
                {t("contact.website")}
              </a>
              <span className="text-gray-400">•</span>
              <a
                href={`https://${t("contact.github")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-sky-700 transition-colors underline underline-offset-2"
              >
                {t("contact.github")}
              </a>
              <span className="text-gray-400">•</span>
              <a
                href={`https://${t("contact.linkedin")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-sky-700 transition-colors underline underline-offset-2"
              >
                {t("contact.linkedin")}
              </a>
            </div>
          </div>
        </div>

        {/* Skills - Below header, right-aligned, horizontal flow */}
        <div className="bg-white px-4 py-3">
          <div className="flex flex-wrap justify-end gap-x-6 gap-y-1.5 text-right">
            {skillCategories.map((category) => (
              <div key={category.key} className="flex items-baseline gap-1.5">
                <span className="text-[11px] text-gray-400 uppercase tracking-wide font-cv whitespace-nowrap">
                  {category.label}
                </span>
                <span className="text-[11px] text-gray-700 font-cv">
                  {t(`skills.${category.key}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MeasuredItem>
  );
}
