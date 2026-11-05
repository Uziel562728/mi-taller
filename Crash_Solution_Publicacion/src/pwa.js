import { configureServiceWorker } from './lib/pwa-lifecycle.js'

export function showPwaUpdate(applyUpdate) {
  if (document.getElementById('pwaUpdateNotice')) return
  const notice = document.createElement('aside')
  notice.id = 'pwaUpdateNotice'
  notice.className = 'pwa-update-notice'
  notice.setAttribute('role', 'status')
  notice.innerHTML = '<p>Hay una nueva versión de Crash Solution. Se guardará el trabajo abierto antes de actualizar.</p><button type="button" class="button primary">Actualizar</button><span class="small" aria-live="polite"></span>'
  notice.querySelector('button').onclick = async event => {
    event.currentTarget.disabled = true
    try {
      if (await applyUpdate() === false) throw new Error('save-failed')
    } catch {
      notice.querySelector('span').textContent = 'No se pudo guardar o aplicar la actualización. Conservá un respaldo e intentá nuevamente.'
      notice.querySelector('button').disabled = false
    }
  }
  document.body.append(notice)
}

configureServiceWorker({
  isDev: import.meta.env.DEV, basePath: import.meta.env.BASE_URL,
  version: document.querySelector('meta[name="app-build-version"]')?.content,
  onUpdate: showPwaUpdate,
  beforeUpdate: () => window.preparePwaUpdate ? window.preparePwaUpdate() : false
})
  .catch(error => console.warn('PWA: no se pudo actualizar el service worker', error))
