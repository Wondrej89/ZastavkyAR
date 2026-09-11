const RELOAD_KEY = 'pid-ar-reloaded-build';
export async function fetchBuildVersion(fetchFn = fetch) {
  const response = await fetchFn('./build-version.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const info = await response.json();
  if (!info.version) throw new Error('Neplatná verze buildu');
  return info;
}
export async function checkForBuildUpdate({ registration, currentVersion, fetchFn = fetch, storage = sessionStorage, reload = () => location.reload(), serviceWorker = navigator.serviceWorker }) {
  const server = await fetchBuildVersion(fetchFn);
  if (server.version === currentVersion || storage.getItem(RELOAD_KEY) === server.version) return false;
  let reloaded = false;
  serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    storage.setItem(RELOAD_KEY, server.version);
    reload();
  }, { once: true });
  await registration.update();
  const activate = worker => worker?.postMessage({ type: 'SKIP_WAITING' });
  if (registration.waiting) activate(registration.waiting);
  else if (registration.installing) {
    const worker = registration.installing;
    if (worker.state === 'installed') activate(worker);
    else worker.addEventListener('statechange', () => { if (worker.state === 'installed') activate(worker); });
  }
  return true;
}
export { RELOAD_KEY };
