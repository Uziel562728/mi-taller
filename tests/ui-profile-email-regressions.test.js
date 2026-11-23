import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function makeTestJwt({ sub, email, exp = Math.floor(Date.now() / 1000) + 3600, role = 'authenticated' }) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ sub, email, exp, role })).toString('base64url')
  return `${header}.${payload}.sig-${sub}`
}

const mockState = vi.hoisted(() => {
  const users = new Map()
  const workshops = new Map()
  const memberships = []
  let activeSession = null
  let callbacks = []
  let updateUserImpl = null
  let verifyOtpImpl = null
  let exchangeCodeImpl = null
  let setSessionImpl = null
  let getUserImpl = null
  let signOutImpl = null

  const reset = () => {
    users.clear()
    workshops.clear()
    memberships.length = 0
    activeSession = null
    callbacks = []
    updateUserImpl = null
    verifyOtpImpl = null
    exchangeCodeImpl = null
    setSessionImpl = null
    getUserImpl = null
    signOutImpl = null

    users.set('u1', {
      id: 'u1',
      email: 'carlos@tallercentral.com',
      new_email: null,
      user_metadata: { display_name: 'Carlos Gómez', phone: '11 5555 1234' }
    })
    users.set('u2', {
      id: 'u2',
      email: 'ana@tallernorte.com',
      new_email: null,
      user_metadata: { display_name: 'Ana Ruiz', phone: '11 4444 9876' }
    })

    workshops.set('w1', {
      id: 'w1',
      name: 'Taller Central',
      legal_name: 'Taller Central S.R.L.',
      tax_id: '30-71234567-9',
      logo_path: 'w1/logo-central.png',
      logo_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    })
    workshops.set('w2', {
      id: 'w2',
      name: 'Sucursal Norte',
      legal_name: 'Norte Chapa S.A.',
      tax_id: '30-79999999-1',
      logo_path: 'w2/logo-norte.png',
      logo_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQzwAEjDAGACcBAv8B93lMAAAAAElFTkSuQmCC'
    })
    workshops.set('w3', {
      id: 'w3',
      name: 'Taller Sin Logo',
      legal_name: '',
      tax_id: '',
      logo_path: '',
      logo_url: ''
    })

    memberships.push(
      { workshop_id: 'w1', user_id: 'u1', role: 'owner' },
      { workshop_id: 'w2', user_id: 'u1', role: 'admin' },
      { workshop_id: 'w3', user_id: 'u2', role: 'owner' }
    )
  }

  return {
    users,
    workshops,
    memberships,
    reset,
    getActiveSession: () => activeSession,
    setActiveSession: s => {
      activeSession = s
    },
    getCallbacks: () => callbacks,
    addCallback: cb => callbacks.push(cb),
    setUpdateUserImpl: fn => {
      updateUserImpl = fn
    },
    getUpdateUserImpl: () => updateUserImpl,
    setVerifyOtpImpl: fn => {
      verifyOtpImpl = fn
    },
    getVerifyOtpImpl: () => verifyOtpImpl,
    setExchangeCodeImpl: fn => {
      exchangeCodeImpl = fn
    },
    getExchangeCodeImpl: () => exchangeCodeImpl,
    setSetSessionImpl: fn => {
      setSessionImpl = fn
    },
    getSetSessionImpl: () => setSessionImpl,
    setGetUserImpl: fn => {
      getUserImpl = fn
    },
    getGetUserImpl: () => getUserImpl,
    setSignOutImpl: fn => {
      signOutImpl = fn
    },
    getSignOutImpl: () => signOutImpl
  }
})

