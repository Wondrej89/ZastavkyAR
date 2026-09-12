import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { departuresUrl } from '../api/departures.js';

test('production departure request targets the Worker and encodes the stop id', () => {
  assert.equal(CONFIG.apiBaseUrl, 'https://pid-ar-api.wondrej-blogspot.workers.dev');
  assert.equal(departuresUrl('U123Z1P').href, 'https://pid-ar-api.wondrej-blogspot.workers.dev/departures?stop=U123Z1P');
  assert.equal(departuresUrl('stop/with space').searchParams.get('stop'), 'stop/with space');
});

test('four metro stop IDs produce exactly the stops parameter, never stop', () => {
  const ids = ['U400Z101P', 'U400Z102P', 'U400Z121P', 'U400Z122P'];
  const url = departuresUrl(ids);
  assert.equal(url.search, '?stops=U400Z101P%2CU400Z102P%2CU400Z121P%2CU400Z122P');
  assert.equal(url.searchParams.get('stops'), ids.join(','));
  assert.equal(url.searchParams.has('stop'), false);
});
