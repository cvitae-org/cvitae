import type { JobRecord, ResearchList, ResearchState, WorkMode } from './types';
import {
  isApplicationStatus,
  MANUAL_LIST_ID,
  MANUAL_LIST_NAME,
  NOT_STATED,
  workModes
} from './types';
import {
  normalizeOfferText,
  normalizeRequirements
} from './requirements';

/**
 * Reading and writing the shape of researched offers.
 *
 * Where it is kept — IndexedDB, having been moved off localStorage — belongs
 * to `createPersistedStore`; this file only decides what a stored payload
 * means. The payload is versioned so a future schema change can migrate rather
 * than silently reading stale shapes, and reads are defensive: a corrupt or
 * hand-edited entry is dropped instead of crashing the table.
 */

// The key is a namespace, not the schema marker — renaming it would orphan
// every record already in the browser, and it is also the localStorage key the
// data is migrated out of. `version` inside the payload is what decides
// whether a stored shape needs migrating.
export const STORAGE_KEY = 'cvitae.job-research.v1';
export const STORAGE_VERSION = 4;

type StoredPayload = {
  version: number;
  records: JobRecord[];
  /** Absent before version 3, when every record lived in one flat table. */
  lists?: ResearchList[];
  activeListId?: string;
};

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

const isList = (value: unknown): value is ResearchList => {
  if (typeof value !== 'object' || value === null) return false;
  const list = value as Partial<ResearchList>;
  return typeof list.id === 'string' && typeof list.name === 'string';
};

/**
 * The fallback tab.
 *
 * Built fresh on each call so no caller can mutate a shared object, and dated
 * to the epoch because it genuinely does precede every tab the user makes —
 * which keeps it first when the strip is ordered by age.
 */
export const createManualList = (): ResearchList => ({
  id: MANUAL_LIST_ID,
  name: MANUAL_LIST_NAME,
  createdAt: new Date(0).toISOString()
});

/** Guarantees the fallback tab exists and leads the strip. */
const withManualFirst = (lists: ResearchList[]): ResearchList[] => {
  const manual =
    lists.find((list) => list.id === MANUAL_LIST_ID) ?? createManualList();
  return [manual, ...lists.filter((list) => list.id !== MANUAL_LIST_ID)];
};

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
    listId: MANUAL_LIST_ID,
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
    requirements: normalizeRequirements(raw.requirements, {
      required_skills: list('required_skills'),
      responsibilities: list('responsibilities')
    }),
    source_url: plain('source_url'),
    source_mode: raw.source_mode === 'manual' ? 'manual' : 'url',
    source_note: [plain('source_note'), LEGACY_NOTE].filter(Boolean).join(' '),
    checked_at: plain('checked_at'),
    locale: plain('locale') || 'en',
    notes: plain('notes'),
    offer_text: normalizeOfferText(plain('offer_text')) || undefined
  };
};

/** Adds v4's retained text and cited requirements without disturbing a row. */
const normalizeCurrentRecord = (stored: JobRecord): JobRecord => {
  const raw = stored as unknown as Record<string, unknown>;
  return {
    ...stored,
    offer_text:
      typeof raw.offer_text === 'string'
        ? normalizeOfferText(raw.offer_text) || undefined
        : undefined,
    requirements: normalizeRequirements(raw.requirements, {
      required_skills: Array.isArray(raw.required_skills)
        ? raw.required_skills.filter(
            (value): value is string => typeof value === 'string'
          )
        : [],
      responsibilities: Array.isArray(raw.responsibilities)
        ? raw.responsibilities.filter(
            (value): value is string => typeof value === 'string'
          )
        : []
    })
  };
};

export const emptyState = (): ResearchState => ({
  records: [],
  lists: [createManualList()],
  activeListId: MANUAL_LIST_ID
});

/**
 * Turns a stored payload into a state the table can render.
 *
 * Takes the parsed value rather than reading it: under IndexedDB the payload
 * comes back as a structured clone with no JSON step, and the same function
 * still has to cope with the `JSON.parse` result of a localStorage payload
 * being migrated across.
 */
export const parseState = (stored: unknown): ResearchState => {
  try {
    const parsed = stored as StoredPayload;
    if (!parsed || !Array.isArray(parsed.records)) return emptyState();

    const version =
      typeof parsed.version === 'number' ? parsed.version : 1;

    // Drop anything that is not even identifiable, then migrate only what
    // actually predates the current record shape. The check is `< 2` rather
    // than `!== STORAGE_VERSION`: version 3 changed the payload around the
    // records, not the records themselves, and running `migrate` over a
    // version 2 record would stamp it with the legacy note and throw away the
    // stored offer text that "Analyse" depends on.
    const identified = parsed.records.filter(isRecord);
    const records = (version < 2 ? identified.map(migrate) : identified).map(
      normalizeCurrentRecord
    );

    const lists = withManualFirst(
      Array.isArray(parsed.lists) ? parsed.lists.filter(isList) : []
    );
    const known = new Set(lists.map((list) => list.id));

    // Version 2 and earlier had no tabs at all, and a hand-edited payload can
    // point a record at a tab that is gone. Either way the offer belongs
    // somewhere visible rather than in a tab nobody can open.
    const placed = records.map((record) =>
      known.has(record.listId) ? record : { ...record, listId: MANUAL_LIST_ID }
    );

    const activeListId =
      typeof parsed.activeListId === 'string' && known.has(parsed.activeListId)
        ? parsed.activeListId
        : MANUAL_LIST_ID;

    return { records: placed, lists, activeListId };
  } catch (error) {
    console.warn('Could not read stored job research; starting empty.', error);
    return emptyState();
  }
};

export const serializeState = (state: ResearchState): StoredPayload => ({
  version: STORAGE_VERSION,
  ...state
});

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
    'requirements',
    'status',
    'source_url',
    'notes'
  ];

  const escape = (value: unknown): string => {
    const text = Array.isArray(value)
      ? value
          .map((item) =>
            typeof item === 'string' ? item : JSON.stringify(item)
          )
          .join('; ')
      : String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  };

  return [
    columns.join(','),
    ...records.map((record) =>
      columns.map((column) => escape(record[column])).join(',')
    )
  ].join('\n');
};
