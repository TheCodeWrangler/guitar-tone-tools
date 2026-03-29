/**
 * IndexedDB-backed storage for Guitar Tone Tools.
 *
 * localStorage caps out at ~5 MB per origin, which is easily blown by the rich
 * analysis data (FFT, STFT, waveform, harmonic-decay) stored with each profile.
 * IndexedDB supports hundreds of MB and is available in all modern browsers.
 *
 * On first run the module migrates any data already in localStorage so existing
 * users keep their profiles and recordings.
 */

const DB_NAME = 'gtt';
const DB_VERSION = 1;
const STORE_PROFILES = 'profiles';
const STORE_GUITARS = 'guitars';

const LS_PROFILES_KEY = 'gtt_profiles';
const LS_GUITARS_KEY = 'gtt_guitars';

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROFILES)) {
        db.createObjectStore(STORE_PROFILES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_GUITARS)) {
        db.createObjectStore(STORE_GUITARS, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return openDB().then(db => {
    const t = db.transaction(storeName, mode);
    return t.objectStore(storeName);
  });
}

function idbGetAll(storeName) {
  return tx(storeName).then(store =>
    new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }),
  );
}

function idbPut(storeName, item) {
  return tx(storeName, 'readwrite').then(store =>
    new Promise((resolve, reject) => {
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }),
  );
}

function idbDelete(storeName, key) {
  return tx(storeName, 'readwrite').then(store =>
    new Promise((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }),
  );
}

function idbClear(storeName) {
  return tx(storeName, 'readwrite').then(store =>
    new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }),
  );
}

function idbPutAll(storeName, items) {
  return openDB().then(db =>
    new Promise((resolve, reject) => {
      const t = db.transaction(storeName, 'readwrite');
      const store = t.objectStore(storeName);
      for (const item of items) store.put(item);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    }),
  );
}

// ── Migration from localStorage ───────────────────────────────────────

async function migrateFromLocalStorage() {
  const db = await openDB();

  const pTx = db.transaction(STORE_PROFILES, 'readonly');
  const pCount = await new Promise((res, rej) => {
    const r = pTx.objectStore(STORE_PROFILES).count();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

  if (pCount === 0) {
    try {
      const raw = localStorage.getItem(LS_PROFILES_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (arr.length) await idbPutAll(STORE_PROFILES, arr);
        localStorage.removeItem(LS_PROFILES_KEY);
      }
    } catch { /* ignore corrupt data */ }
  }

  const gTx = db.transaction(STORE_GUITARS, 'readonly');
  const gCount = await new Promise((res, rej) => {
    const r = gTx.objectStore(STORE_GUITARS).count();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

  if (gCount === 0) {
    try {
      const raw = localStorage.getItem(LS_GUITARS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (arr.length) await idbPutAll(STORE_GUITARS, arr);
        localStorage.removeItem(LS_GUITARS_KEY);
      }
    } catch { /* ignore corrupt data */ }
  }
}

// ── Public API ─────────────────────────────────────────────────────────

export async function initStorage() {
  await openDB();
  await migrateFromLocalStorage();
}

// Profiles

export async function loadAllProfiles() {
  return idbGetAll(STORE_PROFILES);
}

export async function saveProfile(profile) {
  return idbPut(STORE_PROFILES, profile);
}

export async function saveAllProfiles(profiles) {
  await idbClear(STORE_PROFILES);
  if (profiles.length) await idbPutAll(STORE_PROFILES, profiles);
}

export async function deleteProfile(id) {
  return idbDelete(STORE_PROFILES, id);
}

// Guitars (quick-analyze recordings)

export async function loadAllGuitars() {
  return idbGetAll(STORE_GUITARS);
}

export async function saveGuitar(guitar) {
  return idbPut(STORE_GUITARS, guitar);
}

export async function saveAllGuitars(guitars) {
  await idbClear(STORE_GUITARS);
  if (guitars.length) await idbPutAll(STORE_GUITARS, guitars);
}

export async function deleteGuitar(id) {
  return idbDelete(STORE_GUITARS, id);
}