const backend = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(async () => ({
      data: { session: mockState.getActiveSession() },
      error: null
    })),
    getUser: vi.fn(async jwt => {
      const custom = mockState.getGetUserImpl()
      if (custom) return custom(jwt)
      const active = mockState.getActiveSession()
      if (active?.user) return { data: { user: active.user }, error: null }
      return { data: { user: null }, error: { message: 'No session' } }
    }),
    setSession: vi.fn(async args => {
      const custom = mockState.getSetSessionImpl()
      if (custom) return custom(args)
      return { data: { session: mockState.getActiveSession(), user: mockState.getActiveSession()?.user || null }, error: null }
    }),
    verifyOtp: vi.fn(async args => {
      const custom = mockState.getVerifyOtpImpl()
      if (custom) return custom(args)
      return { data: { session: null, user: null }, error: { message: 'Token has expired or is invalid', code: 'otp_expired' } }
    }),
    exchangeCodeForSession: vi.fn(async code => {
      const custom = mockState.getExchangeCodeImpl()
      if (custom) return custom(code)
      return { data: { session: null, user: null }, error: { message: 'Code invalid', code: 'otp_expired' } }
    }),
    updateUser: vi.fn(async (attrs, opts) => {
      const custom = mockState.getUpdateUserImpl()
      if (custom) return custom(attrs, opts)
      const session = mockState.getActiveSession()
      if (!session?.user?.id) {
        return { data: { user: null }, error: { message: 'Auth session missing!' } }
      }
      const user = mockState.users.get(session.user.id)
      if (!user) return { data: { user: null }, error: { message: 'User not found' } }
      if (attrs.password) {
        return { data: { user: { ...user } }, error: null }
      }
      if (attrs.email) {
        const nextEmail = String(attrs.email).trim().toLowerCase()
        const duplicate = Array.from(mockState.users.values()).find(
          u => u.id !== user.id && u.email.toLowerCase() === nextEmail
        )
        if (duplicate) {
          return {
            data: { user: null },
            error: {
              code: 'email_exists',
              message: 'A user with this email address has already been registered'
            }
          }
        }
        // Por defecto respeta confirmación de Supabase: mantiene email actual y marca new_email pendiente
        user.new_email = nextEmail
        const updatedUser = { ...user }
        mockState.setActiveSession({ ...session, user: updatedUser })
        return { data: { user: updatedUser }, error: null }
      }
      return { data: { user: { ...user } }, error: null }
    }),
    signOut: vi.fn(async () => {
      const custom = mockState.getSignOutImpl()
      if (custom) return custom()
      mockState.setActiveSession(null)
      return { error: null }
    }),
    onAuthStateChange: vi.fn(cb => {
      mockState.addCallback(cb)
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
  },
  storage: {
    from: vi.fn(() => ({
      download: vi.fn(async path => {
        const wsId = String(path || '').split('/')[0]
        const ws = mockState.workshops.get(wsId)
        if (!ws?.logo_url) return { data: null, error: new Error('Not found') }
        const base64Part = ws.logo_url.split(',')[1] || ''
        const bytes = Buffer.from(base64Part, 'base64')
        return { data: new Blob([bytes], { type: 'image/png' }), error: null }
      }),
      createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://example.com/signed.png' }, error: null }))
    }))
  },
  from: vi.fn(table => {
    const filters = {}
    let op = 'select'
    let payload = null
    const builder = {
      select: () => builder,
      eq: (col, val) => {
        filters[col] = val
        return builder
      },
      order: () => builder,
      range: async () => ({ data: [], error: null }),
      single: async () => {
        if (table === 'user_profiles' && op === 'update') {
          const u = mockState.users.get(filters.user_id)
          if (u) {
            u.user_metadata = { ...u.user_metadata, ...payload }
            return {
              data: { user_id: u.id, display_name: u.user_metadata.display_name, phone: u.user_metadata.phone },
              error: null
            }
          }
        }
        return { data: null, error: null }
      },
      maybeSingle: async () => {
        if (table === 'user_profiles') {
          const u = mockState.users.get(filters.user_id)
          if (!u) return { data: null, error: null }
          return {
            data: {
              user_id: u.id,
              display_name: u.user_metadata?.display_name || u.email,
              phone: u.user_metadata?.phone || null
            },
            error: null
          }
        }
        if (table === 'workshops') {
          const ws = mockState.workshops.get(filters.id)
          return { data: ws ? { ...ws } : null, error: null }
        }
        return { data: null, error: null }
      },
      update: val => {
        op = 'update'
        payload = val
        return builder
      },
      upsert: () => builder,
      then: (res, rej) => {
        if (table === 'workshop_members') {
          const rows = mockState.memberships
            .filter(m => !filters.user_id || m.user_id === filters.user_id)
            .map(m => ({
              workshop_id: m.workshop_id,
              user_id: m.user_id,
              role: m.role,
              workshops: mockState.workshops.get(m.workshop_id)
            }))
          return Promise.resolve({ data: rows, error: null }).then(res, rej)
        }
        return Promise.resolve({ data: [], error: null }).then(res, rej)
      }
    }
    return builder
  })
}))

