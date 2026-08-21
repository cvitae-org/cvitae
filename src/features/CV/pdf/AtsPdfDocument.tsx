import React from 'react';
import {
  Document as PdfDocument,
  Link,
  Page,
  StyleSheet,
  Text,
  View
} from '@react-pdf/renderer';
import type { CvDocument } from '../document';
import type { Locale } from '@/libs/i18n/config';

const headings: Record<
  Locale,
  {
    summary: string;
    skills: string;
    experience: string;
    education: string;
    certificates: string;
    languages: string;
    present: string;
  }
> = {
  en: {
    summary: 'Professional Summary',
    skills: 'Skills',
    experience: 'Work Experience',
    education: 'Education',
    certificates: 'Certifications',
    languages: 'Languages',
    present: 'Present'
  },
  pl: {
    summary: 'Podsumowanie Zawodowe',
    skills: 'Umiejętności',
    experience: 'Doświadczenie Zawodowe',
    education: 'Edukacja',
    certificates: 'Certyfikaty',
    languages: 'Języki',
    present: 'Obecnie'
  }
};

const styles = StyleSheet.create({
  page: {
    fontFamily: 'DejaVu Sans ATS',
    fontSize: 8.4,
    lineHeight: 1.28,
    color: '#111827',
    paddingTop: 31,
    paddingRight: 36,
    paddingBottom: 31,
    paddingLeft: 36
  },
  name: { fontSize: 20, fontWeight: 700, lineHeight: 1.05 },
  headline: {
    marginTop: 3,
    fontSize: 10.5,
    fontWeight: 700,
    color: '#1f4f73'
  },
  contact: { marginTop: 5, flexDirection: 'row', flexWrap: 'wrap' },
  contactItem: { marginRight: 9, marginBottom: 2 },
  link: { color: '#164e73', textDecoration: 'underline' },
  section: { marginTop: 8 },
  heading: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    borderBottomWidth: 0.7,
    borderBottomColor: '#6b7280',
    paddingBottom: 1.5,
    marginBottom: 4
  },
  summary: { fontSize: 8.6 },
  skillRow: { flexDirection: 'row', marginBottom: 2 },
  skillLabel: { width: 104, fontWeight: 700, paddingRight: 5 },
  skillItems: { flex: 1 },
  entry: { marginBottom: 5 },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  entryTitle: { flex: 1, fontWeight: 700, fontSize: 9 },
  date: { marginLeft: 8, color: '#374151' },
  company: { fontStyle: 'italic', marginTop: 1 },
  bulletRow: { flexDirection: 'row', marginTop: 1.5, paddingLeft: 5 },
  bullet: { width: 9 },
  bulletText: { flex: 1 },
  detail: { marginTop: 1 },
});

const absoluteUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

/** PDF URI strings are safest as ASCII; the visible label remains Unicode. */
const annotationUrl = (value: string): string => {
  const target = absoluteUrl(value);
  try {
    return new URL(target).href;
  } catch {
    return encodeURI(target);
  }
};

const phoneUrl = (value: string): string =>
  `tel:${value.replace(/[^+\d]/g, '')}`;

/** Invisible break opportunities keep a long visible URL inside the A4 width. */
const breakableUrl = (value: string): string =>
  value
    .split(/([/_.?&=-])/)
    .map((part) =>
      /[/_.?&=-]/.test(part)
        ? `${part}\u200B`
        : part.replace(/(.{24})/g, '$1\u200B')
    )
    .join('');

const dateRange = (
  started: string,
  finished: string | null,
  present: string
) => [started, finished ?? present].filter(Boolean).join(' – ');

const Section = ({
  title,
  children,
  keepWithFirst = false
}: {
  title: string;
  children: React.ReactNode;
  keepWithFirst?: boolean;
}) => {
  const parts = React.Children.toArray(children);
  return (
    <View style={styles.section}>
      {keepWithFirst && parts.length > 0 ? (
        <>
          <View wrap={false}>
            <Text style={styles.heading}>{`${title} `}</Text>
            {parts[0]}
          </View>
          {parts.slice(1)}
        </>
      ) : (
        <>
          <Text style={styles.heading} minPresenceAhead={72}>{`${title} `}</Text>
          {children}
        </>
      )}
    </View>
  );
};

export type AtsPdfDocumentProps = {
  document: CvDocument;
  locale: Locale;
  company?: string;
  targetRole?: string;
};

