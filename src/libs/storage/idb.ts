/**
 * A key/value corner of IndexedDB.
 *
 * The reason is quota, and only quota. An imported scraper run keeps the full
 * text of every posting — that is what lets a row be re-analysed after the
 * board has taken it down — and thirty offers of it is around 6MB. Chromium
 * now lets localStorage draw on the origin's whole storage budget and will
 * take that happily (measured: 24MB accepted in this browser), but Firefox and
 * Safari still cap localStorage at about 5MB per origin. One scraper import is
 * enough to hit that, and the failure mode is a QuotaExceededError thrown
 * halfway through.
 *
 * It is worth being exact about what this does *not* buy, because the obvious
 * assumption is wrong: IndexedDB writes are not free of the main thread.
 * `put()` structure-clones its value synchronously before the transaction goes
 * anywhere, and on a 5.75MB document that measured ~56ms against ~12ms for
 * `JSON.stringify` plus `localStorage.setItem`. Moving here made whole-document
 * writes roughly five times more expensive, not less — which is why
 * `persistedStore` no longer performs one on every change.
 *
 * Deliberately not a general IndexedDB wrapper: one object store, whole
 * documents in and out, keyed by name. The querying and indexing that make
 * IndexedDB awkward are not wanted here.
 */

const DB_NAME = 'cvitae';
const DB_VERSION = 1;
const STORE_NAME = 'state';

/**
 * Resolves to null rather than rejecting when IndexedDB cannot be used —
 * server rendering, or a browser that has it disabled. Callers fall back to
 * localStorage, so the feature degrades to what it was before rather than
 * losing persistence altogether.
 */
let databasePromise: Promise<IDBDatabase | null> | null = null;

const openDatabase = (): Promise<IDBDatabase | null> => {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => resolve(request.result);

      request.onerror = () => {
        console.warn('IndexedDB is unavailable; falling back to localStorage.', request.error);
        resolve(null);
      };

      // Fires when another tab holds an old version open. Nothing to upgrade
      // past version 1, but resolving null is better than hanging forever on a
      // promise that will never settle.
      request.onblocked = () => resolve(null);
    } catch (error) {
      console.warn('IndexedDB could not be opened; falling back to localStorage.', error);
      resolve(null);
    }
  });

  return databasePromise;
};

export const isIdbAvailable = async (): Promise<boolean> =>
  (await openDatabase()) !== null;

/**
 * Reads one document. `undefined` means "nothing stored under that key",
 * which is what tells a first run apart from an empty saved state.
 */
export const idbGet = async <T>(key: string): Promise<T | undefined> => {
  const db = await openDatabase();
  if (!db) return undefined;

  return new Promise((resolve) => {
    try {
      const request = db
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(key);

      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => {
        console.error(`Could not read "${key}" from IndexedDB.`, request.error);
        resolve(undefined);
      };
    } catch (error) {
      console.error(`Could not read "${key}" from IndexedDB.`, error);
      resolve(undefined);
    }
  });
};

/**
 * Writes one document, reporting whether it landed.
 *
 * Resolves on the transaction completing rather than on the request
 * succeeding: a request can succeed inside a transaction that then fails to
 * commit, and the difference is exactly the quota error worth knowing about.
 *
 * The value is stored as a live object rather than a JSON string, so nothing
 * has to be re-parsed on the way back in. That is a saving on read; on write
 * the structured clone costs more than `JSON.stringify` did, so callers should
 * not treat this as cheap.
 */
export const idbSet = async (key: string, value: unknown): Promise<boolean> => {
  const db = await openDatabase();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(value, key);

      transaction.oncomplete = () => resolve(true);
      transaction.onabort = transaction.onerror = () => {
        console.error(`Could not save "${key}" to IndexedDB.`, transaction.error);
        resolve(false);
      };
    } catch (error) {
      console.error(`Could not save "${key}" to IndexedDB.`, error);
      resolve(false);
    }
  });
};
