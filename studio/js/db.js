// Everything Ash changes in the studio (edits, approvals, calendar, numbers) lives on this device, in IndexedDB.
// The engine's own data is never modified here.
const NAME = 'truth-studio', STORE = 'kv';
let dbp;
function open() {
  if (!dbp) dbp = new Promise((resolve, reject) => { const r = indexedDB.open(NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  return dbp;
}
async function tx(mode, fn) { const db = await open(); return new Promise((resolve, reject) => { const t = db.transaction(STORE, mode); const out = fn(t.objectStore(STORE)); t.oncomplete = () => resolve(out?.result ?? out); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error); }); }
export const get = (key) => tx('readonly', (s) => s.get(key));
export const set = (key, val) => tx('readwrite', (s) => s.put(val, key));
export const del = (key) => tx('readwrite', (s) => s.delete(key));
/** All entries whose key starts with prefix → [[key, value], …] */
export async function all(prefix) {
  const db = await open(); const range = IDBKeyRange.bound(prefix, prefix + '￿');
  return new Promise((resolve, reject) => { const out = []; const c = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor(range); c.onsuccess = () => { const cur = c.result; if (!cur) return resolve(out); out.push([cur.key, cur.value]); cur.continue(); }; c.onerror = () => reject(c.error); });
}
