import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Helper para construir un JWT de prueba con payload real base64url (header.payload.sig)
function makeTestJwt({ sub, email, exp = Math.floor(Date.now() / 1000) + 3600, role = 'authenticated' }) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ sub, email, exp, role })).toString('base64url')
  return `${header}.${payload}.test-signature-${sub}`
}

const mockServer = vi.hoisted(() => {
  const users = new Map()
  const workshops = new Map()
  const memberships = []
  let activeSession = null
  let authChangeCallbacks = []
  let failSetSession = false
  let ignoreSetSessionKeepOldUser = false
  let failVerifyOtp = false
  const updatedPasswordsByUser = []

  const reset = () => {
    users.clear()
    workshops.clear()
    memberships.length = 0
    activeSession = null
    authChangeCallbacks = []
    failSetSession = false
    ignoreSetSessionKeepOldUser = false
    failVerifyOtp = false
    updatedPasswordsByUser.length = 0

    // Usuario A: cuenta de demostración existente (prueba@gmail.com)
    users.set('user-a-prueba', {
      id: 'user-a-prueba',
      email: 'prueba@gmail.com',
      password: 'PasswordOriginalPrueba123!',
      user_metadata: { display_name: 'Edy Dueño' }
    })

    // Usuario B: nuevo usuario invitado al taller
    users.set('user-b-invitado', {
      id: 'user-b-invitado',
      email: 'invitado.nuevo@taller.invalid',
      password: null, // aún no activó su contraseña
      user_metadata: { display_name: 'Lucas Invitado', phone: '+54 9 11 5555-0199' }
    })

    // Usuario C: segundo usuario para pruebas de recuperación (CASO D)
    users.set('user-c-recuperacion', {
      id: 'user-c-recuperacion',
      email: 'mecanico.recuperar@taller.invalid',
      password: 'ClaveAnteriorMecanico1!',
      user_metadata: { display_name: 'Matías Mecánico' }
    })

    workshops.set('ws-demo', {
      id: 'ws-demo',
      name: 'Crash Solution',
      legal_name: 'Crash Solution Taller Integral S.R.L.'
    })
    workshops.set('ws-ajeno', {
      id: 'ws-ajeno',
      name: 'Taller Ajeno Norte',
      legal_name: 'Norte S.R.L.'
    })

    memberships.push(
      { workshop_id: 'ws-demo', user_id: 'user-a-prueba', role: 'owner' },
      { workshop_id: 'ws-demo', user_id: 'user-b-invitado', role: 'staff' },
      { workshop_id: 'ws-ajeno', user_id: 'user-c-recuperacion', role: 'admin' }
    )
  }

  return {
    users,
    workshops,
    memberships,
    updatedPasswordsByUser,
    reset,
    getActiveSession: () => activeSession,
    setActiveSession: s => {
      activeSession = s
    },
    setFailSetSession: v => {
      failSetSession = Boolean(v)
    },
    setIgnoreSetSessionKeepOldUser: v => {
      ignoreSetSessionKeepOldUser = Boolean(v)
    },
    setFailVerifyOtp: v => {
      failVerifyOtp = Boolean(v)
    },
    getFailSetSession: () => failSetSession,
    getIgnoreSetSessionKeepOldUser: () => ignoreSetSessionKeepOldUser,
    getFailVerifyOtp: () => failVerifyOtp,
    getCallbacks: () => authChangeCallbacks,
    addCallback: cb => authChangeCallbacks.push(cb)
  }
})

