/**
 * Filtering and sorting for the research table.
 *
 * Kept out of the component because the interesting part is not the UI: it is
 * deciding what "sort by salary" means when a third of the rows are quoted per
 * hour, another third per month, and a fifth state no salary at all.
 *
 * Everything here works on the board-stated fields, which are the ones that
 * arrive filled on an imported row. The analysed fields (role_profile,
 * ideal_candidate, team) are empty until a row is re-run, so filtering on them
 * would hide offers for the accident of not having been analysed yet.
 */

import type { ApplicationStatus, JobRecord, WorkMode } from './types';
import { NOT_STATED } from './types';

/** The two strings the analysis uses for "the offer did not say". */
export const isStated = (value?: string): boolean =>
  Boolean(value) && value !== NOT_STATED && value !== 'Unknown';

/* -------------------------------------------------------------------------- */
/* Salary                                                                     */
/* -------------------------------------------------------------------------- */

export type SalaryPeriod = 'hour' | 'day' | 'month' | 'year';

export type ParsedSalary = {
  min: number;
  max: number;
  currency: string;
  period: SalaryPeriod;
  /** True when no period was written and `period` is the assumed default. */
  periodAssumed: boolean;
  /**
   * `min` normalised to PLN per month, for ordering only — never for display.
   * Null when the figure cannot be compared: a non-PLN salary, since converting
   * it would mean hard-coding an exchange rate that silently goes stale.
   */
  monthly: number | null;
};

/**
 * Hours and days per month used to bring rates onto one scale.
 *
 * 168 is the Polish B2B convention (8h × 21 working days) and is what the rate
 * in an offer is understood to mean. It is an approximation either way — the
 * point is to order 90 PLN/hour above 12 000 PLN/month, not to predict an
 * invoice.
 */
const HOURS_PER_MONTH = 168;
const DAYS_PER_MONTH = 21;

const PERIOD_PATTERNS: ReadonlyArray<[RegExp, SalaryPeriod]> = [
  [/hour|hr\b|godz/i, 'hour'],
  [/\bday\b|dzie/i, 'day'],
  [/month|mies/i, 'month'],
  [/year|annum|rok/i, 'year']
];

/**
 * Reads one number out of a salary string.
 *
 * Thousands are separated by a space and never by a period: "25 000 PLN/month"
 * on both boards checked, while every period in the data is a real decimal
 * point — "4468.32 PLN month", "141.49125 PLN hour", which is what a converted
 * or derived rate looks like. Treating a period before three digits as a
 * thousands separator (the usual European reading) turned "167.958 PLN/hour"
 * into 167958 — 28 million a month — and was wrong on ten rows and right on
 * none. Spaces come out; periods and commas stay decimal.
 */
const toNumber = (token: string): number =>
  Number(token.replace(/[\s\u00A0\u202F]/g, '').replace(',', '.'));

const toMonthly = (amount: number, period: SalaryPeriod): number => {
  if (period === 'hour') return amount * HOURS_PER_MONTH;
  if (period === 'day') return amount * DAYS_PER_MONTH;
  if (period === 'year') return amount / 12;
  return amount;
};

/**
 * Parses a board salary string into something comparable.
 *
 * Deliberately tolerant: the boards write ranges as "90 – 120", "16.800–25.200"
 * and "8 500 - 13 500", and attach the period as "/month", " month" or not at
 * all. A string this cannot read returns null and the row sorts as unstated,
 * which is the same place it would sit if the offer had said nothing.
 */
export const parseSalary = (raw?: string): ParsedSalary | null => {
  if (!isStated(raw) || !raw) return null;

  const text = raw.replace(/[  ]/g, ' ');

  // The contract form is written into the salary — "90 – 120 PLN/hour (B2B)" —
  // and the 2 in "B2B" is a digit sitting next to the range. Read literally it
  // becomes the floor of every hourly offer, which normalised most of the board
  // to 336 PLN/month. Parentheses only ever carry the contract form on these
  // boards, so dropping them costs nothing.
  const figures = text.replace(/\([^)]*\)/g, ' ').replace(/\bB2B\b/gi, ' ');

  // Numbers, allowing internal spaces/periods/commas as group separators.
  const numbers = [...figures.matchAll(/\d[\d\s., ]*\d|\d/g)]
    .map((match) => toNumber(match[0]))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!numbers.length) return null;

  const currency = /\b(PLN|EUR|USD|GBP|CHF)\b/i.exec(text)?.[1]?.toUpperCase() ?? 'PLN';

  const matched = PERIOD_PATTERNS.find(([pattern]) => pattern.test(text));
  // Monthly is both the most common written period and the one a bare figure
  // almost always means, so it is the assumption when none is stated.
  const period = matched?.[1] ?? 'month';

  const min = Math.min(...numbers);
  const max = Math.max(...numbers);

  return {
    min,
    max,
    currency,
    period,
    periodAssumed: !matched,
    monthly: currency === 'PLN' ? toMonthly(min, period) : null
  };
};

