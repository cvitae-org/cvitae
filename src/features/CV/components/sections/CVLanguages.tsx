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
import { entryOrder, sectionOrder } from "../../order";

/**
 * Spoken languages.
 *
 * This section previously hardcoded "Polish: Native" and read exactly one
 * language out of the translations, because the translation file had no way to
 * express a list of unknown length. Both go away with the document: the list is
 * whatever the CV holds, including none.
 */
export function CVLanguages() {
  const t = useTranslations("cv");
  const { document, locale } = useCvDocument();
  const languages = document.languages;

  return (
    <MeasuredSection
      id="languages"
      order={sectionOrder("languages")}
      title={t("sections.languages")}
      headerClassName="bg-white px-4"
    >
      <MeasuredItem
        id="languages-content"
        section="languages"
        order={entryOrder("languages", 0)}
      >
        <div className="bg-white px-4 pb-2 space-y-2">
          {languages.map((language, index) => (
            <div key={`lang-${index}`} className="group flex items-center gap-2">
              <EditableText
                value={language.name}
                onCommit={(value) =>
                  patchEntry(locale, "languages", index, { name: value })
                }
                placeholder="Language"
                ariaLabel={`Language ${index + 1} name`}
                className="text-xs font-semibold text-gray-900 font-cv"
              />
              <span className="text-xs font-semibold text-gray-900 font-cv">:</span>
              <EditableText
                value={language.level}
                onCommit={(value) =>
                  patchEntry(locale, "languages", index, { level: value })
                }
                placeholder="Level"
                ariaLabel={`Language ${index + 1} level`}
                className="text-xs text-gray-700 font-cv"
              />
              <EntryControls
                onRemove={() => removeEntry(locale, "languages", index)}
                removeLabel={`Remove ${language.name || "language"}`}
              />
            </div>
          ))}

          {languages.length === 0 ? (
            <EmptySection
              hint="Language — Level"
              onCreate={() => addEntry(locale, "languages")}
              label="Add the first language"
            />
          ) : (
            <EntryControls
              onAdd={() => addEntry(locale, "languages")}
              addLabel="Add a language"
            />
          )}
        </div>
      </MeasuredItem>
    </MeasuredSection>
  );
}
