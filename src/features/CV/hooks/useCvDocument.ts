"use client";

import { useSyncExternalStore } from 'react';
import { useLocale } from 'next-intl';
import type { Locale } from '@/libs/i18n/config';
import { emptyDocument, isBlank, type CvDocument } from '../document';
import { getServerSnapshot, getSnapshot, subscribe } from '../store';
import { useCvDocumentOverride } from '../contexts/CvDocumentContext';

/**
 * The CV for the language currently being viewed.
 *
 * The locale comes from the route rather than a prop, so switching language
 * switches document — which is the whole behaviour of two independent CVs, and
 * needs no wiring beyond this.
 *
 * `locale` overrides that, for the callers reading a CV they are not currently
 * looking at. An application carries the language it was written in, and the
 * name on its email has to come from the CV being sent rather than from the
 * page that happens to be open.
 */
export const useCvDocument = (
  locale?: Locale
): {
  document: CvDocument;
  locale: Locale;
  /** False until IndexedDB has been read; an empty CV and an unread one differ. */
  hydrated: boolean;
  /** Nothing entered yet, so the page should offer a way to begin. */
  blank: boolean;
} => {
  const routeLocale = useLocale() as Locale;
  const resolved = locale ?? routeLocale;
  const override = useCvDocumentOverride();

  const { data, hydrated } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  const document = override?.document ?? data[resolved] ?? emptyDocument();
  const documentLocale = override?.locale ?? resolved;

  return {
    document,
    locale: documentLocale,
    hydrated: override ? true : hydrated,
    blank: isBlank(document)
  };
};