/* -------------------------------------------------------------------------- */
/* Filtering                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Whether the model has read this offer, as opposed to the board describing it.
 *
 * `role_profile` is the test because it is the field a board never publishes
 * and only a reading of the text produces. `company` and `salary` arrive filled
 * from the scrape, so neither tells an analysed row from an imported one.
 *
 * Lives here rather than inline in the page because three places now ask the
 * same question — the batch count, the filter, and the row's own marker — and
 * they must not be able to disagree about what "analysed" means.
 */
export const isAnalysed = (record: JobRecord): boolean =>
  isStated(record.role_profile);

/** Analysable means there is stored text to read; researched rows have none. */
export const isAnalysable = (record: JobRecord): boolean =>
  !isAnalysed(record) && Boolean(record.offer_text?.trim());

export type Analysis = 'all' | 'analysed' | 'unanalysed';

export type Filters = {
  /** Free text, AND across whitespace-separated terms. */
  query: string;
  /** Hides rows whose salary the board did not state. */
  salaryOnly: boolean;
  /** Empty means "no constraint", not "match nothing". */
  contractTypes: string[];
  workModes: WorkMode[];
  statuses: ApplicationStatus[];
  /**
   * Separates rows the model has read from rows it has not.
   *
   * Three states rather than a boolean: a tab of a thousand imported offers is
   * worked through by looking at what is left, and reviewed by looking at what
   * is done, and neither is served by a toggle that can only hide half of it.
   */
  analysis: Analysis;
};

export const emptyFilters: Filters = {
  query: '',
  salaryOnly: false,
  contractTypes: [],
  workModes: [],
  statuses: [],
  analysis: 'all'
};

export const countActiveFilters = (filters: Filters): number =>
  (filters.query.trim() ? 1 : 0) +
  (filters.salaryOnly ? 1 : 0) +
  (filters.analysis === 'all' ? 0 : 1) +
  filters.contractTypes.length +
  filters.workModes.length +
  filters.statuses.length;

/**
 * The text a free-text search looks at.
 *
 * Skills are included because that is how a stack search is phrased ("kotlin"),
 * and they are one of the few list fields a board fills. Notes are included so
 * a row can be found by something the user wrote on it themselves.
 */
const haystack = (record: JobRecord): string =>
  [
    record.position,
    record.company,
    record.location,
    record.role_profile,
    record.notes,
    ...(record.required_skills ?? []),
    ...(record.requirements ?? []).flatMap((requirement) => [
      requirement.exactText,
      requirement.sourceQuote
    ])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

export const applyFilters = (
  records: JobRecord[],
  filters: Filters
): JobRecord[] => {
  const terms = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return records.filter((record) => {
    if (filters.salaryOnly && !isStated(record.salary)) return false;

    if (filters.analysis !== 'all' && isAnalysed(record) !== (filters.analysis === 'analysed')) {
      return false;
    }

    if (
      filters.contractTypes.length &&
      !filters.contractTypes.includes(record.contract_type)
    ) {
      return false;
    }

    if (filters.workModes.length && !filters.workModes.includes(record.work_mode)) {
      return false;
    }

    if (filters.statuses.length && !filters.statuses.includes(record.status)) {
      return false;
    }

    if (terms.length) {
      const text = haystack(record);
      if (!terms.every((term) => text.includes(term))) return false;
    }

    return true;
  });
};

/* -------------------------------------------------------------------------- */
/* Sorting                                                                    */
/* -------------------------------------------------------------------------- */

export const sortKeys = [
  'added',
  'salary',
  'company',
  'position',
  'status',
  'checked'
] as const;
export type SortKey = (typeof sortKeys)[number];
export type SortDirection = 'asc' | 'desc';

export type Sort = { key: SortKey; direction: SortDirection };

/** Insertion order, newest first — how the table behaved before sorting existed. */
export const defaultSort: Sort = { key: 'added', direction: 'desc' };

export const sortLabels: Record<SortKey, string> = {
  added: 'Added',
  salary: 'Salary',
  company: 'Company',
  position: 'Position',
  status: 'Status',
  checked: 'Last checked'
};

/** Pipeline order, so sorting by status walks the funnel rather than the alphabet. */
const statusOrder: Record<ApplicationStatus, number> = {
  new: 0,
  applied: 1,
  interview: 2,
  rejected: 3,
  archived: 4
};

const compareText = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { sensitivity: 'base' });

