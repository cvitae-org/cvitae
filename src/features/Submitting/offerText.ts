import { NOT_STATED } from '@/features/JobResearch/types';
import { getResearchState } from '@/features/JobResearch/store';
import type { Locale } from '@/libs/i18n/config';
import type { OfferSnapshot } from './types';

/**
 * Turning a stored offer back into something a model can read.
 *
 * Research pulls an offer apart into fields; both the CV tailoring and the
 * application email need it whole again. Where the original scrape is still on
 * the research row, that wins — it is the posting in its own words, and the
 * fields are a lossy reading of it.
 */

const stated = (value?: string): boolean =>
  Boolean(value) && value !== NOT_STATED && value !== 'Unknown';

/** The scraped posting, if the research row it came from still holds one. */
export const liveOfferText = (recordId: string): string | undefined => {
  if (!recordId) return undefined;

  const record = getResearchState().records.find(
    (item) => item.id === recordId
  );
  const text = record?.offer_text?.trim();

  return text ? text : undefined;
};

/**
 * The offer as prose.
 *
 * `fullText` is the scrape when there is one. It is capped because a posting
 * can run to tens of thousands of characters of boilerplate — benefits, legal
 * notices, the company's history — and the part that describes the job is at
 * the top. The extracted fields are appended either way: they are the board's
 * own structured data, which the free text often does not repeat.
 */
const MAX_TEXT = 8000;

export const toOfferBrief = (
  offer: OfferSnapshot,
  fullText?: string
): string => {
  const facts: [string, string | string[]][] = [
    ['Company', offer.company],
    ['What the company does', offer.company_type],
    ['Company size', offer.company_size],
    ['Position', offer.position],
    ['Role and stack', offer.role_profile],
    ['Seniority', offer.seniority],
    ['Location', offer.location],
    ['Work mode', offer.work_mode],
    ['Salary', offer.salary],
    ['Contract', offer.contract_type],
    ['Engagement length', offer.engagement_length],
    ['Start date', offer.start_date],
    ['Team', offer.team],
    ['Ideal candidate', offer.ideal_candidate],
    ['Responsibilities', offer.responsibilities],
    ['Required skills', offer.required_skills],
    ['How to apply', offer.how_to_apply]
  ];

  const lines = facts
    .map(([label, value]) => {
      if (Array.isArray(value)) {
        return value.length ? `${label}: ${value.join('; ')}` : null;
      }
      return stated(value) ? `${label}: ${value}` : null;
    })
    .filter((line): line is string => line !== null);

  const trimmed = fullText?.trim();
  const posting = trimmed
    ? `\n\nORIGINAL POSTING:\n${trimmed.slice(0, MAX_TEXT)}${
        trimmed.length > MAX_TEXT ? '\n…(truncated)' : ''
      }`
    : '';

  return `${lines.join('\n')}${posting}`;
};

/** Addresses that exist to receive nothing. */
const IGNORED = /^(no-?reply|do-?not-?reply|noreply)/i;

/** Addresses that are plainly the application route rather than a footer. */
const PREFERRED = /(job|career|kariera|praca|rekrut|recruit|hr|cv|apply|aplik)/i;

const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

type EmailSource = {
  how_to_apply?: string;
  source_note?: string;
  offer_text?: string;
};

/**
 * The address to apply to, when the offer printed one.
 *
 * Searched narrowest-first: `how_to_apply` is the analysis of exactly this
 * question, so an address there is the answer. Only if it is silent does the
 * raw posting get read, where a hit is as likely to be a privacy-policy
 * contact as a recruiter — hence the preference for addresses that name
 * recruitment, and an empty result rather than a guess.
 */
export const findApplyEmail = (source: EmailSource): string => {
  const direct = (source.how_to_apply ?? '').match(EMAIL) ?? [];
  const fromNote = (source.source_note ?? '').match(EMAIL) ?? [];
  const fromText = (source.offer_text ?? '').match(EMAIL) ?? [];

  const usable = (found: string[]) =>
    found.filter((email) => !IGNORED.test(email));

  const scoped = usable([...direct, ...fromNote]);
  if (scoped.length > 0) return scoped[0];

  const wide = usable(fromText);
  return wide.find((email) => PREFERRED.test(email)) ?? '';
};

/**
 * The default subject line, used until a draft replaces it.
 *
 * In the application's language, not the app's — it is part of the email, and
 * an English subject over a Polish message is the kind of seam a recruiter
 * notices.
 */
const subjectLead: Record<Locale, string> = {
  en: 'Application',
  pl: 'Aplikacja'
};

export const defaultSubject = (
  offer: OfferSnapshot,
  name: string,
  language: Locale
): string =>
  `${subjectLead[language]}: ${offer.position}${name ? ` — ${name}` : ''}`;
