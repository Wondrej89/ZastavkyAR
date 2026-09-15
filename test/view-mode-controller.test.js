import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraDownAngle, ViewModeController } from '../js/view-mode-controller.js';
import { mapOrientation, mapStopClickHandler, MapMode } from '../js/map-mode.js';

const config={mapEnterAngleDeg:35,mapExitAngleDeg:55,mapEnterDwellMs:300,mapExitDwellMs:250};
function fixture(){let time=0,mode='ar',enabled=true,paused=false;const controller=new ViewModeController({config,now:()=>time,getMode:()=>mode,isEnabled:()=>enabled,isPaused:()=>paused,enterMap:()=>mode='map',exitMap:()=>mode='ar'});return{controller,get mode(){return mode},set mode(v){mode=v},set time(v){time=v},set enabled(v){enabled=v},set paused(v){paused=v}}}

test('upright phone remains in AR',()=>{const f=fixture();f.controller.update(90,0);assert.equal(f.mode,'ar');assert.equal(Math.round(cameraDownAngle(90,0)),90)});
test('brief down tilt does not switch',()=>{const f=fixture();f.controller.update(0,0);f.time=299;f.controller.update(0,0);assert.equal(f.mode,'ar')});
test('sustained down tilt enters map',()=>{const f=fixture();f.controller.update(0,0);f.time=300;f.controller.update(0,0);assert.equal(f.mode,'map')});
test('hysteresis band preserves current mode',()=>{const f=fixture();f.mode='map';f.controller.update(45,0);f.time=1000;f.controller.update(45,0);assert.equal(f.mode,'map')});
test('sustained upright tilt exits map',()=>{const f=fixture();f.mode='map';f.controller.update(90,0);f.time=250;f.controller.update(90,0);assert.equal(f.mode,'ar')});
test('disabled tilt and modal pause never switch',()=>{const f=fixture();f.enabled=false;f.controller.update(0,0);f.time=999;f.controller.update(0,0);assert.equal(f.mode,'ar');f.enabled=true;f.paused=true;f.controller.update(0,0);f.time=2000;f.controller.update(0,0);assert.equal(f.mode,'ar')});
test('map orientation follows rotation mode and compass availability',()=>{assert.deepEqual(mapOrientation('heading-up',90),{bearing:90,arrow:0,effectiveMode:'heading-up'});assert.deepEqual(mapOrientation('north-up',90),{bearing:0,arrow:90,effectiveMode:'north-up'});assert.deepEqual(mapOrientation('heading-up',null),{bearing:0,arrow:null,effectiveMode:'north-up'})});
test('raw GPS update recenters an initialized map',()=>{const center=[];const state={rawPosition:{latitude:50,longitude:14},heading:null,mapRotationMode:'heading-up'};const root={style:{setProperty(){}},classList:{toggle(){}}},compass={dataset:{},setAttribute(){}};const mode=new MapMode({root,container:{},error:{},compass,config:{mapMarkerRefreshMeters:18},state,select(){}});mode.map={easeTo:v=>center.push(v.center),setBearing(){}};mode.lastMarkerPosition={...state.rawPosition};mode.updatePosition();state.rawPosition={latitude:50.1,longitude:14.1};mode.lastMarkerPosition={...state.rawPosition};mode.updatePosition();assert.deepEqual(center.at(-1),[14.1,50.1])});

test('map stop click delegates to existing departure board selection',()=>{const stop={id:'stop'};let selected=null,stopped=false;mapStopClickHandler(stop,value=>selected=value)({stopPropagation(){stopped=true}});assert.equal(selected,stop);assert.equal(stopped,true)});
