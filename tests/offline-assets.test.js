import { describe, expect, it, vi } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'

const source = readFileSync(resolve('Crash_Solution_Publicacion/sw.js'), 'utf8')
function worker({ scope = '/mi-taller/', failDownload = false, manifestVersion = '__BUILD_VERSION__', htmlVersion = '__BUILD_VERSION__' } = {}) {
  const handlers = {}, root = 'https://app.invalid' + scope
  const prefix = 'crash-solution-shell-' + encodeURIComponent(scope) + '-'
  const cache = {
    addAll: vi.fn(async () => { if (failDownload) throw new Error('offline') }),
    put: vi.fn(async () => {}), keys: vi.fn(async () => []),
    match: vi.fn(async request => {
      const url = typeof request === 'string' ? request : request.url
      return url.endsWith('index.html') ? { text: async () => '<meta name="app-build-version" content="' + htmlVersion + '">', cached: 'html' } : { cached: true }
    })
  }
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => [prefix + '__BUILD_VERSION__', prefix + 'old', 'crash-solution-shell-%2Fother%2F-old', 'private-data']),
    delete: vi.fn(async () => true)
  }
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ version: manifestVersion, assets: ['assets/pdf-deferred-12345678.js', 'vehicle-assets/vehicle-12345678.webp', 'https://private.invalid/token', '../private'] }), type: 'basic', clone: () => ({}) }))
  const self = { location: { href: root + 'sw.js', origin: 'https://app.invalid' }, addEventListener: (name, handler) => { handlers[name] = handler }, skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async () => [{ id: 'tab-1' }]) } }
  vm.runInNewContext(source, { self, caches, fetch, URL, Request })
  return { handlers, cache, caches, fetch, self, root, prefix }
}
async function fire(handler, event = {}) {
  let ready
  handler({ ...event, waitUntil: promise => { ready = promise } })
  return ready
}
function request(url, extras = {}) { return { method: 'GET', url, mode: 'cors', headers: { has: () => false }, ...extras } }

describe('Shell PWA aislado, completo y actualizable', () => {
  it('precachea PDF e ilustraciones bajo el scope y rechaza rutas externas o ascendentes', async () => {
    const env = worker()
    await fire(env.handlers.install)
    const urls = env.cache.addAll.mock.calls[0][0].map(request => request.url)
    expect(urls).toContain(env.root + 'assets/pdf-deferred-12345678.js')
    expect(urls).toContain(env.root + 'vehicle-assets/vehicle-12345678.webp')
    expect(urls).not.toContain('https://private.invalid/token')
    expect(urls.every(url => url.startsWith(env.root))).toBe(true)
    expect(env.self.skipWaiting).not.toHaveBeenCalled()
  })
  it('un bundle cacheado funciona sin red y sin revalidación duplicada', async () => {
    const env = worker()
    let response
    env.handlers.fetch({ request: request(env.root + 'assets/pdf-12345678.js'), respondWith: promise => { response = promise } })
    expect(await response).toEqual({ cached: true })
    expect(env.fetch).not.toHaveBeenCalled()
  })
  it.each(['https://supabase.invalid/storage/v1/object/logo', 'https://app.invalid/mi-taller/rest/v1/jobs', 'https://app.invalid/mi-taller/auth/v1/token', 'https://app.invalid/another-app/index.html', 'https://app.invalid/mi-taller/private.json', 'https://app.invalid/mi-taller/?code=private'])('no intercepta ni cachea %s', url => {
    const env = worker(), respondWith = vi.fn()
    env.handlers.fetch({ request: request(url), respondWith })
    expect(respondWith).not.toHaveBeenCalled()
  })
  it('no intercepta recursos con Authorization', () => {
    const env = worker(), respondWith = vi.fn()
    env.handlers.fetch({ request: request(env.root + 'assets/x-12345678.js', { headers: { has: () => true } }), respondWith })
    expect(respondWith).not.toHaveBeenCalled()
  })
  it.each([{ failDownload: true }, { manifestVersion: 'wrong' }, { htmlVersion: 'wrong' }])('rechaza versiones incompletas o mezcladas (%j)', async options => {
    const env = worker(options)
    await expect(fire(env.handlers.install)).rejects.toThrow()
    expect(env.self.skipWaiting).not.toHaveBeenCalled()
    expect(env.caches.delete).not.toHaveBeenCalledWith(env.prefix + 'old')
  })
  it('solo activa antes de tiempo al recibir la aceptación explícita', async () => {
    const env = worker()
    await fire(env.handlers.message, { data: { type: 'ACTIVATE_UPDATE' } })
    expect(env.self.skipWaiting).toHaveBeenCalledOnce()
    await fire(env.handlers.activate)
    expect(env.self.clients.claim).toHaveBeenCalledOnce()
    expect(env.caches.delete).not.toHaveBeenCalled()
  })
  it('una pestaña anterior puede cargar su PDF diferido mientras otra ya usa la nueva versión', async () => {
    const env = worker()
    env.cache.match.mockResolvedValueOnce(undefined)
    let response
    env.handlers.fetch({ request: request(env.root + 'assets/pdf-old-12345678.js'), respondWith: promise => { response = promise } })
    expect(await response).toEqual({ cached: true })
    expect(env.caches.open).toHaveBeenCalledWith(env.prefix + 'old')
    expect(env.fetch).not.toHaveBeenCalled()
  })
  it('recarga offline con el HTML de la versión instalada, conservando coherencia con sus chunks', async () => {
    const env = worker()
    env.fetch.mockRejectedValue(new Error('offline'))
    let response
    env.handlers.fetch({ request: request(env.root, { mode: 'navigate' }), respondWith: promise => { response = promise } })
    expect(await response).toMatchObject({ cached: 'html' })
    expect(env.cache.match).toHaveBeenCalledWith(env.root + 'index.html')
  })
  it('conserva chunks para pestañas antiguas y limpia solo su shell cuando queda una pestaña actualizada', async () => {
    const env = worker(), event = { data: { type: 'APP_VERSION_READY', version: '__BUILD_VERSION__' }, source: { id: 'tab-1' } }
    env.self.clients.matchAll.mockResolvedValueOnce([{ id: 'tab-1' }, { id: 'tab-2' }])
    await fire(env.handlers.message, event)
    expect(env.caches.delete).not.toHaveBeenCalled()
    await fire(env.handlers.message, event)
    expect(env.caches.delete).toHaveBeenCalledExactlyOnceWith(env.prefix + 'old')
    expect(env.caches.delete).not.toHaveBeenCalledWith('private-data')
  })
  it('cada ilustración existe y el HTML no lleva sus base64 en el inicio', () => {
    const html = readFileSync(resolve('Crash_Solution_Publicacion/index.html'), 'utf8')
    const paths = [...html.matchAll(/\.\/vehicle-assets\/[a-z0-9.-]+/g)].map(match => match[0])
    expect(new Set(paths).size).toBe(4)
    for (const path of paths) expect(existsSync(resolve('Crash_Solution_Publicacion/public', path))).toBe(true)
    expect(html).not.toMatch(/data:image\/(webp|svg\+xml);base64,[A-Za-z0-9+/=]{100}/)
  })
})
