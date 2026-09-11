const DB_NAME = 'pid-ar', STORE = 'datasets', KEY = 'active';
function openDb() { return new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => request.result.createObjectStore(STORE); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function transact(mode, fn) { const db = await openDb(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE, mode); const result = fn(tx.objectStore(STORE)); tx.oncomplete = () => { db.close(); resolve(result.result); }; tx.onerror = () => { db.close(); reject(tx.error); }; }); }
export async function readDataset() { const value = await transact('readonly', store => store.get(KEY)); return isUsableDataset(value) ? value : undefined; }
export const replaceDataset = value => transact('readwrite', store => store.put(value, KEY));
async function json(url, onProgress) {
  const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!response.body || !onProgress) return response.json();
  const total = Number(response.headers.get('content-length')) || 0, reader = response.body.getReader(); let loaded = 0, chunks = [];
  while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); loaded += value.length; onProgress(total ? loaded / total : null); }
  const bytes = new Uint8Array(loaded); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function downloadDataset(config, onProgress) {
  const [data, meta] = await Promise.all([json(config.datasetUrl, onProgress), json(config.datasetMetaUrl)]);
  if (!isProductionMetadata(meta) || !Array.isArray(data.stops) || data.stops.length !== meta.markerCount) throw new Error('Neplatný produkční dataset');
  const now = new Date().toISOString();
  const value = { data, meta: { ...meta, storedAt: now, checkedAt: now } }; await replaceDataset(value); return value;
}
export async function refreshDataset(current, config, persist = replaceDataset) {
  try { const meta = await json(config.datasetMetaUrl); if (!isProductionMetadata(meta)) throw new Error('Neplatná metadata datasetu'); if (meta.version !== current.meta.version) return downloadDataset(config); const updated = { ...current, meta: { ...current.meta, ...meta, storedAt: current.meta.storedAt || current.storedAt, checkedAt: new Date().toISOString() } }; await persist(updated); return updated; } catch (_) { /* offline: current data remain authoritative */ }
  return current;
}
export function isProductionMetadata(meta) { return Boolean(meta?.version && meta.bootstrap !== true && Number.isInteger(meta.markerCount) && meta.markerCount > 0 && !Number.isNaN(new Date(meta.generatedAt).getTime())); }
export function isUsableDataset(value) { return Boolean(value && isProductionMetadata(value.meta) && Array.isArray(value.data?.stops) && value.data.stops.length === value.meta.markerCount); }
