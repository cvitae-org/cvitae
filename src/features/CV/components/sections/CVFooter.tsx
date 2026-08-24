"use client";

import React from "react";
import { MeasuredItem } from "../layout/MeasuredItem";
import { sectionOrder } from "../../order";
import { useCvDocument } from "../../hooks/useCvDocument";

/**
 * The clause the CV ends on, read from the document rather than translated.
 *
 * Nothing at all when it is empty — not an empty bordered strip. The rule above
 * the text is what separates a closing clause from the last section, and with
 * no clause to separate it is a line ruled under the CV for its own sake.
 * Clearing the clause in the editor is meant to end the document at its last
 * section, and the whole block leaving is what that looks like.
 */
export function CVFooter() {
  const { document } = useCvDocument();
  const consent = document.consent.trim();

  if (!consent) return null;

  return (
    <MeasuredItem id="cv-footer" section="footer" order={sectionOrder("footer")}>
      <div className="bg-white px-4 py-4 border-t border-gray-300">
        <p className="text-xs text-center text-gray-600 font-cv italic">
          {consent}
        </p>
      </div>
    </MeasuredItem>
  );
}
