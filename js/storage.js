const DB_NAME = 'pid-ar', STORE = 'datasets', KEY = 'active';
function openDb() { return new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => request.result.createObjectStore(STORE); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function transact(mode, fn) { const db = await openDb(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE, mode); const result = fn(tx.objectStore(STORE)); tx.oncomplete = () => { db.close(); resolve(result.result); }; tx.onerror = () => { db.close(); reject(tx.error); }; }); }
export const readDataset = () => transact('readonly', store => store.get(KEY));
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
  if (!Array.isArray(data.stops) || !meta.version) throw new Error('Neplatný dataset');
  const value = { data, meta, storedAt: Date.now() }; await replaceDataset(value); return value;
}
export async function refreshDataset(current, config) {
  try { const meta = await json(config.datasetMetaUrl); if (meta.version !== current.meta.version) return downloadDataset(config); } catch (_) { /* offline: current data remain authoritative */ }
  return current;
}
