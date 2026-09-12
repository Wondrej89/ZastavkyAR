import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnhancedARState, detectEnhancedAR } from '../js/enhanced-ar.js';

test('detects immersive-ar without starting an XR session',async()=>{
  let requested;
  const available=await detectEnhancedAR({xr:{isSessionSupported:async mode=>{requested=mode;return true}}});
  assert.equal(requested,'immersive-ar');assert.equal(available,true);assert.deepEqual(createEnhancedARState(),{available:false,enabled:false,session:null});
});

test('unsupported WebXR remains on standard sensor path',async()=>{
  assert.equal(await detectEnhancedAR({}),false);
  assert.equal(await detectEnhancedAR({xr:{isSessionSupported:async()=>{throw new Error('blocked')}}}),false);
});
