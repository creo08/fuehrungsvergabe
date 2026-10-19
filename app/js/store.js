// Lokale Speicherung: IndexedDB, ersatzweise localStorage, notfalls nur im Arbeitsspeicher.
// Dazu Sicherung als JSON-Datei und Benachrichtigung anderer Tabs (BroadcastChannel).

const DB = "fuehrungsvergabe";
const STORE = "zustand";
const KEY = "haupt";
const LS_KEY = "fuehrungsvergabe:zustand";
export const BACKUP_APP = "fuehrungsvergabe";
export const BACKUP_VERSION = 1;

export function emptyState() {
  return {
    v: 1,
    rounds: {}, // Koordinator:in: Runden nach ID
    currentRoundId: null,
    person: { name: "", langs: [], entwuerfe: {}, runden: {}, plaene: {} },
    lastBackupAt: null,
    rolle: null, // "koordinator" | "person"
  };
}

function idb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("IndexedDB nicht verfügbar"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB blockiert"));
  });
}
function idbGet(db) {
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
    r.onsuccess = () => resolve(r.result ?? null);
    r.onerror = () => reject(r.error);
  });
}
function idbPut(db, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Speichern abgebrochen"));
  });
}

export function createStore() {
  let db = null;
  let mode = "speicher"; // "indexeddb" | "localstorage" | "speicher"
  let timer = null;
  let pending = null;
  const listeners = new Set();
  let channel = null;
  try {
    channel = new BroadcastChannel("fuehrungsvergabe");
    channel.onmessage = () => listeners.forEach((fn) => fn());
  } catch { /* nicht verfügbar */ }

  async function load() {
    try {
      db = await idb();
      mode = "indexeddb";
      const json = await idbGet(db);
      if (json) return normalize(JSON.parse(json));
    } catch {
      db = null;
    }
    try {
      const raw = localStorage.getItem(LS_KEY);
      mode = db ? "indexeddb" : "localstorage";
      if (raw) return normalize(JSON.parse(raw));
    } catch {
      if (!db) mode = "speicher";
    }
    return emptyState();
  }

  async function writeNow(state) {
    const json = JSON.stringify(state);
    if (db) {
      try {
        await idbPut(db, json);
        channel?.postMessage("geaendert");
        return true;
      } catch { db = null; }
    }
    try {
      localStorage.setItem(LS_KEY, json);
      mode = "localstorage";
      channel?.postMessage("geaendert");
      return true;
    } catch {
      mode = "speicher";
      return false;
    }
  }

  /** Verzögert speichern (mehrere Änderungen zusammenfassen). */
  function save(state, { sofort = false } = {}) {
    pending = state;
    clearTimeout(timer);
    if (sofort) return flush();
    timer = setTimeout(flush, 250);
    return Promise.resolve(true);
  }
  async function flush() {
    clearTimeout(timer);
    if (!pending) return true;
    const s = pending;
    pending = null;
    return writeNow(s);
  }

  return {
    load,
    save,
    flush,
    get mode() { return mode; },
    onExternalChange(fn) { listeners.add(fn); },
  };
}

/** Fehlende Felder ergänzen (ältere Stände, Sicherungen). */
export function normalize(s) {
  const e = emptyState();
  const out = { ...e, ...s, person: { ...e.person, ...(s?.person ?? {}) } };
  out.rounds ??= {};
  return out;
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen (Safari/Chrome entscheiden selbst). */
export async function requestPersist() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

// ---------- Sicherung ----------
export function backupJson(state, now = new Date()) {
  return JSON.stringify({ app: BACKUP_APP, v: BACKUP_VERSION, gespeichert: now.toISOString(), zustand: state }, null, 1);
}
export const backupFilename = (now = new Date()) => {
  const d = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return `fuehrungsvergabe-sicherung-${d}.json`;
};
/** Sicherung lesen; wirft bei falschem Format. */
export function parseBackup(text) {
  let o;
  try {
    o = JSON.parse(text);
  } catch {
    throw new Error("Datei ist keine Sicherung der Führungsvergabe (kein gültiges JSON).");
  }
  if (o?.app !== BACKUP_APP || !o.zustand) throw new Error("Datei ist keine Sicherung der Führungsvergabe.");
  if (o.v > BACKUP_VERSION) throw new Error("Sicherung stammt von einer neueren App-Version. Bitte App neu laden.");
  return { zustand: normalize(o.zustand), gespeichert: o.gespeichert };
}
