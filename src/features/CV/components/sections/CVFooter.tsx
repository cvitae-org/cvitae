"use client";

import React from "react";
import { useTranslations } from 'next-intl';
import { MeasuredItem } from "../layout/MeasuredItem";
import { sectionOrder } from "../../order";
import { useCvDocument } from "../../hooks/useCvDocument";
import { useConsentEditor } from "../../contexts/ConsentEditorContext";

/**
 * The clause the CV ends on, read from the document rather than translated.
 *
 * Nothing at all when it is empty — not an empty bordered strip. The rule above
 * the text is what separates a closing clause from the last section, and with
 * no clause to separate it is a line ruled under the CV for its own sake.
 * Clearing the clause in the editor is meant to end the document at its last
 * section, and the whole block leaving is what that looks like.
 *
 * Where it is editable, clicking it opens the editor — the same affordance the
 * portrait has, and drawn the same way: no pencil, no overlay, nothing but a
 * hover tint. The designed PDF is rasterised from this DOM, so anything painted
 * on top to advertise the click would be painted into the exported file too.
 * A hover state is safe precisely because an export never hovers.
 *
 * Not a `<button>`, though it behaves as one. The clause runs to two lines and
 * a button would inherit the centring, the italics and the font stack from a
 * user-agent stylesheet that overrides all three; `role="button"` on the
 * paragraph keeps the printed text and the semantics separate, which is the
 * distinction that matters once the page becomes a PDF.
 */
export function CVFooter() {
  const t = useTranslations('cv.controls');
  const { document } = useCvDocument();
  const editConsent = useConsentEditor();
  const consent = document.consent.trim();

  if (!consent) return null;

  return (
    <MeasuredItem id="cv-footer" section="footer" order={sectionOrder("footer")}>
      <div className="bg-white px-4 py-4 border-t border-gray-300">
        <p
          {...(editConsent && {
            role: 'button',
            tabIndex: 0,
            title: t('consent'),
            'aria-label': t('consent'),
            onClick: editConsent,
            // Enter and Space, because `role="button"` promises both and a
            // paragraph delivers neither on its own.
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              editConsent();
            }
          })}
          className={`text-xs text-center text-gray-600 font-cv italic${
            editConsent
              ? ' cursor-pointer rounded-sm outline-none transition-colors hover:bg-gray-100 focus-visible:ring-1 focus-visible:ring-[#65B7FF]'
              : ''
          }`}
        >
          {consent}
        </p>
      </div>
    </MeasuredItem>
  );
}
