// IndexedDB offline persistence helper
const DB_NAME = 'GoalTimeTrackerDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_data';

export async function openOfflineDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return null;

  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function backupToIndexedDB(key: string, data: unknown): Promise<void> {
  try {
    const db = await openOfflineDB();
    if (!db) return;

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(data, key);
  } catch (err) {
    console.warn('[IndexedDB] Backup failed silently:', err);
  }
}

export async function loadFromIndexedDB<T>(key: string): Promise<T | null> {
  try {
    const db = await openOfflineDB();
    if (!db) return null;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
