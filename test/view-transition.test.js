import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TRANSITION_MS, ViewTransition } from '../js/view-transition.js';

class Classes {
  constructor(...values) { this.values = new Set(values); }
  add(...values) { values.forEach(value => this.values.add(value)); }
  remove(...values) { values.forEach(value => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
}

function fixture({ mode = 'ar', reduced = false, modalOpen = false } = {}) {
  const state = { viewMode: mode, viewTransition: { active: false, direction: null }, viewTransitionLockedUntil: 0 };
  const root = { classList: new Classes(`is-${mode}-mode`) };
  const overlay = { classList: new Classes() };
  const timers = [];
  const transition = new ViewTransition({ root, overlay, state, config: { viewTransitionMs: 200, viewTransitionLockMs: 260 }, now: () => 1000,
    setTimer: (callback, delay) => timers.push({ callback, delay }), reducedMotion: () => reduced, canStart: () => !modalOpen });
  return { state, root, overlay, timers, transition };
}

test('AR to map starts transition state and ignores another transition', () => {
  const f = fixture();
  assert.equal(f.transition.start('to-map'), true);
  assert.deepEqual(f.state.viewTransition, { active: true, direction: 'to-map' });
  assert.equal(f.overlay.classList.contains('active'), true);
  assert.equal(f.transition.start('to-ar'), false);
  assert.equal(f.state.viewMode, 'ar');
});

test('completion only cleans up presentation and never commits functional mode', () => {
  const f = fixture(); f.transition.start('to-map'); f.timers[0].callback();
  assert.equal(f.state.viewMode, 'ar');
  assert.equal(f.state.viewTransition.active, false);
  assert.equal(f.overlay.classList.contains('active'), false);
});

test('map to AR transition never controls map visibility or functional mode', () => {
  const f = fixture({ mode: 'map' }); f.transition.start('to-ar');
  f.timers[0].callback();
  assert.equal(f.state.viewMode, 'map');
});

test('fail-safe timer cleans up a transition whose normal callback never runs', () => {
  const f = fixture(); f.transition.start('to-map');
  assert.equal(f.timers[1].delay, MAX_TRANSITION_MS);
  f.timers[1].callback();
  assert.deepEqual(f.state.viewTransition, { active: false, direction: null });
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
