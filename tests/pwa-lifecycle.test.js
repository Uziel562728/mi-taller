import { describe, expect, it, vi } from 'vitest'
import { configureServiceWorker } from '../Crash_Solution_Publicacion/src/lib/pwa-lifecycle.js'

function environment(controlled = true) {
  const workerUrl = 'http://localhost:5173/sw.js'
  const unregister = vi.fn(async () => true)
  const unrelated = { scope: 'http://localhost:5173/other/', active: { scriptURL: 'http://localhost:5173/other/sw.js' }, unregister: vi.fn() }
  const serviceWorker = {
    controller: controlled ? { scriptURL: workerUrl } : null,
    getRegistrations: vi.fn(async () => [{ scope: 'http://localhost:5173/', active: { scriptURL: workerUrl }, unregister }, unrelated]),
    register: vi.fn(async () => ({}))
  }
  return {
    navigator: { serviceWorker },
    location: { href: 'http://localhost:5173/?utm_source=test', protocol: 'http:', hostname: 'localhost', reload: vi.fn() },
    caches: { keys: vi.fn(async () => ['crash-solution-shell-v3', 'other-app']), delete: vi.fn(async () => true) },
    unregister, unrelated
  }
}

describe('Service Worker y Vite', () => {
  it('registra Pages en su subcarpeta sin borrar cachés de otros proyectos', async () => {
    const env = environment(false)
    env.location = { href: 'https://uziel562728.github.io/mi-taller/?tracking=1#/stock', protocol: 'https:', hostname: 'uziel562728.github.io', reload: vi.fn() }
    await configureServiceWorker({ isDev: false, basePath: '/mi-taller/', ...env })
    expect(env.navigator.serviceWorker.register).toHaveBeenCalledWith('https://uziel562728.github.io/mi-taller/sw.js', { scope: 'https://uziel562728.github.io/mi-taller/', updateViaCache: 'none' })
    expect(env.caches.delete).not.toHaveBeenCalled()
  })

  it('la actualización espera a que se guarde y solo recarga una vez después de aceptar', async () => {
    const env = environment(), listeners = {}, onUpdate = vi.fn(), beforeUpdate = vi.fn(async () => true)
    const waiting = { postMessage: vi.fn() }
    const registration = { waiting, update: vi.fn(), addEventListener: vi.fn() }
    env.navigator.serviceWorker.register.mockResolvedValue(registration)
    env.navigator.serviceWorker.addEventListener = (name, handler) => { listeners[name] = handler }
    env.navigator.serviceWorker.controller.postMessage = vi.fn()
    const pending = localStorage.getItem('pending-jobs')
    await configureServiceWorker({ isDev: false, version: 'v2', onUpdate, beforeUpdate, ...env })
    expect(onUpdate).toHaveBeenCalled()
    expect(waiting.postMessage).not.toHaveBeenCalled()
    expect(env.location.reload).not.toHaveBeenCalled()
    await onUpdate.mock.calls[0][0]()
    expect(beforeUpdate).toHaveBeenCalledOnce()
    expect(waiting.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'ACTIVATE_UPDATE' })
    listeners.controllerchange(); listeners.controllerchange()
    expect(env.location.reload).toHaveBeenCalledOnce()
    expect(localStorage.getItem('pending-jobs')).toBe(pending)
  })

  it('un fallo de guardado impide activar y recargar; otra pestaña no recarga automáticamente', async () => {
    const env = environment(), listeners = {}, onUpdate = vi.fn()
    const waiting = { postMessage: vi.fn() }
    env.navigator.serviceWorker.register.mockResolvedValue({ waiting })
    env.navigator.serviceWorker.addEventListener = (name, handler) => { listeners[name] = handler }
    const result = await configureServiceWorker({ isDev: false, onUpdate, beforeUpdate: async () => false, ...env })
    expect(await result.applyUpdate()).toBe(false)
    expect(waiting.postMessage).not.toHaveBeenCalled()
    listeners.controllerchange()
    expect(env.location.reload).not.toHaveBeenCalled()
    expect(onUpdate).toHaveBeenCalled()
  })

  it('en desarrollo retira el worker anterior, borra solo el app shell y libera el documento controlado', async () => {
    const env = environment()
    localStorage.setItem('pending-jobs', 'conservar')
    await configureServiceWorker({ isDev: true, ...env })
    expect(env.unregister).toHaveBeenCalledOnce()
    expect(env.unrelated.unregister).not.toHaveBeenCalled()
    expect(env.caches.delete).toHaveBeenCalledExactlyOnceWith('crash-solution-shell-v3')
    expect(env.navigator.serviceWorker.register).not.toHaveBeenCalled()
    expect(env.location.reload).toHaveBeenCalledOnce()
    expect(localStorage.getItem('pending-jobs')).toBe('conservar')
  })

  it('con una página libre del worker no vuelve a recargar ni registra otro en desarrollo', async () => {
    const env = environment(false)
    await configureServiceWorker({ isDev: true, ...env })
    expect(env.location.reload).not.toHaveBeenCalled()
    expect(env.navigator.serviceWorker.register).not.toHaveBeenCalled()
  })

  it('mantiene el worker offline en producción y evita cachear su actualización', async () => {
    const env = environment(false)
    await configureServiceWorker({ isDev: false, ...env })
    expect(env.navigator.serviceWorker.register).toHaveBeenCalledWith('http://localhost:5173/sw.js', {
      scope: 'http://localhost:5173/', updateViaCache: 'none'
    })
    expect(env.unregister).not.toHaveBeenCalled()
    expect(env.caches.delete).not.toHaveBeenCalled()
  })
})