vi.mock('../Crash_Solution_Publicacion/src/lib/supabase.js', () => ({
  supabase: backend,
  isSupabaseConfigured: true
}))

import {
  appAuthState,
  initAuthAndAdmin,
  handleLogout,
  openMyProfile,
  openSettingsScreen,
  renderHeaderNavigation,
  renderHeaderBrand,
  switchActiveWorkshop,
  syncActiveWorkshopToLegacyStore,
  enforceRouteProtection,
  resetAppRouter,
  isErrorModalOpen,
  closeErrorModal
} from '../Crash_Solution_Publicacion/src/main.js'
import { requestUserEmailChange, validateEmailChange } from '../Crash_Solution_Publicacion/src/lib/auth.js'
import {
  parseAuthCallbackUrl,
  verifyEmailChangeCallback,
  clearPendingEmailChange
} from '../Crash_Solution_Publicacion/src/lib/auth-callback.js'
import { privateReadCache } from '../Crash_Solution_Publicacion/src/lib/scoped-cache.js'

function mountRealHeaderAndScreens() {
  document.body.innerHTML = `
    <header class="app-header">
      <a class="brand" id="appHeaderBrand" data-brand-mode="generic" href="#">
        <span class="brand-mark" id="headerBrandMark" data-brand-mode="generic" aria-hidden="true">ϟ</span>
        <span class="brand-copy" id="headerBrandCopy">CRASH SOLUTION<small>MiTallerAPP</small></span>
      </a>
      <div id="headerAuthNav" class="header-nav" hidden></div>
      <div class="header-tools" hidden></div>
    </header>
    <section id="authScreen"></section>
    <main class="container" id="mainAppContainer" hidden>
      <div id="notice" class="notice" role="alert" hidden></div>
      <section id="jobsScreen"></section>
      <section id="workScreen" hidden></section>
      <section id="stockScreen" hidden></section>
      <section id="profileScreen" hidden></section>
      <section id="adminScreen" hidden></section>
      <section id="settingsScreen" hidden></section>
    </main>
    <div id="toast" hidden></div>
    <section id="printDocument" class="print-document"></section>
  `
}

function loginAsUser(userId, workshopId = 'w1') {
  const userObj = mockState.users.get(userId)
  const session = {
    access_token: makeTestJwt({ sub: userId, email: userObj.email }),
    refresh_token: `ref-${userId}`,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { ...userObj }
  }
  mockState.setActiveSession(session)

  const userMemberships = mockState.memberships
    .filter(m => m.user_id === userId)
    .map(m => ({
      workshop_id: m.workshop_id,
      role: m.role,
      workshop: { ...mockState.workshops.get(m.workshop_id) }
    }))

  const activeWs = userMemberships.find(m => m.workshop_id === workshopId)?.workshop || userMemberships[0]?.workshop || null

  Object.assign(appAuthState, {
    session,
    user: { ...userObj },
    profile: { user_id: userId, display_name: userObj.user_metadata.display_name, phone: userObj.user_metadata.phone },
    memberships: userMemberships,
    activeWorkshopId: activeWs?.id || null,
    activeWorkshopProfile: activeWs ? { ...activeWs } : null,
    authMode: 'login',
    isSessionBootstrapped: true,
    unresolvedConflicts: [],
    pendingSyncCount: 0,
    passwordFlowContext: null
  })
  return session
}

beforeEach(() => {
  mockState.reset()
  resetAppRouter()
  privateReadCache.clear()
  clearPendingEmailChange()
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  history.replaceState(null, '', '/')
  mountRealHeaderAndScreens()

  window.scrollTo = vi.fn()
  window.toast = vi.fn()
  window.showJobs = vi.fn(() => {
    window.screen = 'jobs'
    document.getElementById('jobsScreen').hidden = false
  })
  window.renderJobs = vi.fn()
  window.store = { jobs: [{ id: 'job-1', rec: { cliente: 'Pedro', patente: 'AA 111 BB' } }], activeId: null, shop: {} }
  window.active = null

  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function () {
      this.setAttribute('open', '')
    }
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function () {
      this.removeAttribute('open')
    }
  })
})

