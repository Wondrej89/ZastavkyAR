import test from 'node:test';
import assert from 'node:assert/strict';
import { datasetReadyMessage, formatDatasetDate } from '../js/dataset-status.js';

test('dataset status confirms download and shows the metadata date', () => {
  const meta = { generatedAt: '2026-09-11T10:15:00.000Z' };
  const formatted = formatDatasetDate(meta, 'cs-CZ');
  assert.match(formatted, /11\. 9\. 2026/);
  assert.equal(datasetReadyMessage(meta, 'cs-CZ'), `Zastávky jsou správně stažené. Poslední verze dat: ${formatted}.`);
});

test('dataset status handles missing version date', () => {
  assert.equal(formatDatasetDate({}, 'cs-CZ'), 'datum verze není k dispozici');
});
