import test from 'node:test';
import assert from 'node:assert/strict';
import { datasetReadyMessage, formatDatasetDate } from '../js/dataset-status.js';

test('dataset status confirms download and shows the metadata date', () => {
  const meta = { generatedAt: '2026-09-11T10:15:00.000Z', markerCount: 123 };
  const formatted = formatDatasetDate(meta, 'cs-CZ');
  assert.match(formatted, /11\. 9\. 2026/);
  assert.equal(datasetReadyMessage(meta, 'cs-CZ'), `Data zastávek aktualizována: ${formatted}\n123 míst v databázi PID`);
});

test('dataset count uses Czech thousands grouping', () => {
  assert.match(datasetReadyMessage({ generatedAt: '2026-09-11T21:52:00Z', markerCount: 17392 }, 'cs-CZ'), /17(?:\s|\u00a0)392 míst v databázi PID$/);
});

test('dataset status handles missing version date', () => {
  assert.equal(formatDatasetDate({}, 'cs-CZ'), 'datum verze není k dispozici');
});
