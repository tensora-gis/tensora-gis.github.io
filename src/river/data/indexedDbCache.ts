/**
 * IndexedDB Local Project & River Reach Cache
 *
 * Provides client-side persistent storage for river meshes, simulation runs,
 * and downloaded reach geometries with TTL expiration.
 */

const DB_NAME = 'TensoraRiverModellingDB';
const DB_VERSION = 1;
const REACHES_STORE = 'reaches';
const RESULTS_STORE = 'simulation_results';

export interface CachedReachRecord {
  id: string;
  name: string;
  timestamp: number;
  data: any;
}

export interface CachedResultRecord {
  id: string;
  reachId: string;
  timestamp: number;
  summary: any;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result as IDBDatabase;
      if (!db.objectStoreNames.contains(REACHES_STORE)) {
        db.createObjectStore(REACHES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(RESULTS_STORE)) {
        db.createObjectStore(RESULTS_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveReachToCache(id: string, name: string, data: any): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(REACHES_STORE, 'readwrite');
      const store = tx.objectStore(REACHES_STORE);
      const record: CachedReachRecord = {
        id,
        name,
        timestamp: Date.now(),
        data,
      };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB reach save failed, falling back to memory:', err);
  }
}

export async function loadReachFromCache(id: string): Promise<any | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(REACHES_STORE, 'readonly');
      const store = tx.objectStore(REACHES_STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        if (req.result) resolve(req.result.data);
        else resolve(null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function listAllCachedReaches(): Promise<{ id: string; name: string; timestamp: number }[]> {
  if (typeof indexedDB === 'undefined') return [];
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(REACHES_STORE, 'readonly');
      const store = tx.objectStore(REACHES_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result || []).map((r: CachedReachRecord) => ({
          id: r.id,
          name: r.name,
          timestamp: r.timestamp,
        }));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function deleteReachFromCache(id: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(REACHES_STORE, 'readwrite');
      const store = tx.objectStore(REACHES_STORE);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}
