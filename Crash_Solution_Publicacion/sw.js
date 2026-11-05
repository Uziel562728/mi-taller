/* Only the app shell is cached. Private data stays in the existing scoped stores. */
const BUILD_VERSION = '__BUILD_VERSION__';
const ROOT = new URL('./', self.location.href);
const CACHE_PREFIX = 'crash-solution-shell-' + encodeURIComponent(ROOT.pathname) + '-';
const CACHE_NAME = CACHE_PREFIX + BUILD_VERSION;
const APP_FILES = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
let precachedPaths;
function allowedAsset(path) {
  return typeof path === 'string' && /^(assets|vehicle-assets)\/[a-zA-Z0-9_./-]+$/.test(path) && !path.includes('..');
}
function currentCache() { return caches.open(CACHE_NAME); }
function belongsToScope(key) {
  return key.startsWith(CACHE_PREFIX) || (ROOT.pathname === '/' && /^crash-solution-shell-v\d/.test(key));
}
async function assetPaths() {
  if (!precachedPaths) precachedPaths = currentCache().then(cache => cache.keys()).then(keys => new Set(keys.map(key => new URL(key.url).pathname)));
  return precachedPaths;
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(new URL('precache-manifest.json', ROOT).href, { cache: 'no-store' });
    if (!response.ok) throw new Error('Incomplete app version');
    const manifest = await response.json();
    if (manifest.version !== BUILD_VERSION || !Array.isArray(manifest.assets)) throw new Error('Mixed app versions');
    const assets = [...APP_FILES, ...manifest.assets.filter(allowedAsset)].map(path => new Request(new URL(path, ROOT).href, { cache: 'reload' }));
    // Atomic: a failed download must leave the previous complete version active.
    const cache = await currentCache();
    await cache.addAll(assets);
    const html = await cache.match(new URL('index.html', ROOT).href);
    if (!html || !(await html.text()).includes('<meta name="app-build-version" content="' + BUILD_VERSION + '">')) {
      await caches.delete(CACHE_NAME);
      throw new Error('Mixed app HTML');
    }
    // Updates wait for explicit acceptance. First installation activates normally.
  })());
});
self.addEventListener('activate', event => {
  // Keep old hashed bundles while another tab may still be running that version.
  event.waitUntil(self.clients.claim());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'APP_VERSION_READY' && event.data.version === BUILD_VERSION) {
    event.waitUntil((async () => {
      const clients = await self.clients.matchAll({ type: 'window' });
      // Delete only this scope's shell, once no old app tabs can need it.
      if (clients.length !== 1 || clients[0].id !== event.source?.id) return;
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => belongsToScope(key) && key !== CACHE_NAME).map(key => caches.delete(key)));
    })());
  }
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname) || request.headers.has('Authorization') ||
      url.search || url.pathname.includes('/api/') || /\/(auth|rest|storage)\/v1\//.test(url.pathname)) return;
  if (request.mode === 'navigate') {
    // The HTML and chunks belong to one installed release. Update checks run in
    // the page and offer the new complete release without interrupting a draft.
    event.respondWith(currentCache().then(async cache => (await cache.match(new URL('index.html', ROOT).href)) || fetch(request)));
    return;
  }
  const path = url.pathname.slice(ROOT.pathname.length);
  if (!allowedAsset(path) && !APP_FILES.some(asset => new URL(asset, ROOT).pathname === url.pathname)) return;
  event.respondWith((async () => {
    const cache = await currentCache();
    const hit = await cache.match(request);
    if (hit) return hit;
    // Older tabs may still request a deferred chunk from their own release.
    if (allowedAsset(path)) {
      for (const key of (await caches.keys()).filter(key => belongsToScope(key) && key !== CACHE_NAME)) {
        const oldHit = await (await caches.open(key)).match(request);
        if (oldHit) return oldHit;
      }
    }
    const response = await fetch(request);
    // Do not turn arbitrary same-origin URLs into a runtime/private data cache.
    if (response.ok && response.type === 'basic' && (await assetPaths()).has(url.pathname)) {
      event.waitUntil(cache.put(request, response.clone()));
    }
    return response;
  })());
});
