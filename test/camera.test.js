import test from 'node:test';import assert from 'node:assert/strict';import { CameraController } from '../js/camera.js';

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}};
const fakeStream=()=>{const tracks=[{stopped:false,stop(){this.stopped=true}},{stopped:false,stop(){this.stopped=true}}];return {tracks,getTracks(){return tracks}}};

test('camera stop ends every track and clears the video',async()=>{const stream=fakeStream(),video={srcObject:null,play:async()=>{}},camera=new CameraController(video,{getUserMedia:async()=>stream});await camera.start();camera.stop();assert.ok(stream.tracks.every(track=>track.stopped));assert.equal(video.srcObject,null)});

test('foreground after a pending background request gets a new stream sequentially',async()=>{const firstRequest=deferred(),second=fakeStream(),calls=[],video={srcObject:null,plays:0,async play(){this.plays++}},camera=new CameraController(video,{getUserMedia(){calls.push(calls.length);return calls.length===1?firstRequest.promise:Promise.resolve(second)}});const starting=camera.start();camera.stop();const restarted=camera.start();assert.equal(calls.length,1);const first=fakeStream();firstRequest.resolve(first);await starting;await restarted;assert.equal(calls.length,2);assert.ok(first.tracks.every(track=>track.stopped));assert.equal(video.srcObject,second);assert.equal(video.plays,1);assert.equal(camera.cameraStarting,false)});

test('each completed foreground start replaces the previous stream',async()=>{const streams=[fakeStream(),fakeStream()],video={srcObject:null,async play(){}},camera=new CameraController(video,{getUserMedia:async()=>streams.shift()});const first=await camera.start();const second=await camera.start();assert.ok(first.tracks.every(track=>track.stopped));assert.equal(video.srcObject,second)});
