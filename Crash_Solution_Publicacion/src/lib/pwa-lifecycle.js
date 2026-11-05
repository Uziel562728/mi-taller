export async function configureServiceWorker({
  isDev, basePath, version,
  onUpdate = () => {}, beforeUpdate = async () => true,
  navigator: nav = globalThis.navigator,
  caches: cacheStorage = globalThis.caches,
  location: loc = globalThis.location,
  window: win = globalThis.window
}) {
  if (!nav?.serviceWorker) return;
  const scope = new URL(basePath || './', loc.href).href;
  const workerUrl = new URL('sw.js', scope).href;
  const prefix = 'crash-solution-shell-' + encodeURIComponent(new URL(scope).pathname) + '-';
  if (isDev) {
    const controlled = nav.serviceWorker.controller?.scriptURL === workerUrl;
    for (const registration of await nav.serviceWorker.getRegistrations()) {
      const workers = [registration.active, registration.waiting, registration.installing];
      if (registration.scope === scope && workers.some(worker => worker?.scriptURL === workerUrl)) await registration.unregister();
    }
    if (cacheStorage) {
      const keys = await cacheStorage.keys();
      await Promise.all(keys.filter(key => key.startsWith(prefix) ||
        (new URL(scope).pathname === '/' && /^crash-solution-shell-v\d/.test(key)))
        .map(key => cacheStorage.delete(key)));
    }
    if (controlled) loc.reload();
    return;
  }
  if (loc.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(loc.hostname)) return;
  const hadController = Boolean(nav.serviceWorker.controller);
  let reloadRequested = false, reloading = false, applying = false;
  const registration = await nav.serviceWorker.register(workerUrl, { scope, updateViaCache: 'none' });
  const ready = () => {
    if (version) nav.serviceWorker.controller?.postMessage({ type: 'APP_VERSION_READY', version });
  };
  const applyUpdate = async () => {
    if (applying) return false;
    applying = true;
    try {
      if (await beforeUpdate() === false) return false;
      reloadRequested = true;
      if (registration.waiting) registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
      else { reloading = true; loc.reload(); }
      return true;
    } finally { applying = false; }
  };
  nav.serviceWorker.addEventListener?.('controllerchange', () => {
    if (reloadRequested && !reloading) { reloading = true; loc.reload(); }
    else if (hadController && !reloadRequested) onUpdate(applyUpdate);
    ready();
  });
  const checkWaiting = () => { if (registration.waiting) onUpdate(applyUpdate); };
  registration.addEventListener?.('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => { if (worker.state === 'installed') checkWaiting(); });
  });
  checkWaiting();
  ready();
  let lastCheck = 0, checking = false;
  const check = async () => {
    if (checking || Date.now() - lastCheck < 60000 || nav.onLine === false) return;
    checking = true; lastCheck = Date.now();
    try { await registration.update?.(); checkWaiting(); ready(); } catch { /* Offline: keep the installed version. */ }
    finally { checking = false; }
  };
  win?.addEventListener?.('focus', check);
  win?.addEventListener?.('online', check);
  await check();
  return { registration, applyUpdate };
}
