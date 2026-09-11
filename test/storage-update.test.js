import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshDataset, downloadDataset, isProductionMetadata } from '../js/storage.js';

const validMeta = { version: 'same-content', generatedAt: '2026-09-11T12:00:00Z', markerCount: 1, bootstrap: false };

test('generatedAt-only change persists metadata without downloading the large dataset', async () => {
  const originalFetch = global.fetch; let requests = []; let saved;
  global.fetch = async url => { requests.push(url); return { ok: true, body: null, json: async () => validMeta }; };
  try {
    const current = { data: { stops: [{ id: 'one' }] }, meta: { ...validMeta, generatedAt: '2026-09-10T12:00:00Z', storedAt: 'download-time' } };
    const result = await refreshDataset(current, { datasetMetaUrl: 'meta.json', datasetUrl: 'large.json' }, async value => { saved = value; });
    assert.deepEqual(requests, ['meta.json']); assert.equal(result.data, current.data); assert.equal(result.meta.generatedAt, validMeta.generatedAt); assert.equal(result.meta.storedAt, 'download-time'); assert.ok(result.meta.checkedAt); assert.equal(saved, result);
  } finally { global.fetch = originalFetch; }
});

test('bootstrap and empty metadata are rejected in production', async () => {
  assert.equal(isProductionMetadata({ ...validMeta, bootstrap: true }), false);
  assert.equal(isProductionMetadata({ ...validMeta, markerCount: 0 }), false);
  const originalFetch = global.fetch;
  global.fetch = async url => ({ ok: true, body: null, json: async () => url === 'data.json' ? { stops: [] } : { ...validMeta, bootstrap: true, markerCount: 0 } });
  try { await assert.rejects(downloadDataset({ datasetUrl: 'data.json', datasetMetaUrl: 'meta.json' }), /produkční dataset/); }
  finally { global.fetch = originalFetch; }
});