afterEach(() => {
  closeErrorModal({ restoreFocus: false })
  document.getElementById('myProfileDialog')?.remove()
  window.__headerMenuController?.abort()
  vi.restoreAllMocks()
})

// ============================================================================
// ERROR 1 — Logo público en inicio y logo dinámico del taller activo
// ============================================================================
describe('ERROR 1 — Logo genérico en inicio y logo del taller activo sin parpadeos', () => {
  it('antes de iniciar sesión muestra solo el logo genérico de Crash Solution / MiTallerAPP y ningún dato de talleres', async () => {
    const html = readFileSync(resolve(process.cwd(), 'Crash_Solution_Publicacion/index.html'), 'utf8')
    expect(html).toContain('id="appHeaderBrand"')
    expect(html).toContain('data-brand-mode="generic"')
    expect(html).toContain('MiTallerAPP')
    expect(html).not.toContain('Taller Central')

    appAuthState.user = null
    appAuthState.session = null
    appAuthState.activeWorkshopId = 'w1' // Aunque quede un ID residual en localStorage
    localStorage.setItem('mitaller_active_workshop_id', 'w1')

    await enforceRouteProtection()

    const brand = document.getElementById('appHeaderBrand')
    const mark = document.getElementById('headerBrandMark')
    const authBrand = document.getElementById('authPublicBrand')
    const authScreen = document.getElementById('authScreen')

    expect(brand.getAttribute('data-brand-mode')).toBe('generic')
    expect(mark.querySelector('img')).toBeNull()
    expect(mark.textContent).toBe('ϟ')
    expect(document.getElementById('headerBrandCopy').textContent).toContain('CRASH SOLUTION')
    expect(document.getElementById('headerBrandCopy').textContent).toContain('MiTallerAPP')
    expect(authBrand).not.toBeNull()
    expect(authBrand.textContent).toContain('Crash Solution')
    expect(authBrand.textContent).toContain('MiTallerAPP')
    expect(authScreen.textContent).not.toContain('Taller Central')
    expect(authScreen.textContent).not.toContain('Sucursal Norte')
    expect(authScreen.querySelector('#headerWorkshopLogo')).toBeNull()
  })

  it('después de iniciar sesión muestra el logo del taller activo y lo actualiza al cambiar de taller', async () => {
    loginAsUser('u1', 'w1')
    renderHeaderNavigation()

    const logoW1 = document.getElementById('headerWorkshopLogo')
    expect(logoW1).not.toBeNull()
    expect(logoW1.getAttribute('src')).toBe(mockState.workshops.get('w1').logo_url)
    expect(document.getElementById('appHeaderBrand').getAttribute('data-workshop-id')).toBe('w1')
    expect(document.getElementById('headerBrandCopy').textContent).toContain('TALLER CENTRAL')

    await switchActiveWorkshop('w2')

    const logoW2 = document.getElementById('headerWorkshopLogo')
    expect(logoW2).not.toBeNull()
    expect(logoW2.getAttribute('src')).toBe(mockState.workshops.get('w2').logo_url)
    expect(document.getElementById('appHeaderBrand').getAttribute('data-workshop-id')).toBe('w2')
    expect(document.getElementById('headerBrandCopy').textContent).toContain('SUCURSAL NORTE')
  })

  it('evita flash del logo del taller anterior al cerrar sesión, expirar sesión o cambiar de cuenta', async () => {
    loginAsUser('u1', 'w1')
    renderHeaderNavigation()
    expect(document.getElementById('headerWorkshopLogo')?.getAttribute('src')).toBe(
      mockState.workshops.get('w1').logo_url
    )

    // Simular signOut lento para comprobar que el logo desaparece INMEDIATAMENTE al iniciar logout
    let resolveSignOut
    mockState.setSignOutImpl(
      () =>
        new Promise(resolve => {
          resolveSignOut = () => {
            mockState.setActiveSession(null)
            resolve({ error: null })
          }
        })
    )

    const logoutPromise = handleLogout()
    // En el tick inmediato antes de resolver signOut, el logo del taller ya fue retirado
    await vi.waitFor(() => {
      expect(document.getElementById('headerWorkshopLogo')).toBeNull()
      expect(document.getElementById('appHeaderBrand').getAttribute('data-brand-mode')).toBe('generic')
    })

    resolveSignOut()
    await logoutPromise

    expect(document.getElementById('headerWorkshopLogo')).toBeNull()
    expect(document.getElementById('appHeaderBrand').getAttribute('data-brand-mode')).toBe('generic')
    expect(localStorage.getItem('mitaller_active_workshop_id')).toBeNull()
    expect(document.getElementById('authScreen').hidden).toBe(false)
    expect(document.getElementById('authPublicBrand')).not.toBeNull()

    // Cambiar de cuenta a u2 (Taller Sin Logo) no debe reintroducir el logo de u1 ni dejar un async rezagado
    loginAsUser('u1', 'w1')
    renderHeaderNavigation()
    const staleSync = syncActiveWorkshopToLegacyStore()
    loginAsUser('u2', 'w3')
    renderHeaderNavigation()
    await staleSync

    expect(document.getElementById('headerWorkshopLogo')).toBeNull()
    expect(document.getElementById('appHeaderBrand').getAttribute('data-workshop-id')).toBe('w3')
    expect(document.getElementById('headerBrandCopy').textContent).toContain('TALLER SIN LOGO')
  })

  it('mantiene diseño responsive para logo en encabezado y pantalla de login en escritorio y celular', () => {
    const css = readFileSync(resolve(process.cwd(), 'Crash_Solution_Publicacion/src/styles.css'), 'utf8')
    expect(css).toContain('.brand-mark.has-workshop-logo')
    expect(css).toContain('.brand-logo-img')
    expect(css).toContain('.auth-public-brand')
    expect(css).toContain('max-width: calc(100vw - 140px)')

    // Simular ancho móvil 390px y escritorio 1280px sin errores de renderizado
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 390 })
    loginAsUser('u1', 'w1')
    renderHeaderBrand()
    expect(document.getElementById('headerWorkshopLogo')).not.toBeNull()
  })
})

