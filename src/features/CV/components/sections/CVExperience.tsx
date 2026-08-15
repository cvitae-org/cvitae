"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MeasuredSection } from "../layout/MeasuredSection";
import { MeasuredItem } from "../layout/MeasuredItem";
import { EditableText } from "../editing/EditableText";
import { EntryControls } from "../editing/EntryControls";
import { EmptySection } from "../editing/EmptySection";
import { useCvDocument } from "../../hooks/useCvDocument";
import {
  addEntry,
  addHighlight,
  patchEntry,
  removeEntry,
  removeHighlight,
  setHighlight,
} from "../../store";
import { entryOrder, sectionOrder, trailingOrder } from "../../order";

/**
 * Work history: the largest section, and the only one with a list inside a list.
 *
 * Dates are two fields rather than the single "June 2025 - Present" line this
 * used to render. The document stores `started` and `finished` separately, with
 * `null` meaning ongoing, and a combined field would have to be split back into
 * that pair on every commit — a round trip through a format with no delimiter
 * anyone agrees on ("2019-2021", "2019 – 2021", "June 2019 to present"). Two
 * fields need no parsing and cannot be ambiguous.
 *
 * An empty `finished` *is* "ongoing": clearing the field is how a job becomes
 * current, and the placeholder says so rather than leaving the field looking
 * unfilled.
 */