export function AtsPdfDocument({
  document,
  locale,
  company,
  targetRole
}: AtsPdfDocumentProps) {
  const h = headings[locale];
  const role = targetRole?.trim() || document.skills.role;
  const metadataTitle = [document.personal.name, role].filter(Boolean).join(' — ');

  return (
    <PdfDocument
      title={metadataTitle}
      author={document.personal.name}
      subject={company ? `CV for ${role} at ${company}` : `CV — ${role}`}
      creator="C Vitae native ATS exporter"
      producer="@react-pdf/renderer"
      language={locale === 'pl' ? 'pl-PL' : 'en-GB'}
    >
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.name}>{document.personal.name}</Text>
        {role && <Text style={styles.headline}>{role}</Text>}

        <View style={styles.contact}>
          {document.personal.email && (
            <Link src={`mailto:${document.personal.email}`} style={[styles.contactItem, styles.link]}>
              {document.personal.email}
            </Link>
          )}
          {document.personal.phone && (
            <Link src={phoneUrl(document.personal.phone)} style={[styles.contactItem, styles.link]}>
              {document.personal.phone}
            </Link>
          )}
          {document.personal.location && (
            <Text style={styles.contactItem}>{document.personal.location}</Text>
          )}
          {Object.values(document.personal.links).map((url) => (
            <Link key={url} src={annotationUrl(url)} style={[styles.contactItem, styles.link]}>
              {breakableUrl(url)}
            </Link>
          ))}
        </View>

        {document.role_description && (
          <Section title={h.summary}>
            <Text style={styles.summary}>{document.role_description}</Text>
          </Section>
        )}

        {document.skills.groups.some((group) => group.items.length > 0) && (
          <Section title={h.skills}>
            {document.skills.groups.map(
              (group) =>
                group.items.length > 0 && (
                  <View key={`${group.label}-${group.items.join('-')}`} style={styles.skillRow}>
                    <Text style={styles.skillLabel}>{group.label}</Text>
                    <Text style={styles.skillItems}>{group.items.join(', ')}</Text>
                  </View>
                )
            )}
          </Section>
        )}

        {document.experience.length > 0 && (
          <Section title={h.experience} keepWithFirst>
            {/*
              Every bullet, for every role.
              
              A rule here used to drop the bullets of the fifth role onward when
              it had two or fewer of them, to keep an older job to a single
              line. It was silent, and it took the same bullets out of
              `atsExpectedText` — so a parser reading this file never saw them
              either. That is the wrong trade for this export in particular: an
              ATS does not care how many pages it reads, it matches on the words,
              and the words being dropped were the user's own. Length is handled
              where it belongs, by the preflight warning about a long document.
            */}
            {document.experience.map((job) => (
              <View
                key={`${job.company}-${job.title}-${job.started}`}
                style={styles.entry}
                wrap={false}
              >
                <View style={styles.entryHeader}>
                  <Text style={styles.entryTitle}>{job.title}</Text>
                  <Text style={styles.date}>
                    {dateRange(job.started, job.finished, h.present)}
                  </Text>
                </View>
                <Text style={styles.company}>{`${job.company} `}</Text>
                {job.highlights.map((highlight, bulletIndex) => (
                  <View key={`${bulletIndex}-${highlight}`} style={styles.bulletRow}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>{highlight}</Text>
                  </View>
                ))}
              </View>
            ))}
          </Section>
        )}

        {document.education.length > 0 && (
          <Section title={h.education} keepWithFirst>
            {document.education.map((item) => (
              <View key={`${item.university}-${item.degree}`} style={styles.entry} wrap={false}>
                <View style={styles.entryHeader}>
                  <Text style={styles.entryTitle}>{item.degree}</Text>
                  <Text style={styles.date}>
                    {dateRange(item.started, item.finished, h.present)}
                  </Text>
                </View>
                <Text style={styles.company}>{item.university}</Text>
                {item.thesis && <Text style={styles.detail}>{item.thesis}</Text>}
                {item.mark && <Text style={styles.detail}>{item.mark}</Text>}
              </View>
            ))}
          </Section>
        )}

        {document.certificates.length > 0 && (
          <Section title={h.certificates} keepWithFirst>
            {document.certificates.map((item) => (
              <View key={`${item.name}-${item.issuer}`} style={styles.entryHeader} wrap={false}>
                <Text style={styles.entryTitle}>
                  {item.name}{item.issuer ? ` — ${item.issuer}` : ''}
                </Text>
                <Text style={styles.date}>
                  {dateRange(item.started, item.finished, '')}
                </Text>
              </View>
            ))}
          </Section>
        )}

        {document.languages.length > 0 && (
          <Section title={h.languages} keepWithFirst>
            <Text>
              {document.languages
                .map((language) => `${language.name} — ${language.level}`)
                .join(', ')}
            </Text>
          </Section>
        )}
      </Page>
    </PdfDocument>
  );
}

/** Plain text that should be recoverable from the native PDF. */
export const atsExpectedText = (
  document: CvDocument,
  locale: Locale,
  targetRole?: string
): string => {
  const h = headings[locale];
  const hasSkills = document.skills.groups.some((group) => group.items.length);
  const values = [
    document.personal.name,
    targetRole?.trim() || document.skills.role,
    document.personal.email,
    document.personal.phone,
    document.personal.location,
    ...Object.values(document.personal.links).map(breakableUrl),
    document.role_description ? h.summary : '',
    document.role_description,
    hasSkills ? h.skills : '',
    ...document.skills.groups.flatMap((group) => [group.label, ...group.items]),
    document.experience.length ? h.experience : '',
    ...document.experience.flatMap((job) => [
      job.title,
      job.company,
      job.started,
      job.finished ?? h.present,
      ...job.highlights
    ]),
    document.education.length ? h.education : '',
    ...document.education.flatMap((item) => [
      item.degree,
      item.university,
      item.started,
      item.finished ?? h.present,
      item.thesis,
      item.mark
    ]),
    document.certificates.length ? h.certificates : '',
    ...document.certificates.flatMap((item) => [
      item.name,
      item.issuer,
      item.started,
      item.finished ?? ''
    ]),
    document.languages.length ? h.languages : '',
    ...document.languages.flatMap((item) => [item.name, item.level])
  ];
  return values.filter(Boolean).join('\n');
};

export const atsIgnoredRecoveryText = (document: CvDocument): string[] =>
  Object.values(document.personal.links).map(breakableUrl);
