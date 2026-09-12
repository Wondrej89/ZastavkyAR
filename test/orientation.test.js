import test from 'node:test';
import assert from 'node:assert/strict';
import { OrientationController } from '../js/orientation.js';

const iosEvent=(heading,alpha=360,accuracy=5)=>({type:'deviceorientation',webkitCompassHeading:heading,webkitCompassAccuracy:accuracy,alpha});

test('iOS compass initializes heading after the stabilization timeout',()=>{
  let now=0;
  const controller=new OrientationController(()=>{},()=>{},{headingStabilizationMs:1000,headingPublishIntervalMs:0},()=>now);
  controller.handle(iosEvent(40,320));now=500;controller.handle(iosEvent(42,318));now=1000;controller.handle(iosEvent(41,319));
  assert.ok(controller.heading>40&&controller.heading<42);
});

test('large compass spread warns but does not block initialization',()=>{
  let now=0;const warnings=[];
  const controller=new OrientationController(()=>{},message=>warnings.push(message),{headingStabilizationMs:1000,headingInitializationSpreadDeg:8},()=>now);
  controller.handle(iosEvent(10));now=500;controller.handle(iosEvent(70));now=1000;controller.handle(iosEvent(130));
  assert.notEqual(controller.heading,null);
  assert.ok(warnings.includes('Kompas je méně přesný, zkuste telefon krátce pohnout do tvaru osmičky.'));
});

test('poor iOS compass accuracy still preserves relative alpha motion',()=>{
  let now=0;
  const controller=new OrientationController(()=>{},()=>{},{headingStabilizationMs:0,headingPublishIntervalMs:0},()=>now);
  for(let i=0;i<3;i++)controller.handle(iosEvent(90,270));
  const initial=controller.heading;now=100;controller.handle(iosEvent(140,260,90));
  assert.ok(controller.heading>initial+9&&controller.heading<initial+11);
  assert.ok(controller.compassHeading>89&&controller.compassHeading<91);
});

test('Android relative startup fallback remains available',()=>{
  let now=0;const warnings=[];
  const controller=new OrientationController(()=>{},message=>warnings.push(message),{orientationStartupFallbackMs:2000},()=>now);
  controller.handle({type:'deviceorientation',absolute:false,alpha:120});now=2000;controller.handle({type:'deviceorientation',absolute:false,alpha:110});
  assert.notEqual(controller.heading,null);
  assert.ok(warnings.includes('Směr není přesně zkalibrován.'));
});

test('available sensor samples cannot leave heading permanently null',()=>{
  let now=0;
  const controller=new OrientationController(()=>{},()=>{},{headingStabilizationMs:1000},()=>now);
  for(let i=0;i<20;i++){now=i*100;controller.handle(iosEvent(200+(i%2)));}
  assert.notEqual(controller.heading,null);
  assert.equal(controller.compassSamples.length,10);
});
