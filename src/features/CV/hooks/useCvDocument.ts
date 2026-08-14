"use client";

import { useSyncExternalStore } from 'react';
import { useLocale } from 'next-intl';
import type { Locale } from '@/libs/i18n/config';
import { emptyDocument, isBlank, type CvDocument } from '../document';
import { getServerSnapshot, getSnapshot, subscribe } from '../store';

/**
 * The CV for the language currently being viewed.
 *
 * The locale comes from the route rather than a prop, so switching language
 * switches document — which is the whole behaviour of two independent CVs, and
 * needs no wiring beyond this.
 */
export const useCvDocument = (): {
  document: CvDocument;
  locale: Locale;
  /** False until IndexedDB has been read; an empty CV and an unread one differ. */
  hydrated: boolean;
  /** Nothing entered yet, so the page should offer a way to begin. */
  blank: boolean;
} => {
  const locale = useLocale() as Locale;
  const { data, hydrated } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  const document = data[locale] ?? emptyDocument();

  return { document, locale, hydrated, blank: isBlank(document) };
};