const backend = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(async () => ({
      data: { session: mockServer.getActiveSession() },
      error: null
    })),
    getUser: vi.fn(async jwt => {
      for (const u of mockServer.users.values()) {
        if (jwt && String(jwt).includes(u.id)) {
          return {
            data: { user: { id: u.id, email: u.email, user_metadata: u.user_metadata } },
            error: null
          }
        }
      }
      const cur = mockServer.getActiveSession()?.user
      if (cur) return { data: { user: cur }, error: null }
      return { data: { user: null }, error: { message: 'Invalid token', code: 'invalid_jwt' } }
    }),
    setSession: vi.fn(async ({ access_token, refresh_token }) => {
      if (mockServer.getFailSetSession()) {
        return {
          data: { session: null, user: null },
          error: { message: 'Email link is invalid or has expired', code: 'otp_expired' }
        }
      }
      if (mockServer.getIgnoreSetSessionKeepOldUser()) {
        // Simula el fallo donde el cliente mantiene la sesión anterior en lugar de aplicar el token
        return {
          data: { session: mockServer.getActiveSession(), user: mockServer.getActiveSession()?.user || null },
          error: null
        }
      }
      for (const u of mockServer.users.values()) {
        if (String(access_token).includes(u.id)) {
          const nextSession = {
            access_token,
            refresh_token: refresh_token || `ref-${u.id}`,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: { id: u.id, email: u.email, user_metadata: u.user_metadata }
          }
          mockServer.setActiveSession(nextSession)
          return { data: { session: nextSession, user: nextSession.user }, error: null }
        }
      }
      return {
        data: { session: null, user: null },
        error: { message: 'Token inválido', code: 'otp_expired' }
      }
    }),
    verifyOtp: vi.fn(async ({ token_hash, type }) => {
      if (mockServer.getFailVerifyOtp() || !token_hash || String(token_hash).startsWith('expired')) {
        return {
          data: { session: null, user: null },
          error: { message: 'Token has expired or is invalid', code: 'otp_expired' }
        }
      }
      const targetId = type === 'recovery' ? 'user-c-recuperacion' : 'user-b-invitado'
      const u = mockServer.users.get(targetId)
      const jwt = makeTestJwt({ sub: u.id, email: u.email })
      const nextSession = {
        access_token: jwt,
        refresh_token: `ref-${u.id}`,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: u.id, email: u.email, user_metadata: u.user_metadata }
      }
      mockServer.setActiveSession(nextSession)
      return { data: { session: nextSession, user: nextSession.user }, error: null }
    }),
    updateUser: vi.fn(async ({ password }) => {
      const current = mockServer.getActiveSession()
      if (!current?.user?.id) {
        return { data: { user: null }, error: { message: 'Auth session missing!' } }
      }
      const u = mockServer.users.get(current.user.id)
      if (!u) {
        return { data: { user: null }, error: { message: 'User not found' } }
      }
      u.password = password
      mockServer.updatedPasswordsByUser.push({ userId: u.id, email: u.email, password })
      return {
        data: { user: { id: u.id, email: u.email, user_metadata: u.user_metadata } },
        error: null
      }
    }),
    signInWithPassword: vi.fn(async ({ email, password }) => {
      const cleanEmail = String(email || '').trim().toLowerCase()
      const found = Array.from(mockServer.users.values()).find(u => u.email === cleanEmail)
      if (!found || !found.password || found.password !== password) {
        return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } }
      }
      const jwt = makeTestJwt({ sub: found.id, email: found.email })
      const nextSession = {
        access_token: jwt,
        refresh_token: `ref-${found.id}`,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: found.id, email: found.email, user_metadata: found.user_metadata }
      }
      mockServer.setActiveSession(nextSession)
      for (const cb of mockServer.getCallbacks()) {
        await cb('SIGNED_IN', nextSession)
      }
      return { data: { user: nextSession.user, session: nextSession }, error: null }
    }),
    signOut: vi.fn(async () => {
      mockServer.setActiveSession(null)
      return { error: null }
    }),
    onAuthStateChange: vi.fn(cb => {
      mockServer.addCallback(cb)
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
  },
  from: vi.fn(table => {
    const filters = {}
    const builder = {
      select: () => builder,
      eq: (col, val) => {
        filters[col] = val
        return builder
      },
      order: () => builder,
      range: async () => ({ data: [], error: null }),
      maybeSingle: async () => {
        if (table === 'user_profiles') {
          const u = mockServer.users.get(filters.user_id)
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
        return { data: null, error: null }
      },
      upsert: () => builder,
      then: (resolvePromise, rejectPromise) => {
        if (table === 'workshop_members') {
          const rows = mockServer.memberships
            .filter(m => !filters.user_id || m.user_id === filters.user_id)
            .map(m => ({
              workshop_id: m.workshop_id,
              user_id: m.user_id,
              role: m.role,
              workshops: mockServer.workshops.get(m.workshop_id)
            }))
          return Promise.resolve({ data: rows, error: null }).then(resolvePromise, rejectPromise)
        }
        return Promise.resolve({ data: [], error: null }).then(resolvePromise, rejectPromise)
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
  resetAppRouter,
  closeErrorModal,
  isErrorModalOpen,
  parseAuthCallbackUrl,
  prepareInitialAuthCallbackInWindow
} from '../Crash_Solution_Publicacion/src/main.js'
import { signInWithEmail } from '../Crash_Solution_Publicacion/src/lib/auth.js'
import { privateReadCache } from '../Crash_Solution_Publicacion/src/lib/scoped-cache.js'

function mountAppDom() {
  document.body.innerHTML = `
    <header class="app-header">
      <a class="brand" href="#"><span>CRASH SOLUTION</span><span>CRASH SOLUTION<small>Gestión del taller</small></span></a>
      <div id="headerAuthNav" class="header-nav" hidden></div>
      <div class="header-tools" hidden></div>
    </header>
    <section id="authScreen"></section>
    <main class="container" id="mainAppContainer" hidden>
      <div id="notice" class="notice" role="alert" hidden></div>
      <section id="jobsScreen"></section>
      <section id="workScreen" hidden>
        <section id="receptionStep"></section>
        <section id="inspectionStep" hidden></section>
        <section id="budgetStep" hidden></section>
      </section>
      <section id="stockScreen" hidden></section>
      <section id="profileScreen" hidden></section>
      <section id="adminScreen" hidden></section>
      <section id="settingsScreen" hidden></section>
    </main>
    <div id="toast" hidden></div>
  `
  window.scrollTo = vi.fn()
  window.showJobs = vi.fn(() => {
    window.screen = 'jobs'
    document.getElementById('jobsScreen').hidden = false
    document.getElementById('workScreen').hidden = true
  })
  window.renderJobs = vi.fn()
  window.saveLocal = vi.fn(() => true)
  window.store = { jobs: [], activeId: null, shop: { name: 'Crash Solution' } }
}

beforeEach(() => {
  mockServer.reset()
  resetAppRouter()
  privateReadCache.clear()
  closeErrorModal({ restoreFocus: false })
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  history.replaceState(null, '', '/')
  Object.assign(appAuthState, {
    session: null,
    user: null,
    profile: null,
    memberships: [],
    activeWorkshopId: null,
    activeWorkshopProfile: null,
    authMode: 'login',
    isSessionBootstrapped: false,
    passwordFlowContext: null
  })
  mountAppDom()
})

afterEach(() => {
  resetAppRouter()
  closeErrorModal({ restoreFocus: false })
})

describe('AUDITORÍA Y CORRECCIÓN INTEGRAL — Invitaciones, Activación y Aislamiento de Sesiones (CASOS A - G)', () => {
  it('CASO A — Invitación sin sesión previa: procesa enlace (incluso con doble hash #update-password#access_token=...), muestra «Activá tu cuenta» con el correo validado, establece la contraseña y permite cerrar sesión y volver a ingresar', async () => {
    const inviteJwt = makeTestJwt({ sub: 'user-b-invitado', email: 'invitado.nuevo@taller.invalid' })
    // Reproducir exactamente el formato que genera GoTrue cuando redirectTo incluye #update-password
    history.replaceState(
      null,
      '',
      `/#update-password#access_token=${inviteJwt}&refresh_token=ref-user-b-invitado&type=invite`
    )
    prepareInitialAuthCallbackInWindow(window, localStorage)

    await initAuthAndAdmin()

    // Verificar Pantalla Específica de Activación (Sección 4)
    const authScreen = document.getElementById('authScreen')
    expect(authScreen.hidden).toBe(false)
    expect(authScreen.querySelector('h1')?.textContent.trim()).toBe('Activá tu cuenta')
    expect(document.getElementById('activationAccountEmail')?.textContent).toBe('invitado.nuevo@taller.invalid')
    expect(document.getElementById('newPasswordInput')?.disabled).toBe(false)
    expect(document.getElementById('confirmNewPasswordInput')?.disabled).toBe(false)
    expect(document.getElementById('updatePassSubmitBtn')?.textContent.trim()).toBe('Activar cuenta')

    // Establecer contraseña para la cuenta invitada
    document.getElementById('newPasswordInput').value = 'ClaveInvitado2026!'
    document.getElementById('confirmNewPasswordInput').value = 'ClaveInvitado2026!'
    document.getElementById('updatePassForm').dispatchEvent(new Event('submit', { cancelable: true }))

    await vi.waitFor(() => {
      expect(backend.auth.updateUser).toHaveBeenCalledWith({ password: 'ClaveInvitado2026!' })
      expect(location.hash).toBe('#/trabajos')
    })

    // Verificar que se actualizó la contraseña del usuario invitado y NO de prueba@gmail.com
    expect(mockServer.users.get('user-b-invitado').password).toBe('ClaveInvitado2026!')
    expect(mockServer.users.get('user-a-prueba').password).toBe('PasswordOriginalPrueba123!')

    // Verificar pertenencia al taller correspondiente y rol asignado (staff)
    expect(appAuthState.user?.id).toBe('user-b-invitado')
    expect(appAuthState.memberships).toHaveLength(1)
    expect(appAuthState.memberships[0].workshop_id).toBe('ws-demo')
    expect(appAuthState.memberships[0].role).toBe('staff')
    expect(document.getElementById('navAdminBtn')).toBeNull() // staff no ve Administración

    // Permitir cerrar sesión y volver a ingresar con la nueva contraseña
    await handleLogout()
    expect(appAuthState.user).toBeNull()

    const signInData = await signInWithEmail('invitado.nuevo@taller.invalid', 'ClaveInvitado2026!')
    expect(signInData.user.id).toBe('user-b-invitado')
    expect(appAuthState.user.email).toBe('invitado.nuevo@taller.invalid')
  })

  it('CASO B (CRÍTICO) — Invitación con otra sesión activa (prueba@gmail.com): reemplaza y aísla la sesión previa, muestra el correo del invitado, actualiza la contraseña del invitado y conserva intacta la contraseña de prueba@gmail.com', async () => {
    // 1. Sesión activa iniciada como prueba@gmail.com (Usuario A)
    const jwtUserA = makeTestJwt({ sub: 'user-a-prueba', email: 'prueba@gmail.com' })
    const sessionUserA = {
      access_token: jwtUserA,
      refresh_token: 'ref-user-a-prueba',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'user-a-prueba', email: 'prueba@gmail.com', user_metadata: { display_name: 'Edy Dueño' } }
    }
    mockServer.setActiveSession(sessionUserA)
    localStorage.setItem('mitaller_supabase_auth', JSON.stringify({ currentSession: sessionUserA }))
    appAuthState.session = sessionUserA
    appAuthState.user = sessionUserA.user
    appAuthState.memberships = [{ workshop_id: 'ws-demo', role: 'owner', workshop: mockServer.workshops.get('ws-demo') }]

    // 2. En el MISMO navegador se abre el enlace de invitación de Usuario B (invitado.nuevo@taller.invalid)
    const jwtUserB = makeTestJwt({ sub: 'user-b-invitado', email: 'invitado.nuevo@taller.invalid' })
    history.replaceState(
      null,
      '',
      `/#update-password#access_token=${jwtUserB}&refresh_token=ref-user-b-invitado&type=invite`
    )
    prepareInitialAuthCallbackInWindow(window, localStorage)

    await initAuthAndAdmin()

    // 3. Verificar que la pantalla de activación muestra la cuenta de Usuario B y NO prueba@gmail.com
    expect(appAuthState.user?.id).toBe('user-b-invitado')
    expect(appAuthState.user?.email).toBe('invitado.nuevo@taller.invalid')
    expect(document.querySelector('#authScreen h1')?.textContent.trim()).toBe('Activá tu cuenta')
    expect(document.getElementById('activationAccountEmail')?.textContent).toBe('invitado.nuevo@taller.invalid')
    expect(document.getElementById('activationAccountEmail')?.textContent).not.toContain('prueba@gmail.com')

    // 4. Ingresar y guardar la contraseña para la nueva cuenta invitada (Usuario B)
    document.getElementById('newPasswordInput').value = 'NuevaClaveUsuarioB2026!'
    document.getElementById('confirmNewPasswordInput').value = 'NuevaClaveUsuarioB2026!'
    document.getElementById('updatePassForm').dispatchEvent(new Event('submit', { cancelable: true }))

    await vi.waitFor(() => {
      expect(backend.auth.updateUser).toHaveBeenCalledOnce()
      expect(location.hash).toBe('#/trabajos')
    })

    // 5. COMPROBACIÓN CRÍTICA DE SEGURIDAD:
    // - La contraseña de Usuario B se actualizó a 'NuevaClaveUsuarioB2026!'
    // - La contraseña original de prueba@gmail.com ('PasswordOriginalPrueba123!') permanece 100% INTACTA
    expect(mockServer.updatedPasswordsByUser).toEqual([
      {
        userId: 'user-b-invitado',
        email: 'invitado.nuevo@taller.invalid',
        password: 'NuevaClaveUsuarioB2026!'
      }
    ])
    expect(mockServer.users.get('user-b-invitado').password).toBe('NuevaClaveUsuarioB2026!')
    expect(mockServer.users.get('user-a-prueba').password).toBe('PasswordOriginalPrueba123!')

    // 6. Comprobar que tanto Usuario B como Usuario A pueden iniciar sesión con sus respectivas contraseñas
    await handleLogout()
    const loginB = await signInWithEmail('invitado.nuevo@taller.invalid', 'NuevaClaveUsuarioB2026!')
    expect(loginB.user.id).toBe('user-b-invitado')

    await handleLogout()
    const loginA = await signInWithEmail('prueba@gmail.com', 'PasswordOriginalPrueba123!')
    expect(loginA.user.id).toBe('user-a-prueba')
  })

  it('CASO B.2 (DEFENSA EN PROFUNDIDAD) — Si falla el cambio de sesión y persiste la sesión de prueba@gmail.com al abrir una invitación, bloquea el formulario, muestra popup de error y NUNCA ejecuta updateUser sobre prueba@gmail.com', async () => {
    const jwtUserA = makeTestJwt({ sub: 'user-a-prueba', email: 'prueba@gmail.com' })
    const sessionUserA = {
      access_token: jwtUserA,
      refresh_token: 'ref-user-a-prueba',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'user-a-prueba', email: 'prueba@gmail.com' }
    }
    mockServer.setActiveSession(sessionUserA)
    mockServer.setIgnoreSetSessionKeepOldUser(true) // Simula que Supabase sigue devolviendo la sesión de prueba@gmail.com

    const jwtUserB = makeTestJwt({ sub: 'user-b-invitado', email: 'invitado.nuevo@taller.invalid' })
    history.replaceState(
      null,
      '',
      `/#update-password#access_token=${jwtUserB}&refresh_token=ref-user-b-invitado&type=invite`
    )
    prepareInitialAuthCallbackInWindow(window, localStorage)

    await initAuthAndAdmin()

    // El formulario debe quedar bloqueado y mostrar el popup explicativo
    expect(appAuthState.passwordFlowContext?.blocked).toBe(true)
    expect(document.getElementById('newPasswordInput')?.disabled).toBe(true)
    expect(document.getElementById('confirmNewPasswordInput')?.disabled).toBe(true)
    expect(document.getElementById('updatePassSubmitBtn')?.disabled).toBe(true)
    expect(isErrorModalOpen()).toBe(true)

    // Incluso si se fuerza el evento submit en el DOM, NUNCA debe llamar a updateUser
    document.getElementById('newPasswordInput').value = 'IntentoForzado123!'
    document.getElementById('confirmNewPasswordInput').value = 'IntentoForzado123!'
    document.getElementById('updatePassForm').dispatchEvent(new Event('submit', { cancelable: true }))

    expect(backend.auth.updateUser).not.toHaveBeenCalled()
    expect(mockServer.users.get('user-a-prueba').password).toBe('PasswordOriginalPrueba123!')
  })

  it('CASO C — Invitación vencida, inválida o sin token mientras otra sesión está activa: bloquea la operación, muestra popup y no modifica ninguna contraseña', async () => {
    const jwtUserA = makeTestJwt({ sub: 'user-a-prueba', email: 'prueba@gmail.com' })
    const sessionUserA = {
      access_token: jwtUserA,
      refresh_token: 'ref-user-a-prueba',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'user-a-prueba', email: 'prueba@gmail.com' }
    }
    mockServer.setActiveSession(sessionUserA)
    localStorage.setItem('mitaller_supabase_auth', JSON.stringify({ currentSession: sessionUserA }))

    // Enlace vencido devuelto por GoTrue con #update-password#error=access_denied&error_code=otp_expired
    history.replaceState(
      null,
      '',
      '/#update-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    )
    prepareInitialAuthCallbackInWindow(window, localStorage)

    await initAuthAndAdmin()

    expect(appAuthState.passwordFlowContext?.blocked).toBe(true)
    expect(document.getElementById('newPasswordInput')?.disabled).toBe(true)
    expect(document.getElementById('updatePassSubmitBtn')?.disabled).toBe(true)
    expect(isErrorModalOpen()).toBe(true)
    expect(document.getElementById('authAlertBox')?.textContent).toMatch(/expiró|utilizado/i)

    document.getElementById('updatePassForm')?.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(backend.auth.updateUser).not.toHaveBeenCalled()
    expect(mockServer.users.get('user-a-prueba').password).toBe('PasswordOriginalPrueba123!')
  })

  it('CASO D — Recuperación de contraseña mientras otra cuenta está conectada: aísla la sesión anterior y actualiza únicamente la cuenta en recuperación', async () => {
    const jwtUserA = makeTestJwt({ sub: 'user-a-prueba', email: 'prueba@gmail.com' })
    const sessionUserA = {
      access_token: jwtUserA,
      refresh_token: 'ref-user-a-prueba',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'user-a-prueba', email: 'prueba@gmail.com' }
    }
    mockServer.setActiveSession(sessionUserA)
    localStorage.setItem('mitaller_supabase_auth', JSON.stringify({ currentSession: sessionUserA }))

    // Usuario C abre su enlace de recuperación en el mismo navegador
    const jwtUserC = makeTestJwt({ sub: 'user-c-recuperacion', email: 'mecanico.recuperar@taller.invalid' })
    history.replaceState(
      null,
      '',
      `/#update-password#access_token=${jwtUserC}&refresh_token=ref-user-c-recuperacion&type=recovery`
    )
    prepareInitialAuthCallbackInWindow(window, localStorage)

    await initAuthAndAdmin()

    expect(appAuthState.user?.id).toBe('user-c-recuperacion')
    expect(document.getElementById('activationAccountEmail')?.textContent).toBe('mecanico.recuperar@taller.invalid')

    document.getElementById('newPasswordInput').value = 'ClaveRecuperadaC2026!'
    document.getElementById('confirmNewPasswordInput').value = 'ClaveRecuperadaC2026!'
    document.getElementById('updatePassForm').dispatchEvent(new Event('submit', { cancelable: true }))

    await vi.waitFor(() => {
      expect(backend.auth.updateUser).toHaveBeenCalledWith({ password: 'ClaveRecuperadaC2026!' })
    })

    expect(mockServer.users.get('user-c-recuperacion').password).toBe('ClaveRecuperadaC2026!')
    expect(mockServer.users.get('user-a-prueba').password).toBe('PasswordOriginalPrueba123!')
  })

  it('CASO E — Enlace utilizado previamente: impide reutilizar el mismo token de invitación una vez activada la cuenta', async () => {
    const inviteJwt = makeTestJwt({ sub: 'user-b-invitado', email: 'invitado.nuevo@taller.invalid' })
    const inviteUrl = `/#update-password#access_token=${inviteJwt}&refresh_token=ref-user-b-invitado&type=invite`

    history.replaceState(null, '', inviteUrl)
    prepareInitialAuthCallbackInWindow(window, localStorage)
    await initAuthAndAdmin()

    document.getElementById('newPasswordInput').value = 'PrimeraActivacion2026!'
    document.getElementById('confirmNewPasswordInput').value = 'PrimeraActivacion2026!'
    document.getElementById('updatePassForm').dispatchEvent(new Event('submit', { cancelable: true }))

    await vi.waitFor(() => expect(location.hash).toBe('#/trabajos'))
    expect(backend.auth.updateUser).toHaveBeenCalledOnce()

    // Intentar volver a abrir exactamente el mismo enlace de invitación ya utilizado
    history.replaceState(null, '', inviteUrl)
    prepareInitialAuthCallbackInWindow(window, localStorage)
    await initAuthAndAdmin()

    expect(appAuthState.passwordFlowContext?.blocked).toBe(true)
    expect(appAuthState.passwordFlowContext?.errorCode).toBe('TOKEN_ALREADY_USED')
    expect(document.getElementById('newPasswordInput')?.disabled).toBe(true)
    expect(document.getElementById('updatePassSubmitBtn')?.disabled).toBe(true)
    expect(isErrorModalOpen()).toBe(true)

    // No permite un segundo cambio de contraseña con el token consumido
    document.getElementById('updatePassForm')?.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(backend.auth.updateUser).toHaveBeenCalledOnce()
  })

  it('CASO F y G — Talleres, permisos, flujo ?token_hash en subruta /mi-taller/ (PWA / GitHub Pages) y plantillas de correo en español', async () => {
    // Probar enlace con ?token_hash=...&type=invite bajo la subruta de producción /mi-taller/
    history.replaceState(null, '', '/mi-taller/?token_hash=valid-otp-hash-b&type=invite#update-password')
    const parsed = parseAuthCallbackUrl(window.location)
    expect(parsed.type).toBe('invite')
    expect(parsed.tokenHash).toBe('valid-otp-hash-b')
    expect(parsed.isPasswordSetupFlow).toBe(true)

    prepareInitialAuthCallbackInWindow(window, localStorage)
    await initAuthAndAdmin()

    expect(backend.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'valid-otp-hash-b',
      type: 'invite'
    })
    expect(document.querySelector('#authScreen h1')?.textContent.trim()).toBe('Activá tu cuenta')
    expect(document.getElementById('activationAccountEmail')?.textContent).toBe('invitado.nuevo@taller.invalid')

    document.getElementById('newPasswordInput').value = 'ClavePwaMobile2026!'
    document.getElementById('confirmNewPasswordInput').value = 'ClavePwaMobile2026!'
    document.getElementById('updatePassForm').dispatchEvent(new Event('submit', { cancelable: true }))

    await vi.waitFor(() => expect(location.hash).toBe('#/trabajos'))

    // Verificar acceso exclusivo al taller asignado (ws-demo) con rol staff (sin ws-ajeno ni permisos admin)
    expect(appAuthState.memberships.map(m => m.workshop_id)).toEqual(['ws-demo'])
    expect(appAuthState.memberships[0].role).toBe('staff')
    expect(document.getElementById('navAdminBtn')).toBeNull()

    // Verificar que las plantillas de correo en español están documentadas con las variables oficiales de Supabase
    const templatesDocPath = resolve('docs/plantillas-correo-supabase-es.md')
    expect(existsSync(templatesDocPath)).toBe(true)
    const templatesContent = readFileSync(templatesDocPath, 'utf8')
    expect(templatesContent).toContain('{{ .ConfirmationURL }}')
    expect(templatesContent).toContain('{{ .Email }}')
    expect(templatesContent).toContain('{{ .NewEmail }}')
    expect(templatesContent).toContain('Invitación para activar tu cuenta en Crash Solution')
    expect(templatesContent).toContain('Restablecé tu contraseña en Crash Solution')
    expect(templatesContent).toContain('Confirmá tu correo electrónico en Crash Solution')
    expect(templatesContent).toContain('Confirmá el cambio de correo electrónico en Crash Solution')
  })
})
