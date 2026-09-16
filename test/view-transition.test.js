import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TRANSITION_MS, REDUCED_TRANSITION_MS, ViewTransition } from '../js/view-transition.js';

class Classes {
  constructor(...values) { this.values = new Set(values); this.operations = []; }
  add(...values) { this.operations.push(['add', ...values]); values.forEach(value => this.values.add(value)); }
  remove(...values) { this.operations.push(['remove', ...values]); values.forEach(value => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
}

function fixture({ mode = 'ar', reduced = false, modalOpen = false } = {}) {
  let time = 1000;
  const state = { viewMode: mode, viewTransition: { active: false, direction: null }, viewTransitionLockedUntil: 0 };
  const root = { classList: new Classes(`is-${mode}-mode`) };
  const overlay = { classList: new Classes(), offsetWidth: 360 };
  const timers = [];
  const transition = new ViewTransition({ root, overlay, state, config: { viewTransitionMs: 200, viewTransitionLockMs: 240 }, now: () => time,
    setTimer: (callback, delay) => timers.push({ callback, delay }), reducedMotion: () => reduced, canStart: () => !modalOpen });
  return { state, root, overlay, timers, transition, setTime: value => { time = value; } };
}

const timerAt = (fixture, delay) => fixture.timers.find(timer => timer.delay === delay);

test('CSS animation starts immediately and swaps presentation at 100 ms', () => {
  const f = fixture(); let midpoint = 0;
  assert.equal(f.transition.start('to-map', { onMidpoint: () => midpoint++ }), true);
  assert.equal(f.overlay.classList.contains('transition-map'), true);
  assert.equal(timerAt(f, 100).delay, 100);
  timerAt(f, 100).callback();
  assert.equal(midpoint, 1);
  assert.equal(f.state.viewTransitionMidpointReached, true);
  assert.equal(f.state.viewTransitionStartCount, 1);
  assert.equal(f.state.lastViewTransitionDirection, 'to-map');
});

test('every transition removes and reapplies its CSS animation class', () => {
  const f = fixture();
  f.transition.start('to-map'); timerAt(f, 100).callback(); timerAt(f, 200).callback();
  f.setTime(1300); f.transition.start('to-ar');
  assert.equal(f.state.viewTransitionStartCount, 2);
  assert.equal(f.overlay.classList.contains('transition-map'), false);
  assert.equal(f.overlay.classList.contains('transition-ar'), true);
  assert.ok(f.overlay.classList.operations.some(operation => operation[0] === 'remove' && operation.includes('transition-ar')));
});

test('fail-safe performs midpoint, completion and cleanup', () => {
  const f = fixture(); let midpoint = 0, completion = 0;
  f.transition.start('to-map', { onMidpoint: () => midpoint++, onComplete: () => completion++ });
  assert.equal(timerAt(f, MAX_TRANSITION_MS).delay, 400);
  f.setTime(1400); timerAt(f, MAX_TRANSITION_MS).callback();
  assert.equal(midpoint, 1); assert.equal(completion, 1);
  assert.deepEqual(f.state.viewTransition, { active: false, direction: null });
  assert.equal(f.overlay.classList.contains('transition-map'), false);
});

test('reduced motion uses a 120 ms transition and 60 ms midpoint', () => {
  const f = fixture({ reduced: true }); f.transition.start('to-map');
  assert.equal(timerAt(f, REDUCED_TRANSITION_MS / 2).delay, 60);
  assert.equal(timerAt(f, REDUCED_TRANSITION_MS).delay, 120);
  assert.equal(f.state.viewTransitionReducedMotion, true);
});

test('an open dialog prevents a transition from starting', () => {
  const f = fixture({ modalOpen: true });
  assert.equal(f.transition.start('to-map'), false);
  assert.deepEqual(f.state.viewTransition, { active: false, direction: null });
  assert.equal(f.timers.length, 0);
});
