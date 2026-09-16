import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cameraDownAngle, ViewModeController } from '../js/view-mode-controller.js';
import { loadMapLibre, mapOrientation, mapStopClickHandler, mapStyle, stopLngLat, MapMode } from '../js/map-mode.js';

const config={mapEnterAngleDeg:35,mapExitAngleDeg:55,mapEnterDwellMs:300,mapExitDwellMs:250};
function fixture(){let time=0,mode='ar',enabled=true,paused=false;const controller=new ViewModeController({config,now:()=>time,getMode:()=>mode,isEnabled:()=>enabled,isPaused:()=>paused,enterMap:()=>mode='map',exitMap:()=>mode='ar'});return{controller,get mode(){return mode},set mode(v){mode=v},set time(v){time=v},set enabled(v){enabled=v},set paused(v){paused=v}}}

test('upright phone remains in AR',()=>{const f=fixture();f.controller.update(90,0);assert.equal(f.mode,'ar');assert.equal(Math.round(cameraDownAngle(90,0)),90)});
test('brief down tilt does not switch',()=>{const f=fixture();f.controller.update(0,0);f.time=299;f.controller.update(0,0);assert.equal(f.mode,'ar')});
test('sustained down tilt enters map',()=>{const f=fixture();f.controller.update(0,0);f.time=300;f.controller.update(0,0);assert.equal(f.mode,'map')});
test('hysteresis band preserves current mode',()=>{const f=fixture();f.mode='map';f.controller.update(45,0);f.time=1000;f.controller.update(45,0);assert.equal(f.mode,'map')});
test('sustained upright tilt exits map',()=>{const f=fixture();f.mode='map';f.controller.update(90,0);f.time=250;f.controller.update(90,0);assert.equal(f.mode,'ar')});
test('disabled tilt and modal pause never switch',()=>{const f=fixture();f.enabled=false;f.controller.update(0,0);f.time=999;f.controller.update(0,0);assert.equal(f.mode,'ar');f.enabled=true;f.paused=true;f.controller.update(0,0);f.time=2000;f.controller.update(0,0);assert.equal(f.mode,'ar')});
test('map orientation follows rotation mode and compass availability',()=>{assert.deepEqual(mapOrientation('heading-up',90),{bearing:90,arrow:0,effectiveMode:'heading-up'});assert.deepEqual(mapOrientation('north-up',90),{bearing:0,arrow:90,effectiveMode:'north-up'});assert.deepEqual(mapOrientation('heading-up',null),{bearing:0,arrow:null,effectiveMode:'north-up'})});
test('map position is used only for explicit initial centering, not GPS camera follow',()=>{const center=[];const state={rawPosition:{latitude:50,longitude:14},heading:null,mapRotationMode:'heading-up'};const root={style:{setProperty(){}},classList:{toggle(){}}},compass={dataset:{},setAttribute(){}};const mode=new MapMode({root,container:{},error:{},compass,config:{mapMarkerRefreshMeters:18},state,select(){}});mode.map={jumpTo:v=>center.push(v.center),setBearing(){}};mode.updatePosition(state.rawPosition);state.rawPosition={latitude:50.001,longitude:14};assert.deepEqual(center,[[14,50]])});

test('MapLibre geolocation owns map fixes, diagnostics, marker refresh and lifecycle',()=>{
  class GeolocateControl { constructor(options){this.options=options;this.listeners={};this.triggerCount=0} on(name,fn){this.listeners[name]=fn} trigger(){this.triggerCount++;this.listeners.trackuserlocationstart?.()} }
  const state={rawPosition:null,lastMapPosition:null,heading:null,mapRotationMode:'north-up'},root={style:{setProperty(){}},classList:{toggle(){}}},compass={dataset:{},setAttribute(){}},removed=[];
  const mode=new MapMode({root,container:{},error:{},compass,config:{mapMarkerRefreshMeters:18},state,select(){}});
  mode.lib={GeolocateControl};mode.mapLoaded=true;mode.map={addControl(){},removeControl:c=>removed.push(c)};
  let stopUpdates=0;mode.updateStops=()=>{stopUpdates++;mode.lastMarkerPosition={...state.rawPosition}};
  assert.equal(mode.activateGeolocation(),true);assert.equal(mode.geolocateControl.triggerCount,1);assert.equal(mode.mapGeolocationActive,true);
  assert.deepEqual(mode.geolocateControl.options.positionOptions,{enableHighAccuracy:true,maximumAge:0,timeout:10000});
  const first={coords:{latitude:50,longitude:14,accuracy:5,speed:1},timestamp:100};mode.geolocateControl.listeners.geolocate(first);
  assert.deepEqual(state.rawPosition,{latitude:50,longitude:14,accuracy:5,speed:1,timestamp:100});assert.deepEqual(state.lastMapPosition,state.rawPosition);assert.equal(mode.mapGeolocateEventCount,1);assert.equal(stopUpdates,1);
  mode.geolocateControl.listeners.geolocate({coords:{latitude:50+1/111111,longitude:14,accuracy:5,speed:null},timestamp:101});assert.equal(stopUpdates,1);
  mode.geolocateControl.listeners.geolocate({coords:{latitude:50+20/111111,longitude:14,accuracy:5,speed:null},timestamp:102});assert.equal(stopUpdates,2);
  mode.deactivateGeolocation();assert.equal(mode.mapGeolocationActive,false);assert.equal(mode.geolocateControl,null);assert.equal(removed.length,1);
});

test('map stop click delegates to existing departure board selection',()=>{const stop={id:'stop'};let selected=null,stopped=false;mapStopClickHandler(stop,value=>selected=value)({stopPropagation(){stopped=true}});assert.equal(selected,stop);assert.equal(stopped,true)});

test('MapLibre loader returns a library with Map and Marker', async () => {
  const previous = globalThis.maplibregl;
  globalThis.maplibregl = { Map: class {}, Marker: class {} };
  try {
    const library = await loadMapLibre();
    assert.equal(typeof library.Map, 'function');
    assert.equal(typeof library.Marker, 'function');
  } finally {
    if (previous === undefined) delete globalThis.maplibregl;
    else globalThis.maplibregl = previous;
  }
});

test('Mapy raster style uses direct official tile URL', () => {
  const style = mapStyle('key with spaces');
  assert.deepEqual(style.sources['basic-tiles'].tiles, ['https://api.mapy.com/v1/maptiles/basic/256/{z}/{x}/{y}?apikey=key%20with%20spaces']);
  assert.equal(style.layers[0].source, 'basic-tiles');
});

test('PID stop coordinates are converted from lon/lat and invalid stops are skipped', () => {
  assert.deepEqual(stopLngLat({ lat: 50.0755, lon: 14.4378 }), [14.4378, 50.0755]);
  assert.equal(stopLngLat({ lat: 50.0755, lon: undefined }), null);
});

test('debug overlay has a touch-scrollable mobile viewport', async () => {
  const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.debug\{[^}]*max-height:calc\(100dvh[^}]*overflow-y:auto[^}]*overflow-x:auto[^}]*pointer-events:auto[^}]*-webkit-overflow-scrolling:touch/);
});
