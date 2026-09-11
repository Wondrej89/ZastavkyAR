import test from 'node:test';import assert from 'node:assert/strict';import worker from '../src/index.js';
globalThis.caches={default:{match:async()=>null,put:async()=>{}}};const ctx={waitUntil(){}};
test('health is independent of secret',async()=>{const r=await worker.fetch(new Request('https://x.test/health'),{},ctx);assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true})});
test('departure input is strict',async()=>{assert.equal((await worker.fetch(new Request('https://x.test/departures?stop=bad%20id'),{},ctx)).status,400);assert.equal((await worker.fetch(new Request('https://x.test/departures?stop=ok&url=x'),{},ctx)).status,400)});
