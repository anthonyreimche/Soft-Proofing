// Profiles' bytes in IndexedDB, which every window of the app shares.

import type { ProfileBytes } from "./library";

const DB_NAME = "safelight-soft-proofing";
const DB_VERSION = 1;
const STORE = "profiles";

/** IndexedDB, opened when first used. Every call rejects where there is none
 *  or it won't open; a failed open is tried again on the next call. */
export function indexedDbBytes(factory: () => IDBFactory | undefined = () => globalThis.indexedDB): ProfileBytes {
  let opened: Promise<IDBDatabase> | null = null;

  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const idb = factory();
      if (!idb) return reject(new Error("IndexedDB isn't available"));
      const req = idb.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => {
        const d = req.result;
        d.onversionchange = () => {
          d.close();
          opened = null;
        };
        resolve(d);
      };
      req.onerror = () => reject(req.error ?? new Error("the profile store couldn't be opened"));
    });

  const db = () => {
    opened ??= open().catch((err: unknown) => {
      opened = null;
      throw err;
    });
    return opened;
  };

  function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest | void): Promise<T | null> {
    return db().then(
      (d) =>
        new Promise<T | null>((resolve, reject) => {
          const tx = d.transaction(STORE, mode);
          const req = work(tx.objectStore(STORE));
          tx.oncomplete = () => resolve((req?.result as T | undefined) ?? null);
          tx.onerror = () => reject(tx.error ?? new Error("the profile couldn't be stored"));
          tx.onabort = () => reject(tx.error ?? new Error("the profile couldn't be stored"));
        }),
    );
  }

  return {
    async get(id) {
      const value = await run<ArrayBuffer>("readonly", (s) => s.get(id));
      return value ? new Uint8Array(value) : null;
    },
    async put(id, bytes) {
      // A copy of just these bytes, not the whole buffer a view may sit in.
      await run("readwrite", (s) => void s.put(bytes.slice().buffer, id));
    },
    async remove(id) {
      await run("readwrite", (s) => void s.delete(id));
    },
  };
}
