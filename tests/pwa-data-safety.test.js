import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
const backend = vi.hoisted(() => ({ auth: { resetPasswordForEmail: vi.fn(async () => ({ error: null })), signUp: vi.fn(async () => ({ data: { user: { id: 'pwa-user' } }, error: null })) } }))
vi.mock('../Crash_Solution_Publicacion/src/lib/supabase.js', () => ({ supabase: backend, isSupabaseConfigured: true }))
import { appAuthState, preparePwaUpdate, resetAppRouter } from '../Crash_Solution_Publicacion/src/main.js'
import { setOfflineSessionOwner, getPendingSyncOperations, getOfflineJobsForScope } from '../Crash_Solution_Publicacion/src/lib/offline-sync.js'
import { loadNavigationState } from '../Crash_Solution_Publicacion/src/lib/navigation-state.js'
import { sendPasswordReset, signUpWithEmail } from '../Crash_Solution_Publicacion/src/lib/auth.js'
import { showPwaUpdate } from '../Crash_Solution_Publicacion/src/pwa.js'

beforeEach(() => {
  localStorage.clear(); resetAppRouter(); vi.clearAllMocks()
  document.body.innerHTML = '<main><section id="workScreen"></section><section id="adminScreen" hidden></section><section id="profileScreen" hidden></section><section id="stockScreen" hidden></section></main>'
  history.replaceState(null, '', '/mi-taller/#/trabajos/job-pwa/inspection')
  setOfflineSessionOwner('pwa-user')
  Object.assign(appAuthState, { user: { id: 'pwa-user' }, activeWorkshopId: 'pwa-workshop', memberships: [{ workshop_id: 'pwa-workshop', role: 'owner' }] })
  window.active = { id: 'job-pwa', rec: { cliente: 'Prueba PWA', patente: 'TEST123' }, generalNote: 'Trabajo pendiente', inspection: {}, quote: [], area: 'Motor' }
  window.step = 'inspection'; window.page = 2
  window.saveLocal = vi.fn(() => { localStorage.setItem('pwa-draft-test', JSON.stringify(window.active)); return true })
})
afterEach(() => { vi.unstubAllEnvs(); resetAppRouter(); setOfflineSessionOwner(null) })

describe('Actualización PWA y callbacks sin escrituras remotas', () => {
  it('persiste el borrador y el paso y mantiene idempotente la cola local antes de actualizar', async () => {
    expect(await preparePwaUpdate()).toBe(true)
    expect(await preparePwaUpdate()).toBe(true)
    const scope = { userId: 'pwa-user', workshopId: 'pwa-workshop' }
    expect((await getPendingSyncOperations(scope.userId, scope.workshopId)).filter(op => op.entityId === 'job-pwa')).toHaveLength(1)
    expect((await getOfflineJobsForScope(scope.userId, scope.workshopId)).find(job => job.id === 'job-pwa').generalNote).toBe('Trabajo pendiente')
    expect(loadNavigationState(scope)).toMatchObject({ step: 'inspection', page: 2, activeJobId: 'job-pwa' })
    expect(JSON.parse(localStorage.getItem('pwa-draft-test')).rec.patente).toBe('TEST123')
  })

  it('no actualiza si falla el guardado y conserva un borrador todavía incompleto', async () => {
    window.saveLocal.mockReturnValueOnce(false)
    expect(await preparePwaUpdate()).toBe(false)
    window.active.id = 'incomplete-pwa'; window.active.rec.patente = ''
    expect(await preparePwaUpdate()).toBe(true)
    expect(JSON.parse(localStorage.getItem('pwa-draft-test')).id).toBe('incomplete-pwa')
    expect((await getPendingSyncOperations('pwa-user', 'pwa-workshop')).some(op => op.entityId === 'incomplete-pwa')).toBe(false)
  })

  it('muestra una sola invitación a actualizar y conserva el control si falla el guardado', async () => {
    const apply = vi.fn(async () => false)
    showPwaUpdate(apply); showPwaUpdate(apply)
    expect(document.querySelectorAll('#pwaUpdateNotice')).toHaveLength(1)
    document.querySelector('#pwaUpdateNotice button').click()
    await vi.waitFor(() => expect(document.querySelector('#pwaUpdateNotice button').disabled).toBe(false))
    expect(document.getElementById('pwaUpdateNotice').textContent).toContain('No se pudo guardar')
  })

  it('registro y recuperación envían la URL de Pages, sin parámetros ni tokens heredados', async () => {
    vi.stubEnv('BASE_URL', '/mi-taller/')
    await sendPasswordReset('prueba@example.invalid')
    expect(backend.auth.resetPasswordForEmail).toHaveBeenCalledWith('prueba@example.invalid', { redirectTo: location.origin + '/mi-taller/#update-password' })
    await signUpWithEmail({ email: 'prueba@example.invalid', displayName: 'Prueba PWA', password: 'test-only-password', confirmPassword: 'test-only-password' })
    expect(backend.auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe(location.origin + '/mi-taller/')
  })
})
