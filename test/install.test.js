import test from 'node:test';
import assert from 'node:assert/strict';
import { isIOS, isStandalone, setupInstallUx } from '../js/install.js';

function installHarness({ standalone = false, navigator = {} } = {}) {
  const listeners = {}, buttonListeners = {}, classes = new Set(['hidden']);
  const displayMode = { matches: standalone, addEventListener: (name, listener) => { listeners[`display-${name}`] = listener; } };
  const window = {
    matchMedia: () => displayMode,
    addEventListener: (name, listener) => { listeners[name] = listener; }
  };
  const button = {
    classList: {
      add: name => classes.add(name),
      toggle: (name, force) => force ? classes.add(name) : classes.delete(name)
    },
    addEventListener: (name, listener) => { buttonListeners[name] = listener; }
  };
  const dialog = { opened: false, showModal() { this.opened = true; }, close() { this.opened = false; } };
  const closeButton = { addEventListener: (name, listener) => { buttonListeners[`close-${name}`] = listener; } };
  const message = { textContent: '' };
  setupInstallUx({ button, dialog, message, closeButton, window, navigator });
  return { listeners, buttonListeners, classes, dialog, message };
}

test('standalone mode is detected from the display mode media query', () => {
  assert.equal(isStandalone({ media: () => ({ matches: true }), navigator: {} }), true);
  assert.equal(isStandalone({ media: () => ({ matches: false }), navigator: {} }), false);
});

test('iOS navigator.standalone is recognized as standalone mode', () => {
  assert.equal(isStandalone({ media: () => ({ matches: false }), navigator: { standalone: true } }), true);
});

test('iPhone, iPad and touch-based iPad desktop identity are detected', () => {
  assert.equal(isIOS({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }), true);
  assert.equal(isIOS({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)' }), true);
  assert.equal(isIOS({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(isIOS({ userAgent: 'Mozilla/5.0 (Linux; Android 15)', platform: 'Linux armv8l', maxTouchPoints: 5 }), false);
});

test('native install prompt is used when Chromium provides it', async () => {
  const harness = installHarness();
  let prevented = false, prompted = false;
  harness.listeners.beforeinstallprompt({
    preventDefault: () => { prevented = true; },
    prompt: async () => { prompted = true; }
  });
  await harness.buttonListeners.click();
  assert.equal(prevented, true);
  assert.equal(prompted, true);
  assert.equal(harness.dialog.opened, false);
});

test('iOS opens Add to Home Screen instructions without a native prompt', async () => {
  const harness = installHarness({ navigator: { userAgent: 'Mozilla/5.0 (iPhone)' } });
  assert.equal(harness.classes.has('hidden'), false);
  await harness.buttonListeners.click();
  assert.equal(harness.dialog.opened, true);
  assert.equal(harness.message.textContent, 'Klepněte na Sdílet → Přidat na plochu.');
});

test('standalone PWA keeps the install button hidden', () => {
  const harness = installHarness({ standalone: true });
  assert.equal(harness.classes.has('hidden'), true);
});
