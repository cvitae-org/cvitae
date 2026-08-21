"use client";

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Whether the portrait on screen is the one being edited.
 *
 * `CVHeader` renders in two places that mean different things: the master CV,
 * where the picture is yours to change, and a tailored variant in Submitting,
 * which is a frozen record of what was sent. The click that opens the editor
 * must exist in the first and not the second, and the header cannot tell them
 * apart on its own — so the page that owns the modal says so by providing this,
 * and the page that does not simply leaves the portrait inert.
 */
const PortraitEditorContext = createContext<(() => void) | null>(null);

export function PortraitEditorProvider({
  onEdit,
  children
}: {
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <PortraitEditorContext.Provider value={onEdit}>
      {children}
    </PortraitEditorContext.Provider>
  );
}

/** Null where the portrait is not editable, which is the default. */
export const usePortraitEditor = (): (() => void) | null =>
  useContext(PortraitEditorContext);