// ============================================================================
// ERROR 2 — Cerrar popup de Editar perfil haciendo clic/toque afuera
// ============================================================================
describe('ERROR 2 — Cierre del popup de Editar perfil al hacer clic o tocar afuera', () => {
  it('cierra el popup al hacer clic o tocar el backdrop sin cerrar sesión ni modificar datos', () => {
    loginAsUser('u1', 'w1')
    renderHeaderNavigation()
    openMyProfile()

    const dialog = document.getElementById('myProfileDialog')
    expect(dialog).not.toBeNull()
    expect(dialog.getAttribute('aria-modal')).toBe('true')

    // Simular bounding rect de diálogo contenido en el centro y clic por fuera (en el backdrop)
    const content = document.getElementById('myProfileDialogContent')
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 60,
      right: 760,
      bottom: 620,
      width: 660,
      height: 560
    })

    dialog.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 20 }))
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 20, clientY: 20 }))

    expect(document.getElementById('myProfileDialog')).toBeNull()
    expect(appAuthState.user?.id).toBe('u1')
    expect(appAuthState.profile?.display_name).toBe('Carlos Gómez')
    expect(backend.auth.signOut).not.toHaveBeenCalled()
  })

  it('NO cierra el popup al hacer clic dentro de sus campos o al arrastrar desde un campo hacia afuera', () => {
    loginAsUser('u1', 'w1')
    openMyProfile()

    const dialog = document.getElementById('myProfileDialog')
    const content = document.getElementById('myProfileDialogContent')
    const nameInput = document.getElementById('personalName')

    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 60,
      right: 760,
      bottom: 620,
      width: 660,
      height: 560
    })

    document.getElementById('editPersonalProfileBtn').click()

    // Clic dentro del input
    nameInput.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 400, clientY: 320 }))
    nameInput.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 400, clientY: 320 }))
    expect(document.getElementById('myProfileDialog')).not.toBeNull()

    // Arrastre que comienza dentro de un campo y suelta sobre el backdrop
    nameInput.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 400, clientY: 320 }))
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 15, clientY: 15 }))
    expect(document.getElementById('myProfileDialog')).not.toBeNull()
  })

  it('solicita confirmación si hay cambios sin guardar al tocar afuera y conserva el botón Volver y Escape', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    loginAsUser('u1', 'w1')
    renderHeaderNavigation()
    openMyProfile()

    const dialog = document.getElementById('myProfileDialog')
    const content = document.getElementById('myProfileDialogContent')
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 40,
      right: 380,
      bottom: 680,
      width: 370,
      height: 640
    })

    document.getElementById('editPersonalProfileBtn').click()
    document.getElementById('personalName').value = 'Carlos Modificado'

    // 1. Usuario cancela el descarte -> mantiene popup abierto y cambio pendiente
    confirmSpy.mockReturnValueOnce(false)
    dialog.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 5, clientY: 5 }))
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }))
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(document.getElementById('myProfileDialog')).not.toBeNull()
    expect(document.getElementById('personalName').value).toBe('Carlos Modificado')

    // 2. Usuario confirma el descarte -> cierra sin guardar ni cerrar sesión
    confirmSpy.mockReturnValueOnce(true)
    dialog.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 5, clientY: 5 }))
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }))
    expect(confirmSpy).toHaveBeenCalledTimes(2)
    expect(document.getElementById('myProfileDialog')).toBeNull()
    expect(appAuthState.profile.display_name).toBe('Carlos Gómez')

    // 3. Reabrir y verificar botón Volver y tecla Escape
    openMyProfile()
    document.getElementById('myProfileDialog').dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(document.getElementById('myProfileDialog')).toBeNull()

    openMyProfile()
    document.getElementById('backFromMyProfileBtn').click()
    expect(document.getElementById('myProfileDialog')).toBeNull()
  })
})

