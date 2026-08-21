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
 * Certificates.
 *
 * This section already looped, but over `Array.from({ length: 1 })` — the count
 * was a constant because the translation file could not express a list. It reads
 * from the document now, so the number of certificates is however many there
 * are, including none.
 *
 * The document's `started` and `finished` are the issue and expiry dates. Most
 * certificates never expire, so an empty `finished` is the ordinary case and
 * says so rather than reading as an unfilled field.
 */
export function CVCertificates() {
  const documentT = useCvDocumentTranslations();
  const t = useTranslations('cv.editor');
  const { document, locale } = useCvDocument();
  const certificates = document.certificates;

  return (
    <MeasuredSection
      id="certificates"
      order={sectionOrder("certificates")}
      title={documentT("sections.certificates")}
      headerClassName="bg-white px-4"
    >
      {certificates.length === 0 ? (
        <MeasuredItem
          id="cert-empty"
          section="certificates"
          order={entryOrder("certificates", 0)}
        >
          <div className="bg-white px-4 pb-2">
            <EmptySection
              hint={t('certificateHint')}
              onCreate={() => addEntry(locale, "certificates")}
              label={t('addFirstCertificate')}
            />
          </div>
        </MeasuredItem>
      ) : (
        certificates.map((entry, index) => (
          <MeasuredItem
            key={`cert-${index}`}
            id={`cert-${index}`}
            section="certificates"
            order={entryOrder("certificates", index)}
          >
            <div className="group bg-white px-4 pb-2 space-y-1">
              <div className="flex items-start justify-between gap-4">
                <EditableText
                  as="h3"
                  value={entry.name}
                  onCommit={(value) =>
                    patchEntry(locale, "certificates", index, { name: value })
                  }
                  placeholder={t('certificateName')}
                  ariaLabel={t('certificateNameAria', { number: index + 1 })}
                  className="flex-1 text-xs font-semibold text-gray-900 font-cv"
                />
                <span className="flex items-center gap-1 text-xs text-gray-500 font-cv whitespace-nowrap">
                  <EditableText
                    value={entry.started}
                    onCommit={(value) =>
                      patchEntry(locale, "certificates", index, { started: value })
                    }
                    placeholder={t('issued')}
                    ariaLabel={t('certificateIssuedAria', { number: index + 1 })}
                  />
                  <span aria-hidden="true">–</span>
                  <EditableText
                    value={entry.finished ?? ""}
                    onCommit={(value) =>
                      patchEntry(locale, "certificates", index, {
                        finished: value.trim() ? value : null,
                      })
                    }
                    // Printed, so translated. See the note in CVExperience.
                    placeholder={documentT("noExpiry")}
                    placeholderIsValue
                    ariaLabel={t('certificateExpiryAria', { number: index + 1 })}
                  />
                  <EntryControls
                    onRemove={() => removeEntry(locale, "certificates", index)}
                    removeLabel={t('removeCertificate', {
                      name: entry.name || t('thisCertificate')
                    })}
                  />
                </span>
              </div>

              <EditableText
                as="p"
                value={entry.issuer}
                onCommit={(value) =>
                  patchEntry(locale, "certificates", index, { issuer: value })
                }
                placeholder={t('issuer')}
                ariaLabel={t('certificateIssuerAria', { number: index + 1 })}
                className="text-xs text-gray-600 font-cv"
              />
            </div>
          </MeasuredItem>
        ))
      )}

      {certificates.length > 0 && (
        <MeasuredItem
          id="cert-add"
          section="certificates"
          order={trailingOrder("certificates")}
        >
          <div className="bg-white px-4 pb-2">
            <EntryControls
              onAdd={() => addEntry(locale, "certificates")}
              addLabel={t('addCertificate')}
            />
          </div>
        </MeasuredItem>
      )}
    </MeasuredSection>
  );
}
