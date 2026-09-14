import test from 'node:test';
import assert from 'node:assert/strict';
import { alignYawToNorth, createEnhancedARState, detectEnhancedAR, quaternionToYaw, setupEnhancedARRecovery, startEnhancedAR } from '../js/enhanced-ar.js';

test('detects immersive-ar without starting an XR session',async()=>{
  let requested;
  const available=await detectEnhancedAR({xr:{isSessionSupported:async mode=>{requested=mode;return true}}});
  assert.equal(requested,'immersive-ar');assert.equal(available,true);
  assert.deepEqual(createEnhancedARState(),{available:false,enabled:false,active:false,session:null,referenceSpace:null,viewerPose:null,initialPose:null,error:null,domOverlayActive:false,sessionCreated:false,layerCreated:false,poseAvailable:false,xrYaw:null,initialXRYaw:null,initialCompassHeading:null,xrHeading:null,visibilityState:null,interrupted:false,ending:false,lastXRFrameAt:null,interrupt:null});
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
  assert.equal(result,false);assert.equal(state.active,false);assert.equal(stopped,0);assert.equal(restored,0);assert.match(state.error.message,/denied/);
});

test('missing DOM overlay ends session and restores fallback',async()=>{
  const listeners={};let ended=0,restored=0;
  const session={addEventListener(name,fn){listeners[name]=fn},requestReferenceSpace:async()=>({}),async end(){ended++;listeners.end?.()}};
  const state=createEnhancedARState();
  assert.equal(await startEnhancedAR({state,root:{},navigatorObject:{xr:{requestSession:async()=>session}},restoreCamera:()=>restored++}),false);
  assert.equal(ended,1);assert.equal(restored,0);assert.equal(state.active,false);
});

test('creates a transparent XR layer before stopping the fallback camera',async()=>{
  const calls=[],listeners={},frames=[];
  const gl={FRAMEBUFFER:1,COLOR_BUFFER_BIT:2,async makeXRCompatible(){calls.push('compatible')},bindFramebuffer(...args){calls.push(['bind',...args])},clearColor(...args){calls.push(['color',...args])},clear(...args){calls.push(['clear',...args])}};
  const layer={framebuffer:'xr-buffer'};
  class Layer{constructor(sessionArg,glArg,options){assert.equal(sessionArg,session);assert.equal(glArg,gl);assert.deepEqual(options,{alpha:true,depth:false,stencil:false,antialias:false});calls.push('layer');return layer}}
  const session={domOverlayState:{type:'screen'},renderState:{},addEventListener(name,fn){listeners[name]=fn},updateRenderState(value){calls.push('render-state');this.renderState={...this.renderState,...value}},async requestReferenceSpace(){calls.push('reference-space');return{}},requestAnimationFrame(fn){frames.push(fn)},async end(){listeners.end?.()}};
  const state=createEnhancedARState();let compass=null,heading=null;
  const result=await startEnhancedAR({state,root:{},navigatorObject:{xr:{requestSession(){calls.push('session');return Promise.resolve(session)}}},documentObject:{createElement(tag){assert.equal(tag,'canvas');return{getContext(type,options){assert.equal(type,'webgl');assert.deepEqual(options,{xrCompatible:true,alpha:true,antialias:false});calls.push('context');return gl}}}},XRWebGLLayerClass:Layer,getCompassHeading:()=>compass,onHeading:value=>{heading=value},stopCamera:()=>calls.push('stop-camera')});
  assert.equal(result,true);assert.equal(state.active,true);
  assert.deepEqual(calls.slice(0,7),['session','context','compatible','layer','render-state','reference-space','stop-camera']);
  const firstFrame=frames.shift();firstFrame(0,{getViewerPose:()=>({transform:{orientation:{x:0,y:0,z:0,w:1}}})});
  assert.equal(state.poseAvailable,true);assert.equal(state.xrYaw,0);assert.equal(state.xrHeading,null);
  assert.deepEqual(calls.slice(-3),[['bind',1,'xr-buffer'],['color',0,0,0,0],['clear',2]]);
  compass=42;frames.shift()(16,{getViewerPose:()=>({transform:{orientation:{x:0,y:0,z:0,w:1}}})});
  assert.equal(state.initialCompassHeading,42);assert.equal(state.initialXRYaw,0);assert.equal(heading,42);
});

