import test from 'node:test';
import assert from 'node:assert/strict';
import { checkForBuildUpdate, RELOAD_KEY } from '../js/build-update.js';

function harness(stored) {
  let listeners = [], updates = 0, reloads = 0, messages = [];
  const storage = { value: stored, getItem: () => storage.value, setItem: (key, value) => { assert.equal(key, RELOAD_KEY); storage.value = value; } };
  const serviceWorker = { addEventListener: (name, fn) => { assert.equal(name, 'controllerchange'); listeners.push(fn); } };
  const waiting = { postMessage: message => messages.push(message) };
  const registration = { waiting, update: async () => { updates++; } };
  const fetchFn = async (_, options) => { assert.equal(options.cache, 'no-store'); return { ok: true, json: async () => ({ version: 'new', shortVersion: 'new', builtAt: '2026-09-11T12:00:00Z' }) }; };
  return { args: { registration, currentVersion: 'old', fetchFn, storage, serviceWorker, reload: () => reloads++ }, fire: () => listeners.forEach(listener => listener()), stats: () => ({ updates, reloads, messages, stored: storage.value }) };
}

test('new build updates and activates the waiting worker, then reloads once', async () => {
  const h = harness(); assert.equal(await checkForBuildUpdate(h.args), true); h.fire(); h.fire();
  assert.deepEqual(h.stats(), { updates: 1, reloads: 1, messages: [{ type: 'SKIP_WAITING' }], stored: 'new' });
});

test('a build already reloaded in this tab cannot cause a reload loop', async () => {
  const h = harness('new'); assert.equal(await checkForBuildUpdate(h.args), false);
  assert.equal(h.stats().updates, 0);
});

test('concurrent update checks still reload a tab only once', async () => {
  const h = harness();
  await Promise.all([checkForBuildUpdate(h.args), checkForBuildUpdate(h.args)]);
  h.fire();
  assert.equal(h.stats().reloads, 1);
});
