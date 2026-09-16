import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TRANSITION_MS, REDUCED_TRANSITION_MS, ViewTransition } from '../js/view-transition.js';

class Classes {
  constructor(...values) { this.values = new Set(values); }
  add(...values) { values.forEach(value => this.values.add(value)); }
  remove(...values) { values.forEach(value => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
}

function fixture({ mode = 'ar', reduced = false, modalOpen = false } = {}) {
  let time = 1000;
  const state = { viewMode: mode, viewTransition: { active: false, direction: null }, viewTransitionLockedUntil: 0 };
  const root = { classList: new Classes(`is-${mode}-mode`) };
  const animations = [];
  const overlay = { classList: new Classes(), animate: (frames, options) => { animations.push({ frames, options }); return { finished: new Promise(() => {}) }; } };
  const timers = [];
  const frames = [];
  const transition = new ViewTransition({ root, overlay, state, config: { viewTransitionMs: 320, viewTransitionLockMs: 380 }, now: () => time,
    setTimer: (callback, delay) => timers.push({ callback, delay }), requestFrame: callback => frames.push(callback), reducedMotion: () => reduced, canStart: () => !modalOpen });
  const paint = () => { frames.shift()(); frames.shift()(); };
  return { state, root, overlay, timers, frames, animations, transition, paint, setTime: value => { time = value; } };
}

const timerAt = (fixture, delay) => fixture.timers.find(timer => timer.delay === delay);

test('animation starts after two frames and swaps presentation at 140 ms', () => {
  const f = fixture(); let midpoint = 0;
  assert.equal(f.transition.start('to-map', { onMidpoint: () => midpoint++ }), true);
  assert.equal(f.animations.length, 0);
  f.paint();
  assert.equal(f.animations[0].options.duration, 320);
  assert.deepEqual(f.animations[0].frames.map(frame => frame.transform), ['translateY(-12px)', 'translateY(0)', 'translateY(12px)']);
  timerAt(f, 140).callback();
  assert.equal(midpoint, 1);
  assert.equal(f.state.viewTransitionMidpointReached, true);
  assert.equal(f.state.viewMode, 'ar');
});

test('fail-safe performs midpoint, completion and cleanup without animation callbacks', () => {
  const f = fixture(); let midpoint = 0, completion = 0;
  f.transition.start('to-map', { onMidpoint: () => midpoint++, onComplete: () => completion++ });
  assert.equal(timerAt(f, MAX_TRANSITION_MS).delay, 560);
  f.setTime(1560); timerAt(f, MAX_TRANSITION_MS).callback();
  assert.equal(midpoint, 1); assert.equal(completion, 1);
  assert.deepEqual(f.state.viewTransition, { active: false, direction: null });
  assert.equal(f.overlay.classList.contains('active'), false);
  assert.equal(f.state.viewTransitionCompleted, true);
});

test('callbacks are presentation-only and never commit functional mode', () => {
  const f = fixture({ mode: 'map' });
  f.transition.start('to-ar'); f.paint(); timerAt(f, 140).callback();
  assert.equal(f.state.viewMode, 'map');
});

test('reduced motion uses 120 ms opacity-only animation', () => {
  const f = fixture({ reduced: true }); f.transition.start('to-map'); f.paint();
  assert.equal(f.animations[0].options.duration, REDUCED_TRANSITION_MS);
  assert.deepEqual(f.animations[0].frames.map(frame => frame.transform), ['translateY(0)', 'translateY(0)', 'translateY(0)']);
  assert.equal(f.state.viewTransitionReducedMotion, true);
  assert.equal(f.root.classList.contains('reduced-motion'), true);
});

test('an open dialog prevents a transition from starting', () => {
  const f = fixture({ modalOpen: true });
  assert.equal(f.transition.start('to-map'), false);
  assert.deepEqual(f.state.viewTransition, { active: false, direction: null });
  assert.equal(f.timers.length, 0);
});
