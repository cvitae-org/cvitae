"use client";

import { useMemo } from 'react';
import { createTranslator } from 'next-intl';
import enMessages from '@/../messages/en.json';
import plMessages from '@/../messages/pl.json';
import type { Locale } from '@/libs/i18n/config';
import { useCvDocument } from './useCvDocument';

const messagesByLocale = {
  en: enMessages.cv.document,
  pl: plMessages.cv.document
} satisfies Record<Locale, Record<string, unknown>>;

/** Printed CV copy follows the document language, not the app UI language. */
export const useCvDocumentTranslations = () => {
  const { locale } = useCvDocument();

  return useMemo(
    () => createTranslator({ locale, messages: messagesByLocale[locale] }),
    [locale]
  );
};
