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
      title={t("sections.experience")}
      repeatHeaderOnNewPage={false}
      headerClassName="bg-white px-4"
    >
      {experience.length === 0 ? (
        <MeasuredItem id="exp-empty" section="experience">
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
          >
            <div className="group bg-white px-4 space-y-2 pb-2">
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
                    placeholder="Present"
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
                      className="group/bullet leading-relaxed flex"
                      style={{ alignItems: "flex-start" }}
                    >
                      <div
                        id={`cv-experience-bullet-${index}-${bulletIndex}`}
                        className="flex-shrink-0"
                        style={{
                          width: "8px",
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
                      <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover/bullet:opacity-100 print:hidden">
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

                  {/*
                    Revealed with the job rather than always shown. `EntryControls`
                    keeps a lone "add" visible on its own — right for an empty
                    section, wrong here, where one would sit under every job in a
                    filled CV and turn a document back into a form.
                  */}
                  <li className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 print:hidden">
                    <EntryControls
                      onAdd={() => addHighlight(locale, index)}
                      addLabel={`Add a bullet to ${entry.title || "this job"}`}
                    />
                  </li>
                </ul>
              </div>
            </div>
          </MeasuredItem>
        ))
      )}

      {experience.length > 0 && (
        <MeasuredItem id="exp-add" section="experience">
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
