import type { JobRecord, WorkMode } from './types';
import { NOT_STATED, workModes } from './types';
import { createId, normalizeUrl } from './storage';
import { normalizeOfferText, normalizeRequirements } from './requirements';

/**
 * Reads a JSONL file of offers into table rows.
 *
 * One file becomes one tab, so every row here is stamped with the same
 * `listId` and a batch can be read on its own rather than dissolving into
 * everything collected before it.
 *
 * An import costs nothing and needs no model, because whoever wrote the file
 * has already done the expensive half — found the posting and kept its text.
 * What a file cannot supply is the analysed half: company_type, role_profile,
 * ideal_candidate, responsibilities, team, how_to_apply and engagement_length
 * exist only as a reading of the posting, not as anything worth asking a person
 * to type twice.
 *
 * Those land as "Not stated", which is the same string the table uses for a
 * detail an offer genuinely omitted — so, following the precedent set by
 * `migrate` in storage.ts, every imported row carries a note saying the blanks
 * are ours rather than the offer's. Pressing "Analyse" on a row fills them in
 * from the retained text, one offer's worth of model calls at a time.
 *
 * The accepted keys are documented to the user in `ImportOffers`; that list and
 * this type are the same contract written twice, and they must move together.
 */

/** One line of the file. Every key is optional except `source_url`. */
type ImportedLine = {
  board?: string;
  source_url?: string;
  collected_at?: string;
  /**
   * The name `collected_at` used to have. Still read, and deliberately not
   * documented: files written against the old name must keep importing, and
   * nobody writing a new one should be told to reach for it.
   */
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
  /** Same URL more than once in the file. The last copy is the one kept. */
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
 * Explains the empty columns, and keeps the facts the file stated but the
 * record has nowhere to put — `posted_at` and `board` have no field on
 * JobRecord, and dropping them would lose the only provenance the row has.
 */
const noteFor = (line: ImportedLine): string => {
  const parts = [
    line.board ? `Imported from ${line.board}` : 'Imported from a file'
  ];

  if (line.posted_at) {
    parts.push(`Posted ${line.posted_at.slice(0, 10)}.`);
  }

  parts.push('Analysed fields are empty — run Analyse to fill them.');

  return parts.join('. ').replace('..', '.');
};

const toRecord = (
  line: ImportedLine,
  locale: string,
  listId: string
): JobRecord => ({
  id: createId(),
  listId,
  status: 'new',
  notes: '',

  // Taken straight from the file.
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

  // Passed through exactly as written. A file may carry schema.org's
  // employmentType (CONTRACTOR, FULL_TIME) where the analyser produces the
  // Polish form of employment (B2B, UoP), and translating between the two would
  // be a guess — so an imported row reads differently from an analysed one
  // until it is analysed, which is the honest result.
  contract_type: text(line.contract_type),

  // Free text rather than a date: postings print this plainly ("Start ASAP",
  // "od zaraz") and publish nothing structured, so parsing it would only ever
  // be a guess at what the words meant.
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
  // so analysis cannot overwrite the stated figures with the model's.
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
  // as fresh as the reading behind it.
  checked_at: line.collected_at ?? line.scraped_at ?? new Date().toISOString(),
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
export const parseImportedOffers = (
  contents: string,
  existing: JobRecord[],
  locale: string,
  listId: string
): ImportSummary => {
  const known = new Set(
    existing.map((record) => normalizeUrl(record.source_url))
  );

  // Last occurrence wins: a file is typically appended to over time, so a URL
  // appearing twice means it was collected again and the later copy is fresher.
  const byUrl = new Map<string, ImportedLine>();
  let malformed = 0;
  let duplicatesInFile = 0;

  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: ImportedLine;

    try {
      parsed = JSON.parse(trimmed) as ImportedLine;
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
