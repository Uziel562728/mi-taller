import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.argv[2] || '/'
const html = readFileSync('dist/index.html', 'utf8')
const manifest = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'))
const precache = JSON.parse(readFileSync('dist/precache-manifest.json', 'utf8'))
const worker = readFileSync('dist/sw.js', 'utf8')
const site = new URL(base, 'https://example.invalid')
const manifestUrl = new URL('manifest.webmanifest', site)
assert(html.includes(`<base href="${base}">`), 'Base incorrecta')
assert(html.includes(`rel="manifest" href="${base}manifest.webmanifest"`), 'Manifiesto fuera de su ruta estable')
assert.equal(manifest.name, 'Crash Solution')
assert.equal(manifest.display, 'standalone')
for (const property of ['id', 'start_url', 'scope']) assert.equal(new URL(manifest[property], manifestUrl).href, site.href)
for (const icon of manifest.icons) {
  const url = new URL(icon.src, manifestUrl)
  assert(url.pathname.startsWith(base), 'Icono fuera del scope')
  const bytes = readFileSync(resolve('dist', url.pathname.slice(base.length)))
  assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes)
}
assert(manifest.icons.some(icon => icon.sizes === '192x192'))
assert(manifest.icons.some(icon => icon.sizes === '512x512'))
assert(html.includes(`<meta name="app-build-version" content="${precache.version}">`))
assert(worker.includes(`const BUILD_VERSION = '${precache.version}'`))
assert(!worker.includes('__BUILD_VERSION__'))
for (const asset of precache.assets) assert(existsSync(resolve('dist', asset)), `Recurso offline ausente: ${asset}`)
for (const match of html.matchAll(/<(?:link|script|img)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
  const target = match[1]
  if (target.includes('${') || target.startsWith('data:')) continue
  const url = new URL(target, site)
  if (url.origin !== site.origin) continue
  assert(url.pathname.startsWith(base), `Recurso fuera de la base: ${target}`)
  assert(existsSync(resolve('dist', url.pathname.slice(base.length))), `Recurso ausente: ${target}`)
}
console.log(`PWA válida bajo ${base}: manifiesto, iconos, recursos y versión ${precache.version}.`)
