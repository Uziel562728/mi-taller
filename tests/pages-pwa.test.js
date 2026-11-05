// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import config from '../vite.config.js'
import { applicationUrl } from '../Crash_Solution_Publicacion/src/lib/app-url.js'
import { buildInvitationRedirect } from '../Crash_Solution_Publicacion/src/lib/admin-service.js'
import { createAppRouter, readAppRoute } from '../Crash_Solution_Publicacion/src/lib/app-router.js'
import { JSDOM } from 'jsdom'

describe('Pages y compatibilidad de despliegue', () => {
  it.each([
    ['https://uziel562728.github.io/mi-taller/index.html?code=private#access_token=private', '/mi-taller/', 'https://uziel562728.github.io/mi-taller/'],
    ['https://crash-solution.vercel.app/admin?tracking=1#/admin', '/', 'https://crash-solution.vercel.app/'],
    ['http://localhost:5173/?tracking=1', '/', 'http://localhost:5173/']
  ])('mantiene callbacks limpios en %s', (href, base, expected) => {
    expect(applicationUrl({ href }, base)).toBe(expected)
    expect(buildInvitationRedirect({ href }, base)).toBe(expected + '#update-password')
  })

  it('versiona de nuevo el shell si cambia solo HTML, y separa raíz de Pages', () => {
    const plugin = config.plugins.find(plugin => plugin.name === 'copy-static-pwa-assets')
    const build = (html, base = '/') => {
      plugin.configResolved({ base })
      const files = {}, bundle = { 'index.html': { type: 'asset', source: html }, 'assets/app-12345678.js': { type: 'chunk', code: 'app()' } }
      plugin.generateBundle.handler.call({ emitFile: file => { files[file.fileName] = file.source } }, {}, bundle)
      return { ...files, html: bundle['index.html'].source }
    }
    const first = build('<head></head><p>Versión A</p>')
    expect(build('<head></head><p>Versión A</p>')['sw.js']).toBe(first['sw.js'])
    expect(build('<head></head><p>Versión B</p>')['sw.js']).not.toBe(first['sw.js'])
    expect(build('<head></head><p>Versión A</p>', '/mi-taller/')['sw.js']).not.toBe(first['sw.js'])
    expect(first.html).toContain(JSON.parse(first['precache-manifest.json']).version)
  })

  it('el manifiesto estable declara identidad, scope relativo e iconos con dimensiones reales', () => {
    const manifest = JSON.parse(readFileSync('Crash_Solution_Publicacion/public/manifest.webmanifest'))
    expect(manifest).toMatchObject({ name: 'Crash Solution', display: 'standalone', start_url: './', scope: './', id: './' })
    for (const size of [192, 512]) {
      const bytes = readFileSync(`Crash_Solution_Publicacion/icons/icon-${size}.png`)
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([size, size])
      expect(manifest.icons.some(icon => icon.sizes === `${size}x${size}`)).toBe(true)
    }
  })

  it('Atrás y Adelante conservan subcarpeta, hash y paso; una recarga interpreta la misma ruta', async () => {
    const page = new JSDOM('', { url: 'https://uziel562728.github.io/mi-taller/' })
    const render = vi.fn()
    const router = createAppRouter({ window: page.window, scope: () => 'u1:w1', render })
    try {
      await router.sync()
      await router.navigate({ name: 'work', jobId: 'job-1', step: 'inspection' })
      const workUrl = page.window.location.href
      await router.navigate({ name: 'stock' })
      page.window.history.back()
      await vi.waitFor(() => expect(page.window.location.href).toBe(workUrl))
      expect(readAppRoute(new URL(workUrl))).toEqual({ name: 'work', jobId: 'job-1', step: 'inspection' })
      page.window.history.forward()
      await vi.waitFor(() => expect(page.window.location.hash).toBe('#/stock'))
      expect(page.window.location.pathname).toBe('/mi-taller/')
    } finally { router.dispose(); page.window.close() }
  })

  it.each(['sb_secret_do_not_publish', 'eyJ0eXAiOiJKV1QifQ.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.fake'])('el control de Actions rechaza claves privadas sin imprimirlas', key => {
    let output
    try { execFileSync(process.execPath, ['scripts/validate-public-env.mjs'], { env: { ...process.env, VITE_SUPABASE_URL: 'https://project.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: key }, stdio: 'pipe' }) }
    catch (error) { output = String(error.stderr) }
    expect(output).toContain('No uses claves privadas')
    expect(output).not.toContain(key)
  })
})
