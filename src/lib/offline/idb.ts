"use client";
/** Tiny promise wrapper over IndexedDB (no dependency). Stores: packs (key `${uid}:${deckId}`), outbox (key review id). */
const DB_NAME = "anki-ji-offline";
const DB_VERSION = 1;
export type StoreName = "packs" | "outbox";

let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("packs")) db.createObjectStore("packs", { keyPath: "key" });
        if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbp = null; reject(req.error); };
    });
  }
  return dbp;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve((req ? req.result : undefined) as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export const idbGet = <T>(store: StoreName, key: string) => run<T | undefined>(store, "readonly", (s) => s.get(key));
export const idbAll = <T>(store: StoreName) => run<T[]>(store, "readonly", (s) => s.getAll());
export const idbPut = (store: StoreName, value: unknown) => run<void>(store, "readwrite", (s) => { s.put(value); });
export const idbDelete = (store: StoreName, keys: string | string[]) => run<void>(store, "readwrite", (s) => { for (const k of Array.isArray(keys) ? keys : [keys]) s.delete(k); });
export const hasIdb = () => typeof indexedDB !== "undefined";
