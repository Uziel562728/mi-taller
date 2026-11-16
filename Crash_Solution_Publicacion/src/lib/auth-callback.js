/**
 * Módulo de aislamiento de sesiones, validación de enlaces de invitación / recuperación
 * y protección contra actualización de contraseña en cuentas ajenas.
 */

const AUTH_STORAGE_KEY = 'mitaller_supabase_auth'
const CONSUMED_TOKENS_STORAGE_KEY = 'mitaller_consumed_auth_tokens_v1'

let capturedInitialCallback = null

/**
 * Decodifica de forma segura el payload de un JWT (3 segmentos base64url).
 * No sustituye la validación criptográfica del servidor: se utiliza como restricción
 * adicional de identidad (sub / email) que la sesión de Supabase debe cumplir.
 */
export function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.trim().split('.')
  if (parts.length !== 3) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const jsonStr =
      typeof globalThis.atob === 'function'
        ? decodeURIComponent(
            Array.from(globalThis.atob(padded))
              .map(c => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
              .join('')
          )
        : Buffer.from(padded, 'base64').toString('utf8')
    const parsed = JSON.parse(jsonStr)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * Genera una huella no reversible del token para detectar reutilización en la misma sesión
 * sin almacenar el token en claro.
 */
export function computeTokenFingerprint(rawToken) {
  const clean = String(rawToken || '').trim()
  if (!clean) return null
  let hash = 2166136261
  for (let i = 0; i < clean.length; i++) {
    hash ^= clean.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `tk-${clean.length}-${(hash >>> 0).toString(16)}`
}

export function isTokenAlreadyConsumed(tokenFingerprint, storage = globalThis.sessionStorage) {
  if (!tokenFingerprint || !storage || typeof storage.getItem !== 'function') return false
  try {
    const raw = storage.getItem(CONSUMED_TOKENS_STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) && list.includes(tokenFingerprint)
  } catch {
    return false
  }
}

export function markTokenConsumed(tokenFingerprint, storage = globalThis.sessionStorage) {
  if (!tokenFingerprint || !storage || typeof storage.setItem !== 'function') return
  try {
    const raw = storage.getItem(CONSUMED_TOKENS_STORAGE_KEY)
    const list = Array.isArray(raw ? JSON.parse(raw) : null) ? JSON.parse(raw) : []
    if (!list.includes(tokenFingerprint)) {
      list.push(tokenFingerprint)
      storage.setItem(CONSUMED_TOKENS_STORAGE_KEY, JSON.stringify(list.slice(-30)))
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function clearConsumedTokens(storage = globalThis.sessionStorage) {
  try {
    storage?.removeItem?.(CONSUMED_TOKENS_STORAGE_KEY)
  } catch {
    // Ignore
  }
}

/**
 * Analiza cualquier URL de retorno de correo electrónico de Supabase Auth, incluyendo:
 * - Hashes compuestos como `#update-password#access_token=...&type=invite`
 * - Hashes estándar `#access_token=...&refresh_token=...&type=invite`
 * - Parámetros PKCE / OTP `?token_hash=...&type=invite` o `?code=...`
 * - Errores de verificación `#error=access_denied&error_code=otp_expired`
 */
export function parseAuthCallbackUrl(locationLike = globalThis.window?.location) {
  if (!locationLike) {
    return {
      type: '',
      accessToken: '',
      refreshToken: '',
      tokenHash: '',
      code: '',
      error: '',
      errorCode: '',
      errorDescription: '',
      hasUpdatePasswordRoute: false,
      hasDoubleHash: false,
      jwtClaims: null,
      isPasswordSetupFlow: false,
      hasCallbackCredentials: false,
      hasCallbackError: false,
      isAuthCallback: false,
      normalizedHash: '',
      tokenFingerprint: null
    }
  }

  let searchStr = String(locationLike.search || '')
  let hashStr = String(locationLike.hash || '')
  if (!searchStr && !hashStr && typeof locationLike.href === 'string') {
    try {
      const parsedUrl = new URL(locationLike.href, 'http://localhost')
      searchStr = parsedUrl.search
      hashStr = parsedUrl.hash
    } catch {
      // Ignore malformed href
    }
  }

  const rawHash = hashStr.replace(/^#/, '')
  const hashSegments = rawHash ? rawHash.split('#').filter(Boolean) : []
  const hasDoubleHash = hashSegments.length > 1

  const mergedParams = new URLSearchParams()
  if (searchStr) {
    const searchParams = new URLSearchParams(searchStr.replace(/^\?/, ''))
    for (const [k, v] of searchParams.entries()) {
      mergedParams.set(k, v)
    }
  }

  let hasUpdatePasswordRoute = false
  const paramSegments = []

  for (const segment of hashSegments) {
    const cleanSeg = segment.trim()
    if (cleanSeg === 'update-password' || cleanSeg === 'activar-cuenta' || cleanSeg === '/activar-cuenta') {
      hasUpdatePasswordRoute = true
      continue
    }
    // Si un segmento empieza con "update-password&access_token=..."
    let queryPart = cleanSeg
    if (/^(update-password|activar-cuenta)&/i.test(cleanSeg)) {
      hasUpdatePasswordRoute = true
      queryPart = cleanSeg.replace(/^(update-password|activar-cuenta)&/i, '')
    }
    if (queryPart.includes('=')) {
      paramSegments.push(queryPart)
      const segParams = new URLSearchParams(queryPart)
      for (const [k, v] of segParams.entries()) {
        const cleanKey = k.replace(/^(update-password|activar-cuenta)#?/i, '')
        if (cleanKey) mergedParams.set(cleanKey, v)
      }
    }
  }

  const type = String(mergedParams.get('type') || '').trim().toLowerCase()
  const accessToken = String(mergedParams.get('access_token') || '').trim()
  const refreshToken = String(mergedParams.get('refresh_token') || '').trim()
  const tokenHash = String(mergedParams.get('token_hash') || '').trim()
  const code = String(mergedParams.get('code') || '').trim()
  const error = String(mergedParams.get('error') || '').trim()
  const errorCode = String(mergedParams.get('error_code') || '').trim().toLowerCase()
  const errorDescription = String(mergedParams.get('error_description') || '').trim()

  const jwtClaims = accessToken ? decodeJwtPayload(accessToken) : null
  const isPasswordSetupFlow = ['invite', 'recovery'].includes(type)
  const hasCallbackCredentials = Boolean(accessToken || tokenHash || code)
  const hasCallbackError = Boolean(error || errorCode || errorDescription)
  const isAuthCallback = Boolean(isPasswordSetupFlow || hasCallbackCredentials || hasCallbackError)

  let normalizedHash = hashStr
  if (hasDoubleHash && paramSegments.length > 0) {
    normalizedHash = `#${paramSegments.join('&')}`
  }

  const tokenFingerprint = computeTokenFingerprint(accessToken || tokenHash || code)

  return {
    type,
    accessToken,
    refreshToken,
    tokenHash,
    code,
    error,
    errorCode,
    errorDescription,
    hasUpdatePasswordRoute,
    hasDoubleHash,
    jwtClaims,
    isPasswordSetupFlow,
    hasCallbackCredentials,
    hasCallbackError,
    isAuthCallback,
    normalizedHash,
    tokenFingerprint
  }
}

/**
 * Lee la sesión persistida en localStorage antes de que Supabase Auth la reutilice.
 */
export function readStoredSupabaseSessionUser(
  storage = globalThis.localStorage,
  storageKey = AUTH_STORAGE_KEY
) {
  if (!storage || typeof storage.getItem !== 'function') return null
  try {
    const raw = storage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const session = parsed?.currentSession || parsed?.session || parsed
    const user = session?.user || null
    if (!user?.id) return null
    return {
      userId: String(user.id),
      email: String(user.email || '').trim().toLowerCase(),
      accessToken: String(session?.access_token || '')
    }
  } catch {
    return null
  }
}

/**
 * Prepara la ventana antes de inicializar `createClient` de Supabase:
 * 1. Captura los parámetros originales del enlace de invitación o recuperación.
 * 2. Si el hash venía con doble fragmento (`#update-password#access_token=...`),
 *    lo normaliza a `#access_token=...` para que `@supabase/supabase-js` no ignore el token.
 * 3. Si existía una sesión previa en `localStorage` de otro usuario y está ingresando
 *    un enlace de invitación/recuperación con credenciales nuevas, aísla `localStorage`
 *    para impedir que Supabase reutilice la sesión anterior.
 */
export function prepareInitialAuthCallbackInWindow(
  win = globalThis.window,
  storage = globalThis.localStorage
) {
  if (!win?.location) return null
  const parsed = parseAuthCallbackUrl(win.location)
  const storedSession = readStoredSupabaseSessionUser(storage)

  if (parsed.isAuthCallback) {
    capturedInitialCallback = {
      ...parsed,
      preExistingUserId: storedSession?.userId || null,
      preExistingEmail: storedSession?.email || null,
      capturedAt: Date.now()
    }

    // Si hay credenciales de invitación o recuperación en la URL y existe una sesión previa en localStorage
    // que pertenece a otro usuario, limpiamos la clave de sesión en localStorage ANTES de que Supabase la lea.
    if (
      storedSession?.userId &&
      (parsed.hasCallbackCredentials || parsed.isPasswordSetupFlow) &&
      (!parsed.jwtClaims?.sub || String(parsed.jwtClaims.sub) !== String(storedSession.userId))
    ) {
      try {
        storage?.removeItem?.(AUTH_STORAGE_KEY)
      } catch {
        // Ignore storage errors
      }
    }

    // Normalizar doble hash (#update-password#access_token=...) a hash simple (#access_token=...)
    if (parsed.hasDoubleHash && parsed.normalizedHash && win.history?.replaceState) {
      try {
        win.history.replaceState(
          win.history.state,
          '',
          `${win.location.pathname}${win.location.search}${parsed.normalizedHash}`
        )
      } catch {
        // Ignore history errors
      }
    }
  }

  return capturedInitialCallback
}

export function getCapturedInitialCallback() {
  return capturedInitialCallback
}

export function clearCapturedInitialCallback() {
  capturedInitialCallback = null
}

/**
 * Traduce errores de enlaces de invitación o recuperación a mensajes claros en español.
 */
export function translateCallbackError({
  error = '',
  errorCode = '',
  errorDescription = '',
  flowType = 'invite'
} = {}) {
  const codeLower = String(errorCode || error || '').toLowerCase()
  const descLower = String(errorDescription || '').toLowerCase()
  const isInvite = flowType === 'invite'

  if (codeLower === 'token_already_used' || codeLower === 'already_used') {
    return isInvite
      ? 'Este enlace de invitación ya fue utilizado anteriormente para activar la cuenta. Iniciá sesión con tu correo y contraseña.'
      : 'Este enlace de recuperación ya fue utilizado anteriormente. Si necesitás cambiar tu clave nuevamente, solicitá un nuevo enlace.'
  }

  if (codeLower === 'identity_mismatch') {
    return 'Bloqueo de seguridad: se detectó que la sesión activa del navegador pertenece a otra cuenta distinta a la de la invitación. Por seguridad, se bloqueó el cambio de contraseña para proteger la cuenta existente.'
  }

  if (
    codeLower.includes('otp_expired') ||
    codeLower.includes('flow_state_expired') ||
    descLower.includes('expired') ||
    descLower.includes('invalid')
  ) {
    return isInvite
      ? 'El enlace de invitación expiró o ya fue utilizado. Por seguridad, no se modificó la contraseña de ninguna cuenta. Solicitá al administrador que te envíe una nueva invitación.'
      : 'El enlace de recuperación de contraseña expiró o ya fue utilizado. Por seguridad, no se modificó ninguna contraseña. Solicitá un nuevo enlace desde «¿Olvidaste tu contraseña?».'
  }

  return isInvite
    ? 'No se pudo validar el enlace de invitación. Es posible que haya vencido o ya haya sido utilizado. Por seguridad, no se modificó la contraseña de ninguna cuenta.'
    : 'No se pudo validar el enlace de recuperación de contraseña. Por seguridad, la operación fue bloqueada.'
}

/**
 * Procesa, establece y verifica criptográficamente la sesión correspondiente a un enlace
 * de invitación o recuperación de contraseña, garantizando el aislamiento total respecto
 * de cualquier sesión previa en el navegador.
 */
export async function establishAndVerifyCallbackSession({
  supabaseClient,
  callbackInfo,
  currentSession = null,
  preExistingUserId = null,
  sessionStorageRef = globalThis.sessionStorage
} = {}) {
  const info = callbackInfo || parseAuthCallbackUrl()
  const effectivePreExistingUserId = preExistingUserId || info.preExistingUserId || null
  const flowType = info.type === 'recovery' ? 'recovery' : 'invite'

  // 1. Si el enlace contiene un error explícito de Supabase Auth (ej. otp_expired, access_denied)
  if (info.hasCallbackError) {
    return {
      ok: false,
      verified: false,
      blocked: true,
      flowType,
      errorCode: info.errorCode || 'CALLBACK_ERROR',
      error: translateCallbackError({
        error: info.error,
        errorCode: info.errorCode,
        errorDescription: info.errorDescription,
        flowType
      })
    }
  }

  // 2. Verificar si el token ya fue utilizado previamente en esta sesión del navegador (CASO E)
  if (info.tokenFingerprint && isTokenAlreadyConsumed(info.tokenFingerprint, sessionStorageRef)) {
    return {
      ok: false,
      verified: false,
      blocked: true,
      flowType,
      errorCode: 'TOKEN_ALREADY_USED',
      error: translateCallbackError({
        errorCode: 'token_already_used',
        flowType
      })
    }
  }

  let activeSession = currentSession
  let authError = null

  // 3. Si el enlace trae token_hash + type (flujo OTP / plantilla con token_hash)
  if (info.tokenHash && info.type && typeof supabaseClient?.auth?.verifyOtp === 'function') {
    if (effectivePreExistingUserId && typeof supabaseClient?.auth?.signOut === 'function') {
      await supabaseClient.auth.signOut({ scope: 'local' }).catch(() => {})
    }
    const { data, error } = await supabaseClient.auth.verifyOtp({
      token_hash: info.tokenHash,
      type: info.type
    })
    if (error || !data?.session?.user?.id) {
      return {
        ok: false,
        verified: false,
        blocked: true,
        flowType,
        errorCode: error?.code || 'OTP_INVALID',
        error: translateCallbackError({
          error: error?.message,
          errorCode: error?.code || 'otp_expired',
          errorDescription: error?.message,
          flowType
        })
      }
    }
    activeSession = data.session
  } else if (info.code && typeof supabaseClient?.auth?.exchangeCodeForSession === 'function') {
    // 4. Si el enlace trae código PKCE (?code=...)
    if (effectivePreExistingUserId && typeof supabaseClient?.auth?.signOut === 'function') {
      await supabaseClient.auth.signOut({ scope: 'local' }).catch(() => {})
    }
    const { data, error } = await supabaseClient.auth.exchangeCodeForSession(info.code)
    if (error || !data?.session?.user?.id) {
      return {
        ok: false,
        verified: false,
        blocked: true,
        flowType,
        errorCode: error?.code || 'CODE_INVALID',
        error: translateCallbackError({
          error: error?.message,
          errorCode: error?.code || 'otp_expired',
          errorDescription: error?.message,
          flowType
        })
      }
    }
    activeSession = data.session
  } else if (info.accessToken) {
    // 5. Si el enlace trae access_token (+ refresh_token) en el hash
    const needsSetSession =
      !activeSession?.access_token ||
      activeSession.access_token !== info.accessToken ||
      (info.jwtClaims?.sub && String(activeSession?.user?.id || '') !== String(info.jwtClaims.sub))

    if (needsSetSession && info.refreshToken && typeof supabaseClient?.auth?.setSession === 'function') {
      const { data, error } = await supabaseClient.auth.setSession({
        access_token: info.accessToken,
        refresh_token: info.refreshToken
      })
      if (error || !data?.session?.user?.id) {
        authError = error
        activeSession = null
      } else {
        activeSession = data.session
      }
    }
  }

  // Si aún no hay sesión establecida y no hubo un error definitivo:
  // En caso de que aún estemos esperando el evento SIGNED_IN / PASSWORD_RECOVERY de Supabase
  if (!activeSession?.user?.id) {
    if (authError) {
      return {
        ok: false,
        verified: false,
        blocked: true,
        flowType,
        errorCode: authError.code || 'SESSION_INVALID',
        error: translateCallbackError({
          error: authError.message,
          errorCode: authError.code || 'otp_expired',
          errorDescription: authError.message,
          flowType
        })
      }
    }
    // Si el enlace indicó type=invite o type=recovery pero NO trajo ningún token (enlace incompleto/manipulado)
    if (info.isPasswordSetupFlow && !info.hasCallbackCredentials) {
      return {
        ok: false,
        verified: false,
        blocked: true,
        flowType,
        errorCode: 'MISSING_TOKEN',
        error: translateCallbackError({
          errorCode: 'otp_expired',
          flowType
        })
      }
    }
    return {
      ok: false,
      verified: false,
      blocked: false,
      pending: true,
      flowType
    }
  }

  // 6. VALIDACIÓN ESTRICTA DE IDENTIDAD Y AISLAMIENTO DE SESIONES (CASO B, C, D)
  // 6a. Si el token de la URL era un JWT con `sub`, el ID del usuario de la sesión DEBE coincidir exactamente.
  if (info.jwtClaims?.sub && String(activeSession.user.id) !== String(info.jwtClaims.sub)) {
    return {
      ok: false,
      verified: false,
      blocked: true,
      flowType,
      errorCode: 'IDENTITY_MISMATCH',
      error: translateCallbackError({ errorCode: 'identity_mismatch', flowType })
    }
  }

  // 6b. Si el enlace trajo un access_token explícito y la sesión actual tiene otro access_token
  // correspondiente a un usuario previo distinto, bloquear inmediatamente.
  if (
    info.accessToken &&
    activeSession.access_token &&
    activeSession.access_token !== info.accessToken &&
    effectivePreExistingUserId &&
    String(activeSession.user.id) === String(effectivePreExistingUserId)
  ) {
    return {
      ok: false,
      verified: false,
      blocked: true,
      flowType,
      errorCode: 'IDENTITY_MISMATCH',
      error: translateCallbackError({ errorCode: 'identity_mismatch', flowType })
    }
  }

  // 6c. En una invitación (flowType === 'invite'), si había un usuario A conectado previamente en el navegador
  // y la sesión resultante sigue siendo el mismo usuario A (sin un JWT de invitación emitido específicamente para A),
  // bloquear inmediatamente para impedir que se cambie la contraseña del usuario A.
  if (
    flowType === 'invite' &&
    effectivePreExistingUserId &&
    String(activeSession.user.id) === String(effectivePreExistingUserId) &&
    (!info.jwtClaims?.sub || String(info.jwtClaims.sub) !== String(effectivePreExistingUserId))
  ) {
    return {
      ok: false,
      verified: false,
      blocked: true,
      flowType,
      errorCode: 'IDENTITY_MISMATCH',
      error: translateCallbackError({ errorCode: 'identity_mismatch', flowType })
    }
  }

  // 6d. Si el cliente de Supabase dispone de getUser y el token es un JWT real, verificar contra el servidor
  let verifiedUser = activeSession.user
  if (info.jwtClaims?.sub && typeof supabaseClient?.auth?.getUser === 'function') {
    const { data: userData, error: userErr } = await supabaseClient.auth.getUser(activeSession.access_token)
    if (userErr || !userData?.user?.id || String(userData.user.id) !== String(activeSession.user.id)) {
      return {
        ok: false,
        verified: false,
        blocked: true,
        flowType,
        errorCode: 'SERVER_VERIFY_FAILED',
        error: translateCallbackError({
          error: userErr?.message,
          errorCode: userErr?.code || 'otp_expired',
          flowType
        })
      }
    }
    verifiedUser = userData.user
  }

  const verifiedEmail = String(
    verifiedUser?.email || activeSession.user?.email || info.jwtClaims?.email || ''
  )
    .trim()
    .toLowerCase()

  return {
    ok: true,
    verified: true,
    blocked: false,
    pending: false,
    flowType,
    userId: String(verifiedUser.id),
    email: verifiedEmail,
    accessToken: activeSession.access_token,
    tokenFingerprint: info.tokenFingerprint || computeTokenFingerprint(activeSession.access_token),
    preExistingUserId: effectivePreExistingUserId,
    session: {
      ...activeSession,
      user: verifiedUser
    },
    user: verifiedUser
  }
}
