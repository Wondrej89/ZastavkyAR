import test from 'node:test';
import assert from 'node:assert/strict';
import { aimMarker } from '../js/marker-selection.js';

test('aiming past the former dwell time never opens departures, while clicking does', async () => {
  const stop = { id: 'stop-1', name: 'Testovací zastávka' };
  const state = { aimed: null, selected: null };
  const board = { hidden: true };
  const select = selectedStop => {
    state.selected = selectedStop;
    board.hidden = false;
  };
  const marker = { onclick: () => select(stop) };

  aimMarker(state, stop);
  await new Promise(resolve => setTimeout(resolve, 850));

  assert.equal(state.aimed, stop);
  assert.equal(state.selected, null);
  assert.equal(board.hidden, true);

  marker.onclick();

  assert.equal(state.selected, stop);
  assert.equal(board.hidden, false);
});
