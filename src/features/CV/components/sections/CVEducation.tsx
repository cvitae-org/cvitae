"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MeasuredSection } from "../layout/MeasuredSection";
import { MeasuredItem } from "../layout/MeasuredItem";
import { EditableText } from "../editing/EditableText";
import { EntryControls } from "../editing/EntryControls";
import { EmptySection } from "../editing/EmptySection";
import { useCvDocument } from "../../hooks/useCvDocument";
import { addEntry, patchEntry, removeEntry } from "../../store";
import { entryOrder, sectionOrder, trailingOrder } from "../../order";
import { useCvDocumentTranslations } from '../../hooks/useCvDocumentTranslations';

/**
 * Education, now a list rather than a single fixed block.
 *
 * The translation file held one education object, so the section rendered
 * exactly one — a second degree had nowhere to go. The document stores an array,
 * and this follows it: the shape people actually have is "usually one, sometimes
 * two or three".
 *
 * `thesis` and `mark` are rendered here for the first time. They were already in
 * the document and had no way in, which is the worst state for a field: stored,
 * exported, and uneditable. They sit on one subdued line because most CVs leave
 * them empty and a blank line per optional field would dominate the section.
 */
export function CVEducation() {
  const documentT = useCvDocumentTranslations();
  const t = useTranslations('cv.editor');
  const { document, locale } = useCvDocument();
  const education = document.education;

  return (
    <MeasuredSection
      id="education"
      order={sectionOrder("education")}
      title={documentT("sections.education")}
      headerClassName="bg-white px-4"
    >
      {education.length === 0 ? (
        <MeasuredItem
          id="education-empty"
          section="education"
          order={entryOrder("education", 0)}
        >
          <div className="bg-white px-4 pb-2">
            <EmptySection
              hint={t('educationHint')}
              onCreate={() => addEntry(locale, "education")}
              label={t('addFirstQualification')}
            />
          </div>
        </MeasuredItem>
      ) : (
        education.map((entry, index) => (
          <MeasuredItem
            key={`education-${index}`}
            id={`education-${index}`}
            section="education"
            order={entryOrder("education", index)}
          >
            <div className="group bg-white px-4 pb-2 space-y-1">
              <div className="flex items-start justify-between gap-4">
                <EditableText
                  as="h3"
                  value={entry.degree}
                  onCommit={(value) =>
                    patchEntry(locale, "education", index, { degree: value })
                  }
                  placeholder={t('degree')}
                  ariaLabel={t('qualificationDegreeAria', { number: index + 1 })}
                  className="flex-1 text-sm font-bold text-gray-900 font-cv"
                />
                <span className="flex items-center gap-1 text-xs text-gray-500 font-cv whitespace-nowrap">
                  <EditableText
                    value={entry.started}
                    onCommit={(value) =>
                      patchEntry(locale, "education", index, { started: value })
                    }
                    placeholder={t('start')}
                    ariaLabel={t('qualificationStartAria', { number: index + 1 })}
                  />
                  <span aria-hidden="true">–</span>
                  <EditableText
                    value={entry.finished ?? ""}
                    onCommit={(value) =>
                      patchEntry(locale, "education", index, {
                        finished: value.trim() ? value : null,
                      })
                    }
                    // Printed, so translated. See the note in CVExperience.
                    placeholder={documentT("ongoing")}
                    placeholderIsValue
                    ariaLabel={t('qualificationEndAria', { number: index + 1 })}
                  />
                  <EntryControls
                    onRemove={() => removeEntry(locale, "education", index)}
                    removeLabel={t('removeQualification', {
                      name: entry.university || t('thisQualification')
                    })}
                  />
                </span>
              </div>

              <EditableText
                as="p"
                value={entry.university}
                onCommit={(value) =>
                  patchEntry(locale, "education", index, { university: value })
                }
                placeholder={t('institution')}
                ariaLabel={t('qualificationInstitutionAria', { number: index + 1 })}
                className="text-xs text-gray-600 font-cv"
              />

              <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-gray-500 font-cv">
                <EditableText
                  value={entry.thesis}
                  onCommit={(value) =>
                    patchEntry(locale, "education", index, { thesis: value })
                  }
                  placeholder={t('thesis')}
                  ariaLabel={t('qualificationThesisAria', { number: index + 1 })}
                />
                <EditableText
                  value={entry.mark}
                  onCommit={(value) =>
                    patchEntry(locale, "education", index, { mark: value })
                  }
                  placeholder={t('grade')}
                  ariaLabel={t('qualificationGradeAria', { number: index + 1 })}
                />
              </p>
            </div>
          </MeasuredItem>
        ))
      )}

      {education.length > 0 && (
        <MeasuredItem
          id="education-add"
          section="education"
          order={trailingOrder("education")}
        >
          <div className="bg-white px-4 pb-2">
            <EntryControls
              onAdd={() => addEntry(locale, "education")}
              addLabel={t('addQualification')}
            />
          </div>
        </MeasuredItem>
      )}
    </MeasuredSection>
  );
}
