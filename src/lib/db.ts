const DB_NAME = "aurora";
const DB_VERSION = 2;
const STORES = ["handles", "prefs", "meta", "playlists"] as const;

export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of STORES) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store);
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("idb-open-failed"));
    });
  }
  return dbPromise;
}

export async function idbGet<T>(
  store: StoreName,
  key: string
): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const request = tx.objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () =>
        reject(request.error ?? new Error("idb-get-failed"));
    });
  } catch {
    return undefined;
  }
}

export async function idbSet(
  store: StoreName,
  key: string,
  value: unknown
): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("idb-set-failed"));
    });
  } catch {
    void 0;
  }
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("idb-delete-failed"));
    });
  } catch {
    void 0;
  }
}

export async function idbGetAll<T>(
  store: StoreName
): Promise<{ keys: string[]; values: T[] }> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const os = tx.objectStore(store);
      const keysReq = os.getAllKeys();
      const valuesReq = os.getAll();
      let keys: IDBValidKey[] = [];
      let values: unknown[] = [];
      keysReq.onsuccess = () => {
        keys = keysReq.result;
        if (valuesReq.readyState === "done") finish();
      };
      valuesReq.onsuccess = () => {
        values = valuesReq.result;
        if (keysReq.readyState === "done") finish();
      };
      const fail = () => reject(keysReq.error ?? valuesReq.error);
      keysReq.onerror = fail;
      valuesReq.onerror = fail;
      function finish() {
        resolve({
          keys: keys.map(String),
          values: values as T[],
        });
      }
    });
  } catch {
    return { keys: [], values: [] };
  }
}