export function CVExperience() {
  const t = useTranslations("cv");
  const { document, locale } = useCvDocument();
  const experience = document.experience;

  return (
    <MeasuredSection
      id="experience"
      order={sectionOrder("experience")}
      title={t("sections.experience")}
      repeatHeaderOnNewPage={false}
      headerClassName="bg-white px-4"
    >
      {experience.length === 0 ? (
        <MeasuredItem
          id="exp-empty"
          section="experience"
          order={entryOrder("experience", 0)}
        >
          <div className="bg-white px-4 pb-2">
            <EmptySection
              hint="Job title — Company — Dates"
              onCreate={() => addEntry(locale, "experience")}
              label="Add the first job"
            />
          </div>
        </MeasuredItem>
      ) : (
        experience.map((entry, index) => (
          <MeasuredItem
            key={`exp-${index}`}
            id={`exp-${index}`}
            section="experience"
            order={entryOrder("experience", index)}
          >
            <div className="group relative bg-white px-4 space-y-2 pb-2">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <EditableText
                    as="h3"
                    value={entry.title}
                    onCommit={(value) =>
                      patchEntry(locale, "experience", index, { title: value })
                    }
                    placeholder="Job title"
                    ariaLabel={`Job ${index + 1} title`}
                    className="text-sm font-bold text-gray-900 font-cv"
                  />
                  <EditableText
                    as="p"
                    value={entry.company}
                    onCommit={(value) =>
                      patchEntry(locale, "experience", index, { company: value })
                    }
                    placeholder="Company"
                    ariaLabel={`Job ${index + 1} company`}
                    className="text-xs text-gray-600 font-cv italic"
                  />
                </div>

                <span className="flex items-center gap-1 text-xs text-gray-500 font-cv whitespace-nowrap">
                  <EditableText
                    value={entry.started}
                    onCommit={(value) =>
                      patchEntry(locale, "experience", index, { started: value })
                    }
                    placeholder="Start"
                    ariaLabel={`Job ${index + 1} start date`}
                  />
                  <span aria-hidden="true">–</span>
                  <EditableText
                    // `null` is ongoing, and renders as the placeholder rather
                    // than as a blank, so a current job does not read as a field
                    // someone forgot to fill in.
                    value={entry.finished ?? ""}
                    onCommit={(value) =>
                      patchEntry(locale, "experience", index, {
                        finished: value.trim() ? value : null,
                      })
                    }
                    // Translated, unlike the hint placeholders around it,
                    // because this one is printed: an empty `finished` renders
                    // as this word in the exported PDF, and the Polish CV was
                    // saying "Czerwiec 2025 – Present".
                    placeholder={t("ongoing")}
                    placeholderIsValue
                    ariaLabel={`Job ${index + 1} end date, empty means ongoing`}
                  />
                  <EntryControls
                    onRemove={() => removeEntry(locale, "experience", index)}
                    removeLabel={`Remove ${entry.title || "this job"}`}
                  />
                </span>
              </div>

              <div className="ml-2 flex">
                <div className="border-l-2 border-black flex-shrink-0" />
                <ul className="text-xs text-gray-700 space-y-1 font-cv flex-1">
                  {entry.highlights.map((highlight, bulletIndex) => (
                    <li
                      key={bulletIndex}
                      // Its own group, so hovering one bullet reveals that
                      // bullet's control rather than every control in the job.
                      className="group/bullet relative leading-relaxed flex"
                      style={{ alignItems: "flex-start" }}
                    >
                      <div
                        // An attribute, not an `id`. This subtree is rendered
                        // twice — once in the hidden measurement tree and once
                        // by `PaginatedRenderer` — from the same element, so
                        // anything unique here is unique twice over. That made
                        // the ids these carried invalid and broke the PDF
                        // export, which found both copies and styled the hidden
                        // one too. `data-` attributes carry no such promise.
                        data-cv-bullet=""
                        className="flex-shrink-0"
                        style={{
                          // The branch of the tree, and then a gap before the
                          // text. Without the gap the rule ran straight into the
                          // first word — "—Led frontend architecture" — which is
                          // what made the tree read as a stray mark rather than
                          // as structure.
                          width: "10px",
                          marginRight: "4px",
                          paddingTop: "7px",
                          display: "flex",
                          alignItems: "flex-start",
                        }}
                      >
                        <div
                          style={{
                            width: "100%",
                            height: "2px",
                            backgroundColor: "#000",
                          }}
                        />
                      </div>
                      <EditableText
                        multiline
                        value={highlight}
                        onCommit={(value) =>
                          setHighlight(locale, index, bulletIndex, value)
                        }
                        placeholder="What you did in this role"
                        ariaLabel={`Job ${index + 1} bullet ${bulletIndex + 1}`}
                        className="flex-1"
                      />
                      {/*
                        Out of the flow, because in it this control was taking
                        about fifty pixels of every bullet's width while being
                        invisible: the text column measured 668px against the
                        714px it has now. So bullets wrapped earlier on
                        screen than in the export, where the control is removed
                        outright — and since the hidden tree is what gets
                        measured, pagination was planned around lines the file
                        does not contain. Same text, two different documents.
                      */}
                      <span className="absolute right-0 top-0 bg-white pl-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover/bullet:opacity-100 print:hidden">
                        <button
                          type="button"
                          onClick={() =>
                            removeHighlight(locale, index, bulletIndex)
                          }
                          aria-label={`Remove bullet ${bulletIndex + 1}`}
                          title="Remove this bullet"
                          className="rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#65B7FF]"
                        >
                          Remove
                        </button>
                      </span>
                    </li>
                  ))}

                </ul>
              </div>

              {/*
                Revealed with the job rather than always shown. `EntryControls`
                keeps a lone "add" visible on its own — right for an empty
                section, wrong here, where one would sit under every job in a
                filled CV and turn a document back into a form.

                Below the tree rather than as its last `li`, which is where it
                was: the rule down the left is a sibling stretched to the list's
                height, so a row inside the list — even an invisible one — made
                the rule overhang the last bullet by a line.

                Positioned rather than stacked, for the same reason the per-
                bullet control is: in the flow it cost 32px of every job — 224px
                across this CV — reserved for something nobody can see, which the
                export then removes. Absolute keeps it out of the measured height
                without moving it in the DOM, so it is still tabbed to in the
                order it is read in.
              */}
              <div className="absolute inset-x-4 bottom-0 ml-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 print:hidden">
                <EntryControls
                  onAdd={() => addHighlight(locale, index)}
                  addLabel={`Add a bullet to ${entry.title || "this job"}`}
                />
              </div>
            </div>
          </MeasuredItem>
        ))
      )}

      {experience.length > 0 && (
        <MeasuredItem
            id="exp-add"
            section="experience"
            order={trailingOrder("experience")}
          >
          <div className="bg-white px-4 pb-2">
            <EntryControls
              onAdd={() => addEntry(locale, "experience")}
              addLabel="Add a job"
            />
          </div>
        </MeasuredItem>
      )}
    </MeasuredSection>
  );
}
