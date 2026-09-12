import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServiceArea, stopBufferMeters, outerSafetyBufferMeters, simplifyToleranceMeters } from '../scripts/build-service-area.mjs';
import { pointInServiceArea, ServiceAreaTracker } from '../js/service-area.js';

const markers=[{id:'prague',lat:50.0755,lon:14.4378,physical:true},{id:'edge',lat:49.7810,lon:14.6869,physical:true},{id:'edge-duplicate',lat:49.7810,lon:14.6869,physical:true}];
const area=buildServiceArea(markers,{generatedAt:'2026-01-01T00:00:00.000Z'});

test('service area has stable metadata and remains a MultiPolygon',()=>{assert.equal(area.geometry.type,'MultiPolygon');assert.equal(area.properties.stopBufferMeters,stopBufferMeters);assert.equal(area.properties.safetyBufferMeters,outerSafetyBufferMeters);assert.equal(simplifyToleranceMeters,300)});
test('Prague and a point near a peripheral PID stop are inside',()=>{assert.equal(pointInServiceArea({latitude:50.0755,longitude:14.4378},area),true);assert.equal(pointInServiceArea({latitude:49.79,longitude:14.6869},area),true)});
test('points clearly outside PID are outside',()=>{for(const [latitude,longitude] of [[49.1951,16.6068],[50.2092,15.8328],[48.9747,14.4743]])assert.equal(pointInServiceArea({latitude,longitude},area),false)});
test('outside requires three accurate stabilized anchors',()=>{const tracker=new ServiceAreaTracker(area),outside={latitude:49.1951,longitude:16.6068,accuracy:20};assert.equal(tracker.update(outside),'pending');assert.equal(tracker.update(outside),'pending');assert.equal(tracker.update(outside),'outside')});
test('poor accuracy and near-boundary positions cannot declare outside',()=>{const tracker=new ServiceAreaTracker(area);assert.equal(tracker.update({latitude:49.1951,longitude:16.6068,accuracy:101}),'unknown');const boundary=area.geometry.coordinates[0][0][0];assert.equal(tracker.update({latitude:boundary[1],longitude:boundary[0],accuracy:10}),'inside')});
