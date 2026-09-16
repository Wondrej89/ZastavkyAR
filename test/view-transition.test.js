import test from 'node:test';
import assert from 'node:assert/strict';
import { ViewTransition } from '../js/view-transition.js';

class Classes {
  constructor(...values) { this.values = new Set(values); }
  add(...values) { values.forEach(value => this.values.add(value)); }
  remove(...values) { values.forEach(value => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
}

function fixture({ mode = 'ar', reduced = false, modalOpen = false } = {}) {
  const state = { viewMode: mode, viewTransition: { active: false, direction: null }, viewTransitionLockedUntil: 0 };
  const root = { classList: new Classes(`is-${mode}-mode`) };
  const mapLayer = { classList: new Classes(...(mode === 'ar' ? ['hidden'] : [])) };
  const timers = [];
  const transition = new ViewTransition({ root, mapLayer, state, config: { viewTransitionMs: 200, viewTransitionLockMs: 260 }, now: () => 1000,
    setTimer: (callback, delay) => timers.push({ callback, delay }), reducedMotion: () => reduced, canStart: () => !modalOpen });
  return { state, root, mapLayer, timers, transition };
}

test('AR to map starts transition state and ignores another transition', () => {
  const f = fixture();
  assert.equal(f.transition.start('to-map'), true);
  assert.deepEqual(f.state.viewTransition, { active: true, direction: 'to-map' });
  assert.equal(f.mapLayer.classList.contains('hidden'), false);
  assert.equal(f.transition.start('to-ar'), false);
  assert.equal(f.state.viewMode, 'ar');
});

test('AR to map commits map mode only after completion', () => {
  const f = fixture(); f.transition.start('to-map'); f.timers[0].callback();
  assert.equal(f.state.viewMode, 'map');
  assert.equal(f.state.viewTransition.active, false);
  assert.equal(f.root.classList.contains('is-map-mode'), true);
});

test('map to AR keeps map visible until completion and then hides it', () => {
  const f = fixture({ mode: 'map' }); f.transition.start('to-ar');
  assert.equal(f.mapLayer.classList.contains('hidden'), false);
  f.timers[0].callback();
  assert.equal(f.state.viewMode, 'ar');
  assert.equal(f.mapLayer.classList.contains('hidden'), true);
});

test('reduced motion uses the minimal transition variant', () => {
  const f = fixture({ reduced: true }); f.transition.start('to-map');
  assert.equal(f.timers[0].delay, 1);
  assert.equal(f.root.classList.contains('reduced-motion'), true);
});

test('an open dialog prevents a transition from starting', () => {
  const f = fixture({ modalOpen: true });
  assert.equal(f.transition.start('to-map'), false);
  assert.deepEqual(f.state.viewTransition, { active: false, direction: null });
  assert.equal(f.timers.length, 0);
});
