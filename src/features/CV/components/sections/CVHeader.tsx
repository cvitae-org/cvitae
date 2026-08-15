"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MeasuredItem } from "../layout/MeasuredItem";
import { MaskedPortrait } from "../common/MaskedPortrait";
import { MaskedBackground } from "../common/MaskedBackground";
import { useCVCustomizationOptional } from "../../contexts/CVCustomizationContext";
import { EditableText } from "../editing/EditableText";
import { useCvDocument } from "../../hooks/useCvDocument";
import { usePortrait } from "../../hooks/usePortrait";
import { backgroundScale, backgroundSvgUrl, shapeSvgUrl } from "../../portrait";
import { setLink, setPersonal, setRoleDescription, setSkills } from "../../store";
import type { CvSkills } from "../../document";
import { sectionOrder } from "../../order";

/**
 * The skills strip, as three groups rather than five.
 *
 * The group labels are translated, which they were not: they were three English
 * strings sitting next to a CV that has a Polish edition, so the Polish page
 * announced its skills as "Languages" and "Libraries & Tools". They are the one
 * part of this section that *is* interface — the values beside them are the
 * document's, and stay in whatever language the document is written in.
 *
 * The translation file had `languages, frameworks, libraries, styling, other`;
 * the document has three arrays. That is not a loss of information so much as a
 * loss of a distinction the document never drew — "Styling & Design" and "Other
 * Technologies" are both libraries and tools, and an extraction step that had to
 * decide which of five buckets Tailwind belongs in would get it wrong more often
 * than it got it right. They fold into one group, which is also what the runtime
 * extracts into, so nothing has to be translated between the two.
 */
const skillGroups = [
  "programming_languages",
  "frameworks",
  "libraries_and_tools",
] as const satisfies readonly (keyof CvSkills)[];

/**
 * The links, which are edited as text.
 *
 * Rendered as spans rather than anchors while editing exists: an anchor whose
 * text is `contentEditable` navigates when you click it, which is precisely the
 * gesture that is supposed to place a caret. Click-through is restored where
 * nobody is editing — `pdfLink` marks the address, and the PDF export lays a
 * link annotation over the rendered text. The exported file behaves as it did
 * before the migration; the page you can type into does not.
 */
const linkFields = [
  { key: "website", placeholder: "yoursite.com" },
  { key: "github", placeholder: "github.com/you" },
  { key: "linkedin", placeholder: "linkedin.com/in/you" },
] as const;