test('layer setup failure ends the session without stopping a running camera',async()=>{
  const listeners={};let ended=0,stopped=0,restored=0;
  const session={domOverlayState:{type:'screen'},addEventListener(name,fn){listeners[name]=fn},async end(){ended++;listeners.end?.()}};
  const state=createEnhancedARState();
  const result=await startEnhancedAR({state,root:{},navigatorObject:{xr:{requestSession:async()=>session}},documentObject:{createElement:()=>({getContext:()=>null})},stopCamera:()=>stopped++,restoreCamera:()=>restored++});
  assert.equal(result,false);assert.equal(ended,1);assert.equal(stopped,0);assert.equal(restored,0);assert.match(state.error.message,/WebGL/);
});

test('unsupported WebXR remains on standard sensor path',async()=>{
  assert.equal(await detectEnhancedAR({}),false);
  assert.equal(await detectEnhancedAR({xr:{isSessionSupported:async()=>{throw new Error('blocked')}}}),false);
});


test('XR visible to hidden ends once, restores camera, and retires the old RAF',async()=>{
  const listeners={},frames=[];let ended=0,restored=0,headings=0;
  const gl={FRAMEBUFFER:1,COLOR_BUFFER_BIT:2,bindFramebuffer(){},clearColor(){},clear(){}};
  const session={visibilityState:'visible',domOverlayState:{type:'screen'},renderState:{},addEventListener(name,fn){listeners[name]=fn},updateRenderState(value){this.renderState=value},requestReferenceSpace:async()=>({}),requestAnimationFrame(fn){frames.push(fn)},async end(){ended++;listeners.end?.()}};
  const state=createEnhancedARState();
  assert.equal(await startEnhancedAR({state,root:{},navigatorObject:{xr:{requestSession:async()=>session}},documentObject:{createElement:()=>({getContext:()=>gl})},XRWebGLLayerClass:class{constructor(){return{framebuffer:{}}}},getCompassHeading:()=>10,onHeading:()=>headings++,stopCamera:()=>{},restoreCamera:()=>restored++}),true);
  assert.equal(state.visibilityState,'visible');
  const staleFrame=frames[0];
  session.visibilityState='visible-blurred';listeners.visibilitychange();
  assert.equal(ended,0);assert.equal(state.visibilityState,'visible-blurred');
  session.visibilityState='hidden';listeners.visibilitychange();listeners.visibilitychange();
  await Promise.resolve();
  assert.equal(ended,1);assert.equal(restored,1);assert.equal(state.interrupted,true);assert.equal(state.active,false);assert.equal(state.session,null);
  staleFrame(12,{getViewerPose:()=>({transform:{orientation:{x:0,y:0,z:0,w:1}}})});
  assert.equal(headings,0);assert.equal(frames.length,1);
});

test('document lifecycle wiring restores the fallback after background',async()=>{
  const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../js/app.js',import.meta.url),'utf8'));
  assert.match(source,/document\.hidden\)\{if\(state\.enhancedAR\.active\).*state\.enhancedAR\.interrupt/);
  assert.match(source,/if\(!state\.enhancedAR\.active\).*permissions\.handleVisibility\(\)/);
});

test('recovery panel is enabled-only and its click starts a fresh XR attempt',async()=>{
  const classes=new Set(['hidden']),panel={classList:{add:value=>classes.add(value),toggle(value,force){force?classes.add(value):classes.delete(value)}}},button={};
  const state=createEnhancedARState();state.interrupted=true;
  let sessions=0;
  const update=setupEnhancedARRecovery({state,panel,button,documentObject:{hidden:false},beginEnhancedAR:async()=>{sessions++;return true}});
  assert.ok(classes.has('hidden'),'disabled Enhanced AR must not show recovery');
  state.enabled=true;update();assert.ok(!classes.has('hidden'));
  await button.onclick();assert.equal(sessions,1);assert.ok(classes.has('hidden'));
});
