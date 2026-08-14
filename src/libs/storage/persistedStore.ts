import { idbGet, idbSet } from './idb';

/**
 * A module-level store backed by IndexedDB, read through useSyncExternalStore.
 *
 * Both feature stores had the same twenty lines of listener bookkeeping, and
 * moving off localStorage adds two genuinely subtle pieces to it — the read is
 * now asynchronous, so there is a moment where the store is empty because it
 * has not loaded rather than because nothing is saved; and the write is
 * expensive enough that it cannot follow every change. Both are worth having
 * in one place rather than two.
 *
 * The state is still stored as a single document per feature, which is what
 * makes each write proportional to everything held rather than to what
 * changed. Splitting it into a row per record is the change that would make
 * writes cheap outright; coalescing them is what keeps that from mattering
 * while it stays one document.
 *
 * The snapshot is a wrapper around the state, not the state itself, so that
 * `hydrated` travels with it: a component reading the store gets both facts
 * from the same render, and "no offers researched yet" cannot be shown to
 * someone whose offers are still on their way out of the database.
 */

export type StoreSnapshot<T> = {
  data: T;
  /**
   * False until the stored state has been read back. Distinguishes an empty
   * store from an unread one, which under localStorage never needed saying:
   * the read happened during the first render.
   */
  hydrated: boolean;
};

type PersistedStoreOptions<T> = {
  /** Key in IndexedDB, and the localStorage key migrated from. */
  key: string;
  /** A fresh, valid, empty state. */
  empty: () => T;
  /**
   * Turns whatever came back out of storage into a valid state. Must not
   * throw: it is handed hand-edited and older-schema payloads, and losing the
   * whole table to one bad field is not an acceptable answer.
   */
  parse: (stored: unknown) => T;
  /** Wraps the state for storage, typically stamping a schema version. */
  serialize: (data: T) => unknown;
};

export type PersistedStore<T> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => StoreSnapshot<T>;
  getServerSnapshot: () => StoreSnapshot<T>;
  /** The state alone, for imperative reads outside React. */
  getState: () => T;
  /**
   * Applies a change. Returning the state unchanged is how a no-op mutation
   * says so, and skips both the write and the re-render.
   */
  update: (project: (current: T) => T) => void;
};

const readLegacy = (key: string): unknown => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return undefined;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch (error) {
    console.warn(`Could not read the localStorage copy of "${key}".`, error);
    return undefined;
  }
};

const clearLegacy = (key: string) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Leaving it behind is harmless — it is only ever read when IndexedDB has
    // nothing, which it no longer does.
  }
};

export const createPersistedStore = <T>({
  key,
  empty,
  parse,
  serialize
}: PersistedStoreOptions<T>): PersistedStore<T> => {
  // One object, returned by every server-side call, because React requires
  // `getServerSnapshot` to be stable across renders.
  const serverSnapshot: StoreSnapshot<T> = { data: empty(), hydrated: false };

  let snapshot: StoreSnapshot<T> = serverSnapshot;
  const listeners = new Set<() => void>();

  let hydration: Promise<void> | null = null;

  /**
   * Writes are coalesced, because a change is not the same size as its cause.
   *
   * Every mutation here rewrites the whole document — twenty offers and their
   * stored posting text — and typing one character into an email draft is a
   * mutation. Under localStorage that cost a synchronous stringify-and-write
   * per keystroke; under IndexedDB the structured clone makes it worse, around
   * 56ms of blocked main thread on a 5.75MB document. Neither is acceptable
   * per character.
   *
   * So the write waits for a pause. The cap stops a long stretch of continuous
   * editing from never reaching storage, and hiding the page flushes
   * immediately, which is what covers closing the tab.
   */
  const WRITE_IDLE_MS = 400;
  const WRITE_MAX_WAIT_MS = 2000;

  let writeTimer: ReturnType<typeof setTimeout> | null = null;
  let unwritten = false;
  let firstUnwrittenAt = 0;

  /**
   * Changes made while the read was still in flight.
   *
   * Rare but reachable: the research page can queue an offer into the
   * submitting store before that store has finished loading. Applying them to
   * the loaded state — rather than letting the load overwrite them, or letting
   * them win over the load — is the only answer that keeps both.
   */
  const pending: ((current: T) => T)[] = [];

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const write = async () => {
    const stored = await idbSet(key, serialize(snapshot.data));
    if (stored) return;

    // No IndexedDB — a browser with it disabled, or an environment without it.
    // Falling back keeps the app exactly as persistent as it used to be.
    try {
      window.localStorage.setItem(key, JSON.stringify(serialize(snapshot.data)));
    } catch (error) {
      console.error(`Could not save "${key}".`, error);
    }
  };

  const flushWrite = () => {
    if (writeTimer !== null) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }
    if (!unwritten) return;

    unwritten = false;
    firstUnwrittenAt = 0;
    void write();
  };

  const scheduleWrite = () => {
    const now = Date.now();

    if (!unwritten) {
      unwritten = true;
      firstUnwrittenAt = now;
    }

    // Held back long enough and it goes regardless, so a run of edits with no
    // pause in it is not sitting only in memory indefinitely.
    if (now - firstUnwrittenAt >= WRITE_MAX_WAIT_MS) {
      flushWrite();
      return;
    }

    if (writeTimer !== null) clearTimeout(writeTimer);
    writeTimer = setTimeout(flushWrite, WRITE_IDLE_MS);
  };

  if (typeof document !== 'undefined') {
    // `visibilitychange` rather than `pagehide` or `beforeunload`: it fires on
    // the tab being switched away from, hidden, or closed, and it fires early
    // enough that the write is still allowed to start.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushWrite();
    });
  }

  const hydrate = async () => {
    const fromIdb = await idbGet<unknown>(key);
    const legacy = fromIdb === undefined ? readLegacy(key) : undefined;
    const stored = fromIdb ?? legacy;

    const loaded = stored === undefined ? empty() : parse(stored);

    // Replay before publishing, so no render ever sees the loaded state
    // without the changes already made to it.
    const data = pending.reduce((current, project) => project(current), loaded);
    const hadPending = pending.length > 0;
    pending.length = 0;

    snapshot = { data, hydrated: true };
    emit();

    if (legacy !== undefined) {
      // Move it across, then drop the old copy so there is one source of
      // truth. Only after the write is confirmed: a failed migration should
      // leave the data where it still is.
      const moved = await idbSet(key, serialize(data));
      if (moved) clearLegacy(key);
    } else if (hadPending) {
      scheduleWrite();
    }
  };

  const ensureHydrated = () => {
    if (!hydration) hydration = hydrate();
  };

  return {
    subscribe: (listener) => {
      ensureHydrated();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot: () => {
      ensureHydrated();
      return snapshot;
    },

    getServerSnapshot: () => serverSnapshot,

    getState: () => {
      ensureHydrated();
      return snapshot.data;
    },

    update: (project) => {
      const next = project(snapshot.data);
      if (next === snapshot.data) return;

      if (!snapshot.hydrated) {
        // Writing now would put this on top of a state that has not been read
        // yet; it is replayed onto the loaded one instead, and written then.
        pending.push(project);
      }

      snapshot = { data: next, hydrated: snapshot.hydrated };
      emit();

      if (snapshot.hydrated) scheduleWrite();
    }
  };
};