// ============================================================================
// ERROR 3 — Configuración sin texto superior y cambio seguro de email
// ============================================================================
describe('ERROR 3 — Configuración y cambio seguro de correo electrónico con Supabase Auth', () => {
  it('elimina únicamente el texto informativo superior de Configuración y conserva el formulario de contraseña y la nueva opción de email', async () => {
    loginAsUser('u1', 'w1')
    await openSettingsScreen()

    const settingsScreen = document.getElementById('settingsScreen')
    expect(settingsScreen.hidden).toBe(false)
    expect(settingsScreen.querySelector('h1')?.textContent).toBe('Configuración')
    expect(settingsScreen.textContent).not.toContain(
      'Seguridad de tu cuenta, cambio de contraseña, parámetros operativos del taller y copias de respaldo.'
    )

    // Conserva el formulario normal de cambio de contraseña
    expect(document.getElementById('settingsPasswordForm')).not.toBeNull()
    expect(document.getElementById('settingsNewPassword')).not.toBeNull()
    expect(document.getElementById('settingsConfirmPassword')).not.toBeNull()

    // Agrega la opción «Cambiar correo electrónico» con el correo actual
    expect(settingsScreen.textContent).toContain('Cambiar correo electrónico')
    expect(document.getElementById('settingsCurrentEmail')?.textContent).toBe('carlos@tallercentral.com')
    expect(document.getElementById('settingsEmailForm')).not.toBeNull()
    expect(document.getElementById('settingsNewEmail')).not.toBeNull()

    // El cambio de contraseña sigue funcionando normalmente
    document.getElementById('settingsNewPassword').value = 'NuevaClave2026!'
    document.getElementById('settingsConfirmPassword').value = 'NuevaClave2026!'
    document.getElementById('settingsPasswordForm').dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => {
      expect(backend.auth.updateUser).toHaveBeenCalledWith({ password: 'NuevaClave2026!' })
      expect(document.getElementById('settingsAlertBox').textContent).toContain('Contraseña actualizada con éxito')
    })
  })

  it('valida formato y correo distinto al actual y muestra errores en el popup existente (#appErrorModal)', async () => {
    loginAsUser('u1', 'w1')
    await openSettingsScreen()

    expect(validateEmailChange('', 'carlos@tallercentral.com').valid).toBe(false)
    expect(validateEmailChange('correo-invalido', 'carlos@tallercentral.com').valid).toBe(false)
    expect(validateEmailChange('CARLOS@tallercentral.com', 'carlos@tallercentral.com').valid).toBe(false)

    // Formato inválido en el formulario DOM
    document.getElementById('settingsNewEmail').value = 'sin-arroba'
    document.getElementById('settingsEmailForm').dispatchEvent(new Event('submit', { cancelable: true }))

    await vi.waitFor(() => {
      expect(isErrorModalOpen()).toBe(true)
      expect(document.getElementById('appErrorModalMessage').textContent).toContain('formato del correo')
      expect(document.getElementById('settingsNewEmail').classList.contains('input-field-error')).toBe(true)
    })
    expect(backend.auth.updateUser).not.toHaveBeenCalled()
    closeErrorModal({ restoreFocus: false })

    // Mismo correo que el actual
    document.getElementById('settingsNewEmail').value = 'carlos@tallercentral.com'
    document.getElementById('settingsEmailForm').dispatchEvent(new Event('submit', { cancelable: true }))

    await vi.waitFor(() => {
      expect(isErrorModalOpen()).toBe(true)
      expect(document.getElementById('appErrorModalMessage').textContent).toContain('diferente a tu correo actual')
    })
    expect(backend.auth.updateUser).not.toHaveBeenCalled()
  })

  it('usa el flujo seguro updateUser({ email }), respeta confirmación por correo, conserva talleres/roles/trabajos y NO afirma cambio antes de confirmar', async () => {
    loginAsUser('u1', 'w1')
    await openSettingsScreen()

    const jobsBefore = [...window.store.jobs]
    const membershipsBefore = [...appAuthState.memberships]

    document.getElementById('settingsNewEmail').value = 'nuevo.carlos@tallercentral.com'
    document.getElementById('settingsEmailForm').dispatchEvent(new Event('submit', { cancelable: true }))

    await vi.waitFor(() => {
      expect(backend.auth.updateUser).toHaveBeenCalledWith(
        { email: 'nuevo.carlos@tallercentral.com' },
        expect.objectContaining({ emailRedirectTo: expect.any(String) })
      )
      expect(document.getElementById('settingsPendingEmailNotice')).not.toBeNull()
    })

    // No afirma que el correo ya cambió; informa que debe verificarlo y mantiene el correo actual vigente
    const alertBox = document.getElementById('settingsAlertBox')
    expect(alertBox.className).toContain('info')
    expect(alertBox.textContent).toContain('verificación')
    expect(alertBox.textContent).toContain('seguirá vigente hasta que confirmes')
    expect(alertBox.textContent).not.toContain('fue actualizado y confirmado')
    expect(document.getElementById('settingsCurrentEmail').textContent).toBe('carlos@tallercentral.com')
    expect(appAuthState.user.id).toBe('u1')
    expect(appAuthState.memberships).toEqual(membershipsBefore)
    expect(window.store.jobs).toEqual(jobsBefore)
  })

  it('maneja correo duplicado en el popup existente sin modificar la cuenta ni cerrar sesión', async () => {
    loginAsUser('u1', 'w1')
    await openSettingsScreen()

    document.getElementById('settingsNewEmail').value = 'ana@tallernorte.com'
    document.getElementById('settingsEmailForm').dispatchEvent(new Event('submit', { cancelable: true }))

    await vi.waitFor(() => {
      expect(isErrorModalOpen()).toBe(true)
      expect(document.getElementById('appErrorModalMessage').textContent).toContain('Ya existe una cuenta registrada')
    })

    expect(appAuthState.user.email).toBe('carlos@tallercentral.com')
    expect(appAuthState.user.id).toBe('u1')
    expect(document.getElementById('settingsCurrentEmail').textContent).toBe('carlos@tallercentral.com')
  })

  it('maneja enlace vencido, confirmación parcial (doble confirmación) y confirmación final al volver desde el correo', async () => {
    // 1. Enlace vencido en URL -> muestra error en el popup existente y conserva sesión/correo
    loginAsUser('u1', 'w1')
    const expiredParsed = parseAuthCallbackUrl({
      search: '',
      hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    })
    const expiredCheck = await verifyEmailChangeCallback({
      supabaseClient: backend,
      callbackInfo: expiredParsed,
      currentSession: mockState.getActiveSession()
    })
    expect(expiredCheck.ok).toBe(false)
    expect(expiredCheck.error).toContain('expiró')
    expect(expiredCheck.error).toContain('no fue modificado')

    // Simular retorno en initAuthAndAdmin con error de enlace vencido
    sessionStorage.setItem(
      'mitaller_pending_email_change_v1',
      JSON.stringify({ userId: 'u1', currentEmail: 'carlos@tallercentral.com', newEmail: 'nuevo@taller.com' })
    )
    history.replaceState(
      null,
      '',
      '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    )
    await initAuthAndAdmin()

    await vi.waitFor(() => {
      expect(document.getElementById('settingsScreen').hidden).toBe(false)
      expect(isErrorModalOpen()).toBe(true)
      expect(document.getElementById('appErrorModalMessage').textContent).toContain('expiró')
    })
    expect(appAuthState.user.email).toBe('carlos@tallercentral.com')
    expect(appAuthState.memberships).toHaveLength(2)
    closeErrorModal({ restoreFocus: false })

    // 2. Primer enlace de doble confirmación -> informa que falta el segundo enlace, sin afirmar cambio definitivo
    const partialParsed = parseAuthCallbackUrl({
      search: '',
      hash: '#message=Confirmation+link+accepted.+Please+proceed+to+confirm+link+sent+to+the+other+email'
    })
    expect(partialParsed.isEmailChangeFlow).toBe(true)
    const partialCheck = await verifyEmailChangeCallback({
      supabaseClient: backend,
      callbackInfo: partialParsed,
      currentSession: mockState.getActiveSession()
    })
    expect(partialCheck.ok).toBe(true)
    expect(partialCheck.confirmed).toBe(false)
    expect(partialCheck.requiresSecondConfirmation).toBe(true)

    // 3. Confirmación final por token_hash type=email_change -> actualiza solo el correo del mismo usuario
    mockState.setVerifyOtpImpl(async ({ token_hash, type }) => {
      expect(type).toBe('email_change')
      expect(token_hash).toBe('valid-email-change-hash')
      const u = mockState.users.get('u1')
      u.email = 'nuevo@taller.com'
      u.new_email = null
      const nextSession = {
        access_token: makeTestJwt({ sub: 'u1', email: u.email }),
        refresh_token: 'ref-u1-new',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { ...u }
      }
      mockState.setActiveSession(nextSession)
      return { data: { session: nextSession, user: nextSession.user }, error: null }
    })

    resetAppRouter()
    history.replaceState(null, '', '/?token_hash=valid-email-change-hash&type=email_change')
    await initAuthAndAdmin()

    await vi.waitFor(() => {
      expect(document.getElementById('settingsScreen').hidden).toBe(false)
      expect(document.getElementById('settingsCurrentEmail')?.textContent).toBe('nuevo@taller.com')
      expect(document.getElementById('settingsAlertBox')?.textContent).toContain('confirmado y actualizado')
    })
    expect(appAuthState.user.id).toBe('u1')
    expect(appAuthState.memberships.map(m => `${m.workshop_id}:${m.role}`)).toEqual(['w1:owner', 'w2:admin'])
  })

  it('bloquea confirmación de email si el token pertenece a otro usuario y no altera otras cuentas', async () => {
    loginAsUser('u1', 'w1')
    const foreignToken = makeTestJwt({ sub: 'u2', email: 'ana@tallernorte.com' })
    const parsed = parseAuthCallbackUrl({
      search: '',
      hash: `#access_token=${foreignToken}&refresh_token=ref-u2&type=email_change`
    })
    const check = await verifyEmailChangeCallback({
      supabaseClient: backend,
      callbackInfo: parsed,
      currentSession: mockState.getActiveSession()
    })
    expect(check.ok).toBe(false)
    expect(check.blocked).toBe(true)
    expect(check.errorCode).toBe('IDENTITY_MISMATCH')
    expect(mockState.users.get('u2').email).toBe('ana@tallernorte.com')
  })

  it('requestUserEmailChange falla de forma segura si la sesión expiró', async () => {
    mockState.setActiveSession({
      access_token: 'expired',
      expires_at: 1,
      user: { id: 'u1', email: 'carlos@tallercentral.com' }
    })
    await expect(
      requestUserEmailChange('nuevo@taller.com', { client: backend, expectedUserId: 'u1' })
    ).rejects.toThrow('sesión expiró')
    expect(backend.auth.updateUser).not.toHaveBeenCalled()
  })
})
