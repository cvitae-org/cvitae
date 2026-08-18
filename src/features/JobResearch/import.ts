import type { JobRecord, WorkMode } from './types';
import { NOT_STATED, workModes } from './types';
import { createId, normalizeUrl } from './storage';
import { normalizeOfferText, normalizeRequirements } from './requirements';

/**
 * Reads cvitae-scrapper's JSONL output into table rows.
 *
 * One file becomes one tab, so every row here is stamped with the same
 * `listId` and a scraper run can be read on its own rather than dissolving
 * into everything collected before it.
 *
 * The scraper has already done the expensive half — it fetched the posting and
 * kept the text — so an import costs nothing and needs no model. What it cannot
 * supply is the analysed half: company_type, role_profile, ideal_candidate,
 * responsibilities, team, how_to_apply, engagement_length and start_date exist
 * only as a reading of the text, not as anything a board publishes.
 *
 * Those land as "Not stated", which is the same string the table uses for a
 * detail an offer genuinely omitted — so, following the precedent set by
 * `migrate` in storage.ts, every imported row carries a note saying the blanks
 * are ours rather than the offer's. Pressing "Re-run" on a row fills them in,
 * one offer's worth of model calls at a time.
 */

/** One line of the scraper's output. Mirrors its `ScrapedOffer`. */
type ScrapedLine = {
  board?: string;
  source_url?: string;
  scraped_at?: string;
  title?: string;
  company?: string;
  location?: string;
  work_mode?: string;
  salary?: string;
  contract_type?: string;
  seniority?: string;
  posted_at?: string;
  start_date?: string;
  required_skills?: unknown;
  text?: string;
};

export type ImportSummary = {
  records: JobRecord[];
  /** Lines that were not JSON, or carried no URL. */
  malformed: number;
  /** Same URL more than once in the file — the scraper appends across runs. */
  duplicatesInFile: number;
  /**
   * Offers that also sit in an existing tab. Reported, not skipped: each tab
   * mirrors the file it came from, and dropping the overlap would leave the
   * new tab a partial view of its own file. The copies are independent rows —
   * re-running one does not touch the other.
   */
  alreadyElsewhere: number;
};

const text = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value.trim() : NOT_STATED;

const isWorkMode = (value: unknown): value is WorkMode =>
  typeof value === 'string' && (workModes as readonly string[]).includes(value);

const list = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

/**
 * Explains the empty columns, and keeps the facts the board stated but the
 * record has nowhere to put — `posted_at` has no field on JobRecord.
 */
const noteFor = (line: ScrapedLine): string => {
  const parts = [`Imported from cvitae-scrapper`];

  if (line.board) parts[0] += ` (${line.board})`;

  if (line.posted_at) {
    parts.push(`Posted ${line.posted_at.slice(0, 10)}.`);
  }

  parts.push('Analysed fields are empty — re-run to fill them.');

  return parts.join('. ').replace('..', '.');
};

const toRecord = (
  line: ScrapedLine,
  locale: string,
  listId: string
): JobRecord => ({
  id: createId(),
  listId,
  status: 'new',
  notes: '',

  // Stated by the board.
  company: text(line.company),
  position: text(line.title),
  location: text(line.location),
  work_mode: isWorkMode(line.work_mode) ? line.work_mode : 'unknown',
  salary: text(line.salary),
  seniority: text(line.seniority),
  required_skills: list(line.required_skills),
  requirements: normalizeRequirements(undefined, {
    required_skills: list(line.required_skills),
    responsibilities: []
  }),

  // Passed through as the board worded it. Boards emit schema.org's
  // employmentType here (CONTRACTOR, FULL_TIME) rather than the Polish form of
  // employment the analyser produces (B2B, UoP), and translating between the
  // two would be a guess — so an imported row reads differently from an
  // analysed one until it is re-run, which is the honest result.
  contract_type: text(line.contract_type),

  // Parsed out of the offer text by the scraper, where the page prints it
  // plainly ("Start ASAP") but publishes nothing structured.
  start_date: text(line.start_date),

  // Only a reading of the text can fill these — "Analyse" does it.
  company_type: NOT_STATED,
  company_size: NOT_STATED,
  role_profile: NOT_STATED,
  engagement_length: NOT_STATED,
  ideal_candidate: NOT_STATED,
  responsibilities: [],
  team: NOT_STATED,
  how_to_apply: NOT_STATED,

  // Kept so the inferred fields can be filled later without re-fetching, and
  // so re-analysis cannot overwrite the board's own figures with the model's.
  offer_text:
    typeof line.text === 'string'
      ? normalizeOfferText(line.text) || undefined
      : undefined,
  board_facts: {
    company: line.company,
    title: line.title,
    location: line.location,
    work_mode: line.work_mode,
    salary: line.salary,
    seniority: line.seniority,
    start_date: line.start_date,
    required_skills: list(line.required_skills)
  },

  source_url: normalizeUrl(line.source_url ?? ''),
  source_mode: 'url',
  source_note: noteFor(line),
  // When the offer was collected, not when it was imported — the row is only
  // as fresh as the scrape behind it.
  checked_at: line.scraped_at ?? new Date().toISOString(),
  locale
});

/**
 * Parses JSONL into rows that are safe to add.
 *
 * Tolerant by design: the file is appended to across runs and may be
 * half-written or hand-edited, and one bad line should cost that line rather
 * than the import. Counts come back so the UI can say what was skipped instead
 * of silently dropping it.
 *
 * `existing` is every record already stored, across all tabs. It is read only
 * to count the overlap — see `alreadyElsewhere` — never to skip a row.
 */
export const parseScrapedOffers = (
  contents: string,
  existing: JobRecord[],
  locale: string,
  listId: string
): ImportSummary => {
  const known = new Set(
    existing.map((record) => normalizeUrl(record.source_url))
  );

  // Last occurrence wins: the scraper appends, so a URL appearing twice means
  // it was scraped again and the later copy is the fresher one.
  const byUrl = new Map<string, ScrapedLine>();
  let malformed = 0;
  let duplicatesInFile = 0;

  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: ScrapedLine;

    try {
      parsed = JSON.parse(trimmed) as ScrapedLine;
    } catch {
      malformed += 1;
      continue;
    }

    // A row with no URL cannot be de-duplicated or re-run, which makes it a
    // dead end in the table rather than a record.
    if (!parsed?.source_url || typeof parsed.source_url !== 'string') {
      malformed += 1;
      continue;
    }

    const url = normalizeUrl(parsed.source_url);
    if (byUrl.has(url)) duplicatesInFile += 1;
    byUrl.set(url, parsed);
  }

  let alreadyElsewhere = 0;
  const records: JobRecord[] = [];

  for (const [url, line] of byUrl) {
    if (known.has(url)) alreadyElsewhere += 1;
    records.push(toRecord(line, locale, listId));
  }

  return { records, malformed, duplicatesInFile, alreadyElsewhere };
};
