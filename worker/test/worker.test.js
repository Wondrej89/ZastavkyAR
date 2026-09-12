import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { normalize } from '../src/index.js';

globalThis.caches = { default: { match: async () => null, put: async () => {} } };
const ctx = { waitUntil() {} };

test('health is independent of secret', async () => {
  const response = await worker.fetch(new Request('https://x.test/health'), {}, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test('departure input is strict', async () => {
  assert.equal((await worker.fetch(new Request('https://x.test/departures?stop=bad%20id'), {}, ctx)).status, 400);
  assert.equal((await worker.fetch(new Request('https://x.test/departures?stop=ok&url=x'), {}, ctx)).status, 400);
});

test('normalizes current Golemio departure board fields and prefers predicted time', () => {
  const payload = { departures: [{
    departure_timestamp: { scheduled: '2026-09-11T12:01:30+02:00', predicted: '2026-09-11T12:02:00+02:00' },
    delay: { seconds: 30, minutes: 0.5, is_available: true },
    route: { short_name: '9' },
    trip: { headsign: 'Sídliště Řepy', is_wheelchair_accessible: true, is_air_conditioned: true },
    stop: { platform_code: 'B' },
  }] };

  assert.deepEqual(normalize(payload, new Date('2026-09-11T10:00:00Z').getTime()), [{
    route: '9',
    routeType: null,
    isNight: false,
    destination: 'Sídliště Řepy',
    minutes: 2,
    scheduledTime: '2026-09-11T10:01:30.000Z',
    predictedTime: '2026-09-11T10:02:00.000Z',
    realtime: true,
    delaySeconds: 30,
    platform: 'B',
    wheelchairAccessible: true,
    airConditioned: true,
  }]);
});

test('preserves unknown accessibility and air-conditioning states as null', () => {
  const rows = normalize({ departures: [{
    route: { short_name: 'A' },
    trip: { headsign: 'Nemocnice Motol', is_wheelchair_accessible: null },
  }] });

  assert.equal(rows[0].wheelchairAccessible, null);
  assert.equal(rows[0].airConditioned, null);
});

test('normalizes a night departure without treating rail as night', () => {
  const rows = normalize({ departures: [
    { route: { short_name: '93', type: 0 }, trip: { headsign: 'Sídliště Ďáblice' } },
    { route: { short_name: '93', type: 2 }, trip: { headsign: 'Denní vlak' } },
  ] });
  assert.equal(rows[0].isNight, true);
  assert.equal(rows[1].isNight, false);
});

test('falls back to scheduled time and always emits a numeric or null delay', () => {
  const payload = { departures: [
    { departure_timestamp: { scheduled: '2026-09-11T10:03:00Z', predicted: null }, delay: { minutes: 2, is_available: false }, route: { short_name: '22' }, trip: { headsign: 'Bílá Hora' }, stop: {} },
    { departure_timestamp: {}, delay: { is_available: false }, route: { short_name: 'X' }, trip: { headsign: 'Test' } },
  ] };
  const rows = normalize(payload, new Date('2026-09-11T10:00:00Z').getTime());
  assert.equal(rows[0].minutes, 3);
  assert.equal(rows[0].realtime, false);
  assert.equal(rows[0].delaySeconds, 120);
  assert.equal(rows[1].delaySeconds, null);
  assert.equal(rows[1].minutes, null);
});

test('requests departures for one physical stop without metro aggregation', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let upstreamUrl;
  globalThis.fetch = async url => {
    upstreamUrl = new URL(url);
    return new Response(JSON.stringify({ departures: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const response = await worker.fetch(new Request('https://x.test/departures?stop=U123Z1P'), { GOLEMIO_API_KEY: 'test-only' }, ctx);
  assert.equal(response.status, 200);
  assert.equal(upstreamUrl.searchParams.get('includeMetroTrains'), 'false');
  assert.equal(upstreamUrl.searchParams.get('airCondition'), 'true');
  assert.equal(upstreamUrl.searchParams.get('ids'), 'U123Z1P');
});