/**
 * The value a row sorts on. Null means "nothing known", which sorts last.
 *
 * Computed once per row rather than inside the comparator. Sorting is O(n log
 * n) comparisons, so parsing a salary there costs ~21 000 regex passes over a
 * thousand-row tab instead of a thousand — measured at 383ms per sort, enough
 * to be felt on every click.
 */
const sortValue = (
  record: JobRecord,
  key: SortKey
): number | string | null => {
  switch (key) {
    case 'salary':
      return parseSalary(record.salary)?.monthly ?? null;
    case 'company':
      return record.company;
    case 'position':
      return record.position;
    case 'status':
      return statusOrder[record.status];
    case 'checked':
      return Date.parse(record.checked_at);
    case 'added':
      return null;
  }
};

export const sortRecords = (records: JobRecord[], sort: Sort): JobRecord[] => {
  const factor = sort.direction === 'asc' ? 1 : -1;

  // Decorated with the original index so every comparator is stable: rows that
  // tie (and on `salary`, the many rows that are all unstated) keep the order
  // they arrived in rather than shuffling on each render.
  const decorated = records.map((record, index) => ({
    record,
    index,
    value: sortValue(record, sort.key)
  }));

  decorated.sort((a, b) => {
    // The array is already newest-first, so position *is* recency and there is
    // no value to compare.
    if (sort.key === 'added') return (b.index - a.index) * factor;

    // A row with nothing to compare sinks to the bottom in both directions. An
    // offer with no stated salary is not "the lowest paid" — nothing is known
    // about it — and burying the 511 real figures under 559 blanks whenever the
    // sort runs ascending would make the sort useless.
    if (a.value === null && b.value === null) return a.index - b.index;
    if (a.value === null) return 1;
    if (b.value === null) return -1;

    const result =
      typeof a.value === 'string' && typeof b.value === 'string'
        ? compareText(a.value, b.value)
        : (a.value as number) - (b.value as number);

    return result !== 0 ? result * factor : a.index - b.index;
  });

  return decorated.map((entry) => entry.record);
};

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

export type FacetOption<T extends string> = { value: T; count: number };

/**
 * Builds the filter choices from the rows themselves rather than a fixed list.
 *
 * Necessary for contract_type, which carries two vocabularies at once: boards
 * emit schema.org's employmentType (FULL_TIME, INTERN) while the analyser
 * produces the Polish form (B2B, UoP, zlecenie), and a row has whichever its
 * source supplied. A hard-coded list would be wrong for half the table.
 *
 * Ordered by frequency, so the values worth clicking are first.
 */
const facet = <T extends string>(values: T[]): FacetOption<T>[] => {
  const counts = new Map<T, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || compareText(a.value, b.value));
};

export type FacetOptions = {
  contractTypes: FacetOption<string>[];
  workModes: FacetOption<WorkMode>[];
  statuses: FacetOption<ApplicationStatus>[];
  withSalary: number;
  analysed: number;
  unanalysed: number;
};

export const buildFacets = (records: JobRecord[]): FacetOptions => ({
  analysed: records.filter(isAnalysed).length,
  unanalysed: records.filter((record) => !isAnalysed(record)).length,
  contractTypes: facet(
    records.map((record) => record.contract_type).filter(isStated) as string[]
  ),
  workModes: facet(records.map((record) => record.work_mode)),
  statuses: facet(records.map((record) => record.status)),
  withSalary: records.filter((record) => isStated(record.salary)).length
});

/** Adds or removes one value from a multi-select filter. */
export const toggleValue = <T extends string>(values: T[], value: T): T[] =>
  values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
