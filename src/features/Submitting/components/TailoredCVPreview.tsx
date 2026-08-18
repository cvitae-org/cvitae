"use client";

import { NextIntlClientProvider } from 'next-intl';
import type { Locale } from '@/libs/i18n/config';
import enMessages from '@/../messages/en.json';
import plMessages from '@/../messages/pl.json';
import { CVLayout } from '@/features/CV/components/CVLayout';
import { CvDocumentProvider } from '@/features/CV/contexts/CvDocumentContext';
import {
  CVHeader,
  CVExperience,
  CVEducation,
  CVCertificates,
  CVLanguages,
  CVFooter
} from '@/features/CV/components/sections';
import type { EvidenceCvVariant, OfferSnapshot } from '../types';

/**
 * The real CV, with this offer's title and summary in it.
 *
 * The same components as the CV page rather than a mock-up of them: what is
 * previewed here is the document that gets attached, down to the page breaks —
 * a tailored summary two lines longer can push a job onto the next page, and
 * that is exactly the thing worth seeing before sending.
 *
 * Only ever rendered for the selected submission. The PDF generator collects
 * `[data-page]` across the whole document, so a second CV on the page would
 * end up in the same file.
 */

type TailoredCVPreviewProps = {
  cv: EvidenceCvVariant;
  language: Locale;
};

/**
 * Both locales, carried on the page rather than fetched.
 *
 * The application's language is not the app's: an English UI can be writing a
 * Polish application, and the CV around the generated summary has to be in the
 * same language as the summary or the document reads as half-translated. Two
 * files of roughly 7KB is a cheaper way to guarantee that than a request that
 * can be in flight while the CV renders.
 */
const messagesFor: Record<Locale, Record<string, unknown>> = {
  en: enMessages,
  pl: plMessages
};

/** Filesystem-safe, and recognisable in a downloads folder full of CVs. */
const toSlug = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[łŁ]/g, (letter) => (letter === 'Ł' ? 'L' : 'l'))
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/**
 * Named after the company it is going to, because that is what tells two
 * downloads apart once they are both sitting in ~/Downloads. The language is
 * the application's, which is the language of the document in the file.
 */
export const cvFilename = (
  offer: OfferSnapshot,
  language: string,
  documentName = 'CV'
): string => {
  const name = toSlug(documentName) || 'CV';
  const company = toSlug(offer.company);
  const role = toSlug(offer.position);
  return `${name}_${role || 'Role'}_${language.toUpperCase()}${
    company ? `_${company}` : ''
  }_Designed.pdf`;
};

export function TailoredCVPreview({ cv, language }: TailoredCVPreviewProps) {
  // The provider seeds itself once and the layout caches its measurements
  // until remounted, so switching submission — or regenerating this one, or
  // changing its language — has to remount both. Keying the outer provider
  // does that for the whole subtree, and a language change genuinely needs it:
  // every measured height changes with the text.
  return (
    <NextIntlClientProvider
      key={`${language}-${cv.meta.updatedAt}-${cv.id}`}
      locale={language}
      messages={messagesFor[language]}
    >
      <CvDocumentProvider document={cv.output} locale={language}>
        <div inert aria-label="Frozen evidence CV preview">
          <CVLayout previewId={`submission-${cv.id}`}>
            <CVHeader />
            <CVExperience />
            <CVEducation />
            <CVCertificates />
            <CVLanguages />
            <CVFooter />
          </CVLayout>
        </div>
      </CvDocumentProvider>
    </NextIntlClientProvider>
  );
}
