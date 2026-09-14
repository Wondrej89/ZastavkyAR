import test from 'node:test';
import assert from 'node:assert/strict';
import { alignYawToNorth, createEnhancedARState, detectEnhancedAR, quaternionToYaw, startEnhancedAR } from '../js/enhanced-ar.js';

test('detects immersive-ar without starting an XR session',async()=>{
  let requested;
  const available=await detectEnhancedAR({xr:{isSessionSupported:async mode=>{requested=mode;return true}}});
  assert.equal(requested,'immersive-ar');assert.equal(available,true);
  assert.deepEqual(createEnhancedARState(),{available:false,enabled:false,active:false,session:null,referenceSpace:null,viewerPose:null,initialPose:null,error:null,domOverlayActive:false,xrYaw:null,initialXRYaw:null,initialCompassHeading:null,xrHeading:null});
});

test('converts WebXR quaternion to clockwise camera yaw',()=>{
  const half=Math.PI/4;
  assert.ok(Math.abs(quaternionToYaw({x:0,y:-Math.sin(half),z:0,w:Math.cos(half)})-90)<1e-9);
});

test('aligns relative XR yaw with compass north across 360 degrees',()=>{
  assert.equal(alignYawToNorth(350,15,355),10);
  assert.equal(alignYawToNorth(5,350,10),345);
});

test('failed session restores sensor camera fallback',async()=>{
  const state=createEnhancedARState();let stopped=0,restored=0;
  const result=await startEnhancedAR({state,root:{},navigatorObject:{xr:{requestSession(){throw new Error('denied')}}},stopCamera:()=>stopped++,restoreCamera:()=>restored++});
  assert.equal(result,false);assert.equal(state.active,false);assert.equal(stopped,1);assert.equal(restored,1);assert.match(state.error.message,/denied/);
});

test('missing DOM overlay ends session and restores fallback',async()=>{
  const listeners={};let ended=0,restored=0;
  const session={addEventListener(name,fn){listeners[name]=fn},requestReferenceSpace:async()=>({}),async end(){ended++;listeners.end?.()}};
  const state=createEnhancedARState();
  assert.equal(await startEnhancedAR({state,root:{},navigatorObject:{xr:{requestSession:async()=>session}},restoreCamera:()=>restored++}),false);
  assert.equal(ended,1);assert.equal(restored,1);assert.equal(state.active,false);
});

test('unsupported WebXR remains on standard sensor path',async()=>{
  assert.equal(await detectEnhancedAR({}),false);
  assert.equal(await detectEnhancedAR({xr:{isSessionSupported:async()=>{throw new Error('blocked')}}}),false);
});
