import React from 'react';
import type { Locale } from '@/libs/i18n/config';
import type { CvDocument } from '../document';
import { uniqueContactLinks } from './contactLinks';
import { preflightPdf, type PdfPreflightResult } from './preflight';
import { printablePortrait } from './portraitImage';

const FONT_FAMILY = 'DejaVu Sans ATS';
let fontsRegistered = false;

const absolute = (path: string): string =>
  typeof window === 'undefined' ? path : new URL(path, window.location.href).href;

const ensureFonts = async (
  Font: typeof import('@react-pdf/renderer').Font
) => {
  const faces = ['regular', 'bold', 'italic', 'bold-italic'] as const;
  const responses = await Promise.all(
    faces.map((face) => fetch(absolute(`/api/assets/dejavu/${face}`)))
  );
  const failed = responses.findIndex((response) => !response.ok);
  if (failed >= 0) throw new Error(`The DejaVu ${faces[failed]} font is unavailable.`);

  if (!fontsRegistered) {
    Font.register({
      family: FONT_FAMILY,
      fonts: [
        { src: absolute('/api/assets/dejavu/regular'), fontWeight: 400 },
        { src: absolute('/api/assets/dejavu/bold'), fontWeight: 700 },
        {
          src: absolute('/api/assets/dejavu/italic'),
          fontWeight: 400,
          fontStyle: 'italic'
        },
        {
          src: absolute('/api/assets/dejavu/bold-italic'),
          fontWeight: 700,
          fontStyle: 'italic'
        }
      ]
    });
    Font.registerHyphenationCallback((word) => [word]);
    fontsRegistered = true;
  }
};

export const slugPart = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[łŁ]/g, (letter) => (letter === 'Ł' ? 'L' : 'l'))
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);

export const atsFilename = ({
  document,
  locale,
  targetRole,
  company
}: {
  document: CvDocument;
  locale: Locale;
  targetRole?: string;
  company?: string;
}): string => {
  const parts = [
    slugPart(document.personal.name) || 'CV',
    slugPart(targetRole || document.skills.role),
    slugPart(company ?? ''),
    'CV',
    locale.toUpperCase(),
    'ATS'
  ].filter(Boolean);
  return `${parts.join('_')}.pdf`;
};

const expectedLinks = (document: CvDocument): string[] => [
  ...(document.personal.email ? [`mailto:${document.personal.email}`] : []),
  ...(document.personal.phone
    ? [`tel:${document.personal.phone.replace(/[^+\d]/g, '')}`]
    : []),
  // The same list the header draws, so preflight cannot demand an annotation
  // for a duplicate the renderer deliberately left out.
  ...uniqueContactLinks(document).map((url) =>
    /^[a-z][a-z\d+.-]*:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
  )
];

const logicalHeadings = (document: CvDocument, locale: Locale): string[] => {
  const values =
    locale === 'pl'
      ? {
          summary: 'Podsumowanie Zawodowe',
          skills: 'Umiejętności',
          experience: 'Doświadczenie Zawodowe',
          education: 'Edukacja',
          certificates: 'Certyfikaty',
          languages: 'Języki'
        }
      : {
          summary: 'Professional Summary',
          skills: 'Skills',
          experience: 'Work Experience',
          education: 'Education',
          certificates: 'Certifications',
          languages: 'Languages'
        };
  return [
    document.role_description ? values.summary : '',
    document.skills.groups.some((group) => group.items.length) ? values.skills : '',
    document.experience.length ? values.experience : '',
    document.education.length ? values.education : '',
    document.certificates.length ? values.certificates : '',
    document.languages.length ? values.languages : ''
  ].filter(Boolean);
};

export async function generateAtsPdf({
  document,
  locale,
  targetRole,
  company,
  portrait
}: {
  document: CvDocument;
  locale: Locale;
  targetRole?: string;
  company?: string;
  /**
   * The portrait source to embed, or omitted to export without one.
   *
   * Whatever the portrait store holds — a WebP data URL, or a path under
   * `public/` for the default — since `printablePortrait` is what turns either
   * into something the exporter can embed.
   */
  portrait?: string;
}): Promise<{ blob: Blob; preflight: PdfPreflightResult; filename: string }> {
  const [
    { Font, pdf },
    { AtsPdfDocument, atsExpectedText, atsIgnoredRecoveryText }
  ] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./AtsPdfDocument')
  ]);
  await ensureFonts(Font);

  // A portrait that will not load must not take the CV down with it. The
  // photograph is the one part of this export nobody is applying for a job
  // with, and failing the download over it — leaving the user with no CV and a
  // canvas error — is the wrong trade.
  const printable = portrait
    ? await printablePortrait(portrait).catch((error: unknown) => {
        console.warn('The portrait was left out of the ATS export.', error);
        return undefined;
      })
    : undefined;

  const element = React.createElement(AtsPdfDocument, {
    document,
    locale,
    targetRole,
    company,
    portrait: printable
  });
  const blob = await pdf(element as Parameters<typeof pdf>[0]).toBlob();
  const preflight = await preflightPdf(blob, {
    expectedText: atsExpectedText(document, locale, targetRole),
    expectedLinks: expectedLinks(document),
    logicalHeadings: logicalHeadings(document, locale),
    language: locale === 'pl' ? 'pl-PL' : 'en-GB',
    ignoredRecoveryText: atsIgnoredRecoveryText(document)
  });
  return {
    blob,
    preflight,
    filename: atsFilename({ document, locale, targetRole, company })
  };
}

export const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
};
