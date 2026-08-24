"use client";

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Whether the clause on screen is the one being edited.
 *
 * The same split `PortraitEditorContext` exists for, and for the same reason:
 * `CVFooter` renders both on the master CV, where the clause is yours to
 * change, and in Submitting's tailored preview, which is a record of what was
 * sent. Clicking the second should do nothing — a consent clause that could be
 * rewritten from inside a sent application would be editing the past.
 *
 * The footer cannot tell the two apart, so the page that owns the modal says so
 * by providing this, and the page that does not leaves the text inert.
 */
const ConsentEditorContext = createContext<(() => void) | null>(null);

export function ConsentEditorProvider({
  onEdit,
  children
}: {
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <ConsentEditorContext.Provider value={onEdit}>
      {children}
    </ConsentEditorContext.Provider>
  );
}

/** Null where the clause is not editable, which is the default. */
export const useConsentEditor = (): (() => void) | null =>
  useContext(ConsentEditorContext);