export function CVHeader() {
  const t = useTranslations("cv");
  const customization = useCVCustomizationOptional();
  const { document, locale } = useCvDocument();
  const { portrait } = usePortrait();

  // A tailored CV overrides these per application. When one is active the field
  // is shown but not editable: what is on screen is the generated value, and
  // typing into it would silently edit the stored CV underneath instead — a
  // change the user could not see they had made.
  const titleOverride = customization?.customTexts.title;
  const summaryOverride = customization?.customTexts.summary;

  return (
    <MeasuredItem id="cv-header" section="header" order={sectionOrder("header")}>
      <div className="relative">
        {/* Main header: Portrait + Info */}
        <div className="relative grid grid-cols-1 md:grid-cols-[0.85fr_2fr] items-center">
          {/* Gap cover for PDF rendering - placed at grid level to avoid cell clipping */}
          <div
            className="hidden md:block absolute top-0 bottom-0 w-[6px] bg-white z-10"
            style={{ left: 'calc(29.8% - 5px)' }}
          />
          <div className="flex justify-center md:justify-start">
            {/*
              The white layer is generated from the same parameters as the mask.
              It has to be: the two are one composition, and leaving this as the
              drawn asset while the mask became adjustable left the old squiggle
              showing behind every new shape.
            */}
            <MaskedBackground
              shapeSrc={backgroundSvgUrl(portrait.shape)}
              size={280 * backgroundScale(portrait.shape)}
              fillColor="#ffffff"
            >
              {/*
                The mask is generated from the stored parameters rather than
                fetched from `public/`, so changing the silhouette is a setting
                instead of an asset edit. `classic` reproduces the original path
                verbatim, which is what keeps this identical until someone
                deliberately changes it.

                `hoverSrc` only applies to the built-in pair. An uploaded
                portrait has no second image to toggle to, and inventing one
                would mean a click doing nothing visible.
              */}
              <MaskedPortrait
                src={portrait.image ?? "/me2.png"}
                hoverSrc={portrait.image ? undefined : "/me.png"}
                alt={document.personal.name || t("sections.contact")}
                maskSrc={shapeSvgUrl(portrait.shape)}
                zoom={portrait.zoom}
                offsetX={portrait.offsetX}
                offsetY={portrait.offsetY}
                className="relative -top-[3px]"
              />
            </MaskedBackground>
          </div>

          <div className="relative space-y-2 pl-1 text-center md:text-left bg-white h-full rounded-tr-md flex flex-col justify-center">
            <div>
              <EditableText
                as="h1"
                value={document.personal.name}
                onCommit={(value) => setPersonal(locale, { name: value })}
                placeholder="Your name"
                ariaLabel="Full name"
                className="text-2xl sm:text-3xl md:text-3xl font-bold text-gray-900 font-cv leading-tight"
              />
              {titleOverride ? (
                <h2 className="text-sm sm:text-base md:text-lg font-semibold text-gray-700 tracking-[0.16em] font-cv">
                  {titleOverride}
                </h2>
              ) : (
                <EditableText
                  as="h2"
                  value={document.skills.role}
                  onCommit={(value) => setSkills(locale, { role: value })}
                  placeholder="Your role"
                  ariaLabel="Professional title"
                  className="text-sm sm:text-base md:text-lg font-semibold text-gray-700 tracking-[0.16em] font-cv"
                />
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-3 gap-y-1 text-xs sm:text-sm text-gray-800 font-cv">
              <EditableText
                value={document.personal.email}
                onCommit={(value) => setPersonal(locale, { email: value })}
                placeholder="you@example.com"
                ariaLabel="Email address"
                pdfLink={
                  document.personal.email
                    ? `mailto:${document.personal.email}`
                    : undefined
                }
                className="hover:text-sky-700 transition-colors"
              />
              <span className="hidden sm:inline text-gray-400">/</span>
              <EditableText
                value={document.personal.phone}
                onCommit={(value) => setPersonal(locale, { phone: value })}
                placeholder="Phone number"
                ariaLabel="Phone number"
              />
            </div>

            {summaryOverride ? (
              <p className="text-[11px] pr-4 sm:text-xs md:text-sm text-gray-700 italic leading-relaxed font-cv max-w-xl mx-auto md:mx-0">
                {summaryOverride}
              </p>
            ) : (
              <EditableText
                as="p"
                multiline
                value={document.role_description}
                onCommit={(value) => setRoleDescription(locale, value)}
                placeholder="A short professional summary — what you do, and what you are good at."
                ariaLabel="Professional summary"
                className="text-[11px] pr-4 sm:text-xs md:text-sm text-gray-700 italic leading-relaxed font-cv max-w-xl mx-auto md:mx-0"
              />
            )}

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-[10px] sm:text-[11px] text-gray-600 font-cv">
              {linkFields.map((field, index) => (
                <React.Fragment key={field.key}>
                  {index > 0 && <span className="text-gray-400">•</span>}
                  <EditableText
                    value={document.personal.links[field.key] ?? ""}
                    onCommit={(value) => setLink(locale, field.key, value)}
                    placeholder={field.placeholder}
                    ariaLabel={`${field.key} link`}
                    pdfLink={document.personal.links[field.key]}
                    className="hover:text-sky-700 transition-colors underline underline-offset-2"
                  />
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/*
          Skills, as a two-column grid rather than a wrapping right-aligned row.

          The row layout worked while there were five groups whose values each
          fit on one line. Three groups do not divide the same way: everything
          that is not a language or a framework is one list of twenty-odd items,
          which wraps to three lines — and right-aligned wrapped text is ragged
          on the left, so the label was pushed to the far edge of the page and
          the list ended on a line containing the single word "Jira".

          A grid fixes the two things that made it read as broken. Labels share a
          column and end on the same edge, and a value that wraps stays in its
          own column instead of flowing back under its label.
        */}
        <div className="bg-white px-4 py-3">
          <div className="grid grid-cols-[max-content_1fr] items-baseline gap-x-3 gap-y-1.5">
            {skillGroups.map((group) => (
              <React.Fragment key={group}>
                <span className="text-[11px] text-gray-400 uppercase tracking-wide font-cv whitespace-nowrap text-right">
                  {t(`skillGroups.${group}`)}
                </span>
                {/*
                  Edited as one comma-separated line, which is how it already
                  reads. Splitting on commit rather than offering a control per
                  skill keeps a twenty-item list editable in one gesture, and the
                  separator is the one people already type.
                */}
                <EditableText
                  value={document.skills[group].join(", ")}
                  onCommit={(value) =>
                    setSkills(locale, {
                      [group]: value
                        .split(",")
                        .map((skill) => skill.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Add skills, separated by commas"
                  ariaLabel={t(`skillGroups.${group}`)}
                  className="text-[11px] text-gray-700 font-cv"
                />
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </MeasuredItem>
  );
}
