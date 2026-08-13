import type { JobRecord, WorkMode } from './types';
import { isApplicationStatus, NOT_STATED, workModes } from './types';

/**
 * localStorage persistence for researched offers.
 *
 * The payload is versioned so a future schema change can migrate rather than
 * silently reading stale shapes. Reads are defensive: a corrupt or hand-edited
 * entry is dropped instead of crashing the table.
 */

// The key is a namespace, not the schema marker — renaming it would orphan
// every record already in the browser. `version` inside the payload is what
// decides whether a stored shape needs migrating.
const STORAGE_KEY = 'cvitae.job-research.v1';
const STORAGE_VERSION = 2;

type StoredPayload = {
  version: number;
  records: JobRecord[];
};

export const canUseStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

/** Trailing slashes and tracking params should not create duplicate rows. */
export const normalizeUrl = (raw: string): string => {
  try {
    const url = new URL(raw);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith('utm_') || key === 'ref' || key === 'source') {
        url.searchParams.delete(key);
      }
    }
    const normalized = url.toString();
    return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  } catch {
    return raw.trim();
  }
};

/**
 * Only proves a row is identifiable — it deliberately does not check the
 * analysis fields, so that a record written by an older schema is migrated
 * rather than thrown away. `migrate` is what makes the shape whole.
 */
const isRecord = (value: unknown): value is JobRecord => {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Partial<JobRecord>;
  return (
    typeof r.id === 'string' &&
    typeof r.company === 'string' &&
    typeof r.position === 'string' &&
    isApplicationStatus(r.status)
  );
};

const isWorkMode = (value: unknown): value is WorkMode =>
  typeof value === 'string' && (workModes as readonly string[]).includes(value);

/** Stamped on migrated rows: their blanks are our gap, not the offer's. */
const LEGACY_NOTE =
  'Researched before the current fields existed — re-run to fill the gaps.';

/**
 * Brings a version 1 record up to the current shape.
 *
 * Version 1 was written while the analysis also scored fit: those records carry
 * fields that no longer exist (fit_score, verdict, matched_skills) and are
 * missing every field added since (contract_type, role_profile,
 * responsibilities, …). They still satisfy `isRecord`, so without this they
 * render as a row of blanks — indistinguishable from an offer that genuinely
 * stated nothing, and the source of a `Math.round(undefined)` NaN when a
 * component still read a dropped field.
 *
 * Gaps are filled rather than dropped, so the row keeps its salary, status and
 * notes; "Re-run" refills the rest from the posting.
 */
const migrate = (stored: JobRecord): JobRecord => {
  // isRecord only vouches for id/company/position/status; everything else has
  // to be read as unknown, because a v1 record simply will not have it.
  const raw = stored as unknown as Record<string, unknown>;

  const text = (key: keyof JobRecord): string => {
    const value = raw[key];
    return typeof value === 'string' && value.trim() !== '' ? value : NOT_STATED;
  };

  const list = (key: keyof JobRecord): string[] => {
    const value = raw[key];
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  };

  const plain = (key: keyof JobRecord): string =>
    typeof raw[key] === 'string' ? (raw[key] as string) : '';

  return {
    id: stored.id,
    status: stored.status,
    company: text('company'),
    company_type: text('company_type'),
    company_size: text('company_size'),
    position: text('position'),
    role_profile: text('role_profile'),
    seniority: text('seniority'),
    location: text('location'),
    work_mode: isWorkMode(raw.work_mode) ? raw.work_mode : 'unknown',
    salary: text('salary'),
    contract_type: text('contract_type'),
    engagement_length: text('engagement_length'),
    start_date: text('start_date'),
    ideal_candidate: text('ideal_candidate'),
    responsibilities: list('responsibilities'),
    team: text('team'),
    how_to_apply: text('how_to_apply'),
    required_skills: list('required_skills'),
    source_url: plain('source_url'),
    source_mode: raw.source_mode === 'manual' ? 'manual' : 'url',
    source_note: [plain('source_note'), LEGACY_NOTE].filter(Boolean).join(' '),
    checked_at: plain('checked_at'),
    locale: plain('locale') || 'en',
    notes: plain('notes')
  };
};

export const loadRecords = (): JobRecord[] => {
  if (!canUseStorage()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as StoredPayload;
    if (!parsed || !Array.isArray(parsed.records)) return [];

    // Drop anything that is not even identifiable; migrate the rest, since an
    // older payload version means every record in it predates the current shape.
    const stale = parsed.version !== STORAGE_VERSION;
    const records = parsed.records.filter(isRecord);
    return stale ? records.map(migrate) : records;
  } catch (error) {
    console.warn('Could not read stored job research; starting empty.', error);
    return [];
  }
};

export const saveRecords = (records: JobRecord[]): boolean => {
  if (!canUseStorage()) return false;

  try {
    const payload: StoredPayload = { version: STORAGE_VERSION, records };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (error) {
    // Quota exceeded is the realistic failure here; the caller surfaces it.
    console.error('Could not save job research.', error);
    return false;
  }
};

export const findByUrl = (
  records: JobRecord[],
  url: string
): JobRecord | undefined => {
  const target = normalizeUrl(url);
  return records.find((record) => normalizeUrl(record.source_url) === target);
};

export const createId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** CSV export so the table can leave the browser it is trapped in. */
export const toCsv = (records: JobRecord[]): string => {
  const columns: (keyof JobRecord)[] = [
    'checked_at',
    'company',
    'company_type',
    'company_size',
    'position',
    'role_profile',
    'seniority',
    'location',
    'work_mode',
    'salary',
    'contract_type',
    'engagement_length',
    'start_date',
    'team',
    'ideal_candidate',
    'responsibilities',
    'required_skills',
    'status',
    'source_url',
    'notes'
  ];

  const escape = (value: unknown): string => {
    const text = Array.isArray(value) ? value.join('; ') : String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  };

  return [
    columns.join(','),
    ...records.map((record) =>
      columns.map((column) => escape(record[column])).join(',')
    )
  ].join('\n');
};
