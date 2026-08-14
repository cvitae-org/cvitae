import type {
  ApplicationStatus,
  JobRecord,
  ResearchList,
  ResearchState
} from './types';
import { MANUAL_LIST_ID } from './types';
import { createPersistedStore } from '@/libs/storage/persistedStore';
import {
  emptyState,
  parseState,
  serializeState,
  STORAGE_KEY
} from './storage';

/**
 * Module-level store over IndexedDB, read through useSyncExternalStore.
 *
 * A plain useState + useEffect hydration would set state inside an effect,
 * which this codebase's lint config rejects. useSyncExternalStore is the shape
 * React provides for exactly this: an external, mutable source read during
 * render.
 *
 * The state is the whole thing — records, tabs, and which tab is open — rather
 * than records alone, so that a tab and the offers inside it are always
 * written together. An import that added rows first and registered the tab
 * second could be interrupted between the two and leave offers in a tab that
 * does not exist.
 */

const store = createPersistedStore<ResearchState>({
  key: STORAGE_KEY,
  empty: emptyState,
  parse: parseState,
  serialize: serializeState
});

export const {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  getState: getResearchState
} = store;

const commit = store.update;

const mapRecords = (project: (records: JobRecord[]) => JobRecord[]) => {
  commit((current) => ({ ...current, records: project(current.records) }));
};

/**
 * Adds a freshly researched offer and opens the tab it landed in.
 *
 * The tab is opened because the offer is the result the user just waited on:
 * adding it to a tab they are not looking at reads as nothing having happened.
 */
export const addRecord = (record: JobRecord) => {
  commit((current) => ({
    ...current,
    records: [record, ...current.records],
    activeListId: record.listId
  }));
};

/** Replaces the row with the same id, keeping its position in the table. */
export const replaceRecord = (record: JobRecord) => {
  mapRecords((records) =>
    records.map((item) => (item.id === record.id ? record : item))
  );
};

export const patchRecord = (
  id: string,
  patch: Partial<Pick<JobRecord, 'status' | 'notes'>>
) => {
  mapRecords((records) =>
    records.map((item) => (item.id === id ? { ...item, ...patch } : item))
  );
};

export const setStatus = (id: string, status: ApplicationStatus) => {
  patchRecord(id, { status });
};

/**
 * How far along the pipeline each status sits.
 *
 * Only used to stop an automatic update from undoing something the user knows
 * and this app does not. `rejected` and `archived` share a rank because they
 * are both ends of the line, not steps towards one.
 */
const statusRank: Record<ApplicationStatus, number> = {
  new: 0,
  applied: 1,
  interview: 2,
  rejected: 3,
  archived: 3
};

/**
 * Moves a row forward, never back.
 *
 * The submitting flow writes the status of a row it does not own: sending an
 * application makes it "applied". That must not overwrite an "interview" the
 * user set by hand a week after applying, so a status already further along is
 * left where it is.
 */
export const advanceStatus = (id: string, status: ApplicationStatus) => {
  const current = getResearchState().records.find((item) => item.id === id);
  if (!current || statusRank[current.status] >= statusRank[status]) return;

  patchRecord(id, { status });
};

/**
 * Undoes a status this app set itself.
 *
 * Guarded on `expected` so that un-sending an application only rewinds a row
 * that still reads exactly what the send left there. If the user has since
 * moved it on, their value stands.
 */
export const revertStatus = (
  id: string,
  expected: ApplicationStatus,
  to: ApplicationStatus
) => {
  const current = getResearchState().records.find((item) => item.id === id);
  if (!current || current.status !== expected) return;

  patchRecord(id, { status: to });
};

export const removeRecord = (id: string) => {
  mapRecords((records) => records.filter((item) => item.id !== id));
};

/**
 * Sends a row to the bottom of its tab.
 *
 * Queueing an offer for submission does not remove it from research — it is
 * still the record of an offer that exists, and its status is still worth
 * tracking — but it is no longer something to triage, so it moves out of the
 * way of the offers that are.
 */
export const moveRecordToEnd = (id: string) => {
  commit((current) => {
    const index = current.records.findIndex((item) => item.id === id);
    // Already last, or gone. Returning the state untouched is how the store is
    // told there is nothing to write and nothing to re-render.
    if (index < 0 || index === current.records.length - 1) return current;

    const records = [...current.records];
    const [record] = records.splice(index, 1);
    return { ...current, records: [...records, record] };
  });
};

/** Empties one tab without closing it. */
export const clearList = (listId: string) => {
  mapRecords((records) => records.filter((item) => item.listId !== listId));
};

/**
 * Adds an imported file as its own tab and opens it.
 *
 * One change for the whole file: an import is twenty rows arriving together,
 * and a tab is only meaningful with its offers in it. Storing them separately
 * could be interrupted between the two.
 */
export const addImportedList = (list: ResearchList, records: JobRecord[]) => {
  commit((current) => ({
    records: [...records, ...current.records],
    lists: [...current.lists, list],
    activeListId: list.id
  }));
};

export const setActiveList = (listId: string) => {
  commit((current) =>
    current.activeListId === listId
      ? current
      : { ...current, activeListId: listId }
  );
};

export const renameList = (listId: string, name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return;

  commit((current) => ({
    ...current,
    lists: current.lists.map((list) =>
      list.id === listId ? { ...list, name: trimmed } : list
    )
  }));
};

/**
 * Closes a tab and deletes the offers in it — a tab is a partition, so there
 * is nowhere for its rows to go. The fallback tab cannot be closed; it is
 * where URL research lands when nothing else is open.
 */
export const removeList = (listId: string) => {
  if (listId === MANUAL_LIST_ID) return;

  commit((current) => ({
    records: current.records.filter((item) => item.listId !== listId),
    lists: current.lists.filter((list) => list.id !== listId),
    activeListId:
      current.activeListId === listId ? MANUAL_LIST_ID : current.activeListId
  }));
};

/**
 * Importing the same file twice is a real thing to do — a second scrape of the
 * same board — and two tabs reading `justjoin-backend` would be indistinguishable.
 */
export const uniqueListName = (name: string): string => {
  const taken = new Set(getResearchState().lists.map((list) => list.name));
  if (!taken.has(name)) return name;

  let suffix = 2;
  while (taken.has(`${name} (${suffix})`)) suffix += 1;
  return `${name} (${suffix})`;
};
