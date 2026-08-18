"use client";

import { createContext, useContext } from 'react';
import type { Locale } from '@/libs/i18n/config';
import type { CvDocument } from '../document';

const CvDocumentContext = createContext<
  { document: CvDocument; locale: Locale } | undefined
>(undefined);

export function CvDocumentProvider({
  document,
  locale,
  children
}: {
  document: CvDocument;
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <CvDocumentContext.Provider value={{ document, locale }}>
      {children}
    </CvDocumentContext.Provider>
  );
}

export const useCvDocumentOverride = () => useContext(CvDocumentContext);
