import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { departuresUrl } from '../api/departures.js';

test('production departure request targets the Worker and encodes the stop id', () => {
  assert.equal(CONFIG.apiBaseUrl, 'https://pid-ar-api.wondrej-blogspot.workers.dev');
  assert.equal(departuresUrl('U123Z1P').href, 'https://pid-ar-api.wondrej-blogspot.workers.dev/departures?stop=U123Z1P');
  assert.equal(departuresUrl('stop/with space').searchParams.get('stop'), 'stop/with space');
});
