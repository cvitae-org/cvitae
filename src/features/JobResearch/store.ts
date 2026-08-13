import type { ApplicationStatus, JobRecord } from './types';
import { loadRecords, saveRecords } from './storage';

/**
 * Module-level store over localStorage, read through useSyncExternalStore.
 *
 * A plain useState + useEffect hydration would set state inside an effect,
 * which this codebase's lint config rejects (and which flashes empty content on
 * first paint). useSyncExternalStore is the shape React provides for exactly
 * this: an external, mutable source read during render.
 */

let records: JobRecord[] | null = null;
const listeners = new Set<() => void>();

/** Stable identity for the server/first-render snapshot. */
const EMPTY: JobRecord[] = [];

const emit = () => {
  for (const listener of listeners) listener();
};

const commit = (next: JobRecord[]) => {
  records = next;
  saveRecords(next);
  emit();
};

export const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getSnapshot = (): JobRecord[] => {
  // Lazily hydrate on first read; the cached array keeps the snapshot stable
  // between renders, which useSyncExternalStore requires.
  if (records === null) {
    records = loadRecords();
  }
  return records;
};

export const getServerSnapshot = (): JobRecord[] => EMPTY;

export const addRecord = (record: JobRecord) => {
  commit([record, ...getSnapshot()]);
};

/** Replaces the row with the same id, keeping its position in the table. */
export const replaceRecord = (record: JobRecord) => {
  commit(getSnapshot().map((item) => (item.id === record.id ? record : item)));
};

export const patchRecord = (
  id: string,
  patch: Partial<Pick<JobRecord, 'status' | 'notes'>>
) => {
  commit(
    getSnapshot().map((item) => (item.id === id ? { ...item, ...patch } : item))
  );
};

export const setStatus = (id: string, status: ApplicationStatus) => {
  patchRecord(id, { status });
};

export const removeRecord = (id: string) => {
  commit(getSnapshot().filter((item) => item.id !== id));
};

export const clearRecords = () => {
  commit([]);
};
