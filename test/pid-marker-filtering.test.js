import test from 'node:test';
import assert from 'node:assert/strict';
import { activeServiceIdsForDate, buildMarkers, buildMarkersWithStats, serviceDatesForTimeZone } from '../scripts/pid-data-lib.mjs';
import { filterMarkers } from '../js/markers.js';
import { CONFIG } from '../js/config.js';

const stop = { stop_id:'P', stop_name:'Anděl H', location_type:'0', stop_lat:'50', stop_lon:'14' };
const routes = [
  { route_id:'night', route_type:'3', route_short_name:'901' },
  { route_id:'day', route_type:'3', route_short_name:'123' },
];
const trips = [
  { trip_id:'night-trip', route_id:'night', service_id:'active' },
  { trip_id:'day-trip', route_id:'day', service_id:'active' },
];

for (const [pickup, expected] of [['1', false], ['0', true], ['', true]]) {
  test(`surface pickup_type=${JSON.stringify(pickup)} creates marker: ${expected}`, () => {
    const markers = buildMarkers({ stops:[stop], routes:[routes[0]], trips:[trips[0]], stopTimes:[{ trip_id:'night-trip', stop_id:'P', pickup_type:pickup, drop_off_type:'0' }] });
    assert.equal(markers.length, Number(expected));
    if (expected) assert.equal(markers[0].boardable, true);
  });
}

test('alighting-only line is absent from otherwise boardable marker usage', () => {
  const marker = buildMarkers({ stops:[stop], routes, trips, stopTimes:[
    { trip_id:'night-trip', stop_id:'P', pickup_type:'1' },
    { trip_id:'day-trip', stop_id:'P', pickup_type:'0' },
  ] })[0];
  assert.deepEqual(marker.modes, [3]);
  assert.deepEqual(marker.dayLines, ['123']);
  assert.deepEqual(marker.nightLines, []);
  assert.equal(marker.hasNightService, false);
});

test('inactive service does not create a marker and is reported', () => {
  const result = buildMarkersWithStats({ stops:[stop], routes:[routes[1]], trips:[{ ...trips[1], service_id:'future' }], stopTimes:[{ trip_id:'day-trip', stop_id:'P' }], activeServiceIds:new Set(['active']) });
  assert.deepEqual(result.markers, []);
  assert.equal(result.statistics.stopsExcludedInactiveService, 1);
});

test('calendar additions and removals override regular service', () => {
  const calendar = [
    { service_id:'removed', start_date:'20260901', end_date:'20260930', tuesday:'1' },
    { service_id:'regular', start_date:'20260901', end_date:'20260930', tuesday:'1' },
  ];
  const active = activeServiceIdsForDate({ calendar, calendarDates:[
    { service_id:'added', date:'20260915', exception_type:'1' },
    { service_id:'removed', date:'20260915', exception_type:'2' },
  ], serviceDates:['2026-09-15'] });
  assert.deepEqual([...active].sort(), ['added', 'regular']);
});

test('Prague service dates include current and previous day', () => {
  assert.deepEqual(serviceDatesForTimeZone(new Date('2026-09-14T22:30:00Z')), ['2026-09-15', '2026-09-14']);
});

const nightOnly = { id:'night', modes:[3], nightOnly:true };
const enabled = new Set([3]);
test('night-only marker is hidden by day when toggle is off', () => assert.deepEqual(filterMarkers([nightOnly], enabled, { date:new Date('2026-01-15T14:00:00Z'), config:CONFIG, showNightStopsDuringDay:false }), []));
test('night-only marker is visible by day when toggle is on', () => assert.equal(filterMarkers([nightOnly], enabled, { date:new Date('2026-01-15T14:00:00Z'), config:CONFIG, showNightStopsDuringDay:true }).length, 1));
test('night-only marker is always visible at night', () => assert.equal(filterMarkers([nightOnly], enabled, { date:new Date('2026-01-15T00:30:00Z'), config:CONFIG, showNightStopsDuringDay:false }).length, 1));
test('mixed day/night marker is always visible', () => assert.equal(filterMarkers([{ ...nightOnly, nightOnly:false, hasDayService:true }], enabled, { date:new Date('2026-01-15T14:00:00Z'), config:CONFIG, showNightStopsDuringDay:false }).length, 1));
