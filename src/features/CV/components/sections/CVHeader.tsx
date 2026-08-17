"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MeasuredItem } from "../layout/MeasuredItem";
import { MaskedPortrait } from "../common/MaskedPortrait";
import { MaskedBackground } from "../common/MaskedBackground";
import { useCVCustomizationOptional } from "../../contexts/CVCustomizationContext";
import { EditableText } from "../editing/EditableText";
import { EmptySection } from "../editing/EmptySection";
import { EntryControls } from "../editing/EntryControls";
import { useCvDocument } from "../../hooks/useCvDocument";
import { usePortrait } from "../../hooks/usePortrait";
import { backgroundScale, backgroundSvgUrl, portraitWidthRatio, shapeSvgUrl } from "../../portrait";
import {
  addSkillGroup,
  moveSkillGroup,
  removeSkillGroup,
  setLink,
  setPersonal,
  setRoleDescription,
  setSkillGroup,
  setSkills,
} from "../../store";
import { sectionOrder } from "../../order";

/**
 * The skills strip, as however many rows the CV has.
 *
 * It was three, named by the translation file, and before that five named by an
 * earlier one. Neither number was ever the document's to keep: this CV is read
 * with "Styling & Design" and "Other Technologies" as their own rows, and the
 * only way to say so was to edit `messages/*.json` and the schema together. The
 * headings live in the document now — added, renamed, reordered and removed on
 * the page like everything else here.
 *
 * That also settles what the Polish CV's rows are called. Translating the
 * headings was right while they were interface; it is wrong now that they are
 * content, because it would render a heading the Polish document does not
 * contain over a list it does.
 */

/** One row's list, back from the comma-separated line it is edited as. */
const toItems = (value: string): string[] =>
  value
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);

/**
 * Matches the per-bullet control in `CVExperience`, and is a copy of it for the
 * same reason that one is not `EntryControls`: these are glyphs in a row that
 * has no space for the word "Remove" three times over.
 */
const controlButton =
  "rounded px-1 py-0.5 text-[10px] font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#65B7FF] disabled:pointer-events-none disabled:text-gray-200";

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
      <div className="relative overflow-hidden rounded-t-md print:rounded-none">
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
              portraitWidthRatio={portraitWidthRatio(portrait.shape)}
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
              />
            </MaskedBackground>
          </div>

          <div className="relative flex h-full flex-col justify-center space-y-2 bg-white pl-1 text-center md:text-left">
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
          fit on one line. Three groups did not divide the same way: everything
          that was not a language or a framework became one list of twenty-odd
          items, which wraps to three lines — and right-aligned wrapped text is
          ragged on the left, so the label was pushed to the far edge of the page
          and the list ended on a line containing the single word "Jira".

          A grid fixes the two things that made it read as broken. Labels share a
          column and end on the same edge, and a value that wraps stays in its
          own column instead of flowing back under its label. It holds for any
          number of rows, which is the other reason it survives groups becoming
          the user's to name.

          `fit-content(11rem)` rather than `max-content` now that the heading is
          typed rather than chosen: `max-content` hands the whole width to the
          longest thing anyone writes, and one long label would push every list
          on the page into a narrow column. 11rem clears "OTHER TECHNOLOGIES"
          with room to spare, and anything longer wraps instead of spending the
          list's width.
        */}
        <div className="group/skills relative bg-white px-4 py-3">
          {document.skills.groups.length === 0 ? (
            <EmptySection
              hint="Languages — Javascript, Typescript"
              onCreate={() => addSkillGroup(locale)}
              label="Add the first skill group"
            />
          ) : (
            <div className="grid grid-cols-[fit-content(11rem)_1fr] items-baseline gap-x-3 gap-y-1.5">
              {document.skills.groups.map((group, index) => (
                <React.Fragment key={`skill-group-${index}`}>
                  <EditableText
                    value={group.label}
                    onCommit={(value) =>
                      setSkillGroup(locale, index, { label: value })
                    }
                    placeholder="Group"
                    ariaLabel={`Skill group ${index + 1} heading`}
                    // Stored as typed and shown in capitals, so the heading a
                    // reader sees is the strip's own style rather than a demand
                    // that whoever types "Styling & Design" holds shift.
                    className="text-[11px] text-gray-400 uppercase tracking-wide font-cv text-right"
                  />
                  {/*
                    The type classes are on the row rather than on the text
                    inside it. A bare wrapper inherits the page's 16px font, and
                    an empty box still reserves a line of whatever font it is
                    set in: measured, that put each row's box at 24.5px against
                    the 16.5px its text occupies, and spread the five rows over
                    40px more than the strip had before there was a wrapper.
                  */}
                  <div className="group/row relative text-[11px] text-gray-700 font-cv">
                    {/*
                      Edited as one comma-separated line, which is how it already
                      reads. Splitting on commit rather than offering a control
                      per skill keeps a twenty-item list editable in one gesture,
                      and the separator is the one people already type.
                    */}
                    <EditableText
                      value={group.items.join(", ")}
                      onCommit={(value) =>
                        setSkillGroup(locale, index, { items: toItems(value) })
                      }
                      placeholder="Add skills, separated by commas"
                      ariaLabel={`${group.label || `Skill group ${index + 1}`} skills`}
                    />
                    {/*
                      Out of the flow, for the reason the bullet controls are:
                      in it they take width off the list, so the strip wraps
                      earlier on screen than in the export — where they are
                      removed outright — and the height this header is paginated
                      against is not the height of the page in the file.

                      Which means they overlay the end of the first line, hence
                      the white backing. It only ever shows while the row is
                      hovered or holds focus, and the alternative is a column of
                      empty space down the right of a document that is mostly
                      read rather than edited.
                    */}
                    <span className="absolute right-0 top-0 flex items-center gap-0.5 bg-white pl-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 print:hidden">
                      <button
                        type="button"
                        onClick={() => moveSkillGroup(locale, index, index - 1)}
                        disabled={index === 0}
                        aria-label={`Move ${group.label || "this group"} up`}
                        title="Move up"
                        className={controlButton}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSkillGroup(locale, index, index + 1)}
                        disabled={index === document.skills.groups.length - 1}
                        aria-label={`Move ${group.label || "this group"} down`}
                        title="Move down"
                        className={controlButton}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSkillGroup(locale, index)}
                        aria-label={`Remove ${group.label || "this group"}`}
                        title="Remove this group"
                        className={controlButton}
                      >
                        Remove
                      </button>
                    </span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}

          {/*
            Positioned rather than stacked under the rows, again so the measured
            header and the exported one are the same height. It sits in the
            strip's bottom padding at the end of the last list, which is where
            the eye already is when a row is finished — and is revealed with the
            strip rather than always shown, so a CV nobody is editing reads as a
            document.
          */}
          {document.skills.groups.length > 0 && (
            <div className="absolute bottom-1 right-4 bg-white pl-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover/skills:opacity-100 print:hidden">
              <EntryControls
                onAdd={() => addSkillGroup(locale)}
                addLabel="Add a skill group"
              />
            </div>
          )}
        </div>
      </div>
    </MeasuredItem>
  );
}
