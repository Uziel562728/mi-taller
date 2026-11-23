import './styles.css'
import { getProfileInitials, updatePersonalProfile } from './lib/personal-profile.js'
import { createAppRouter, readAppRoute, routeHash, routeForSnapshot } from './lib/app-router.js'
import { privateReadCache } from './lib/scoped-cache.js'
import { resetInvitationRequests, isPasswordSetupCallback } from './lib/admin-service.js'
import {
  parseAuthCallbackUrl,
  decodeJwtPayload,
  computeTokenFingerprint,
  readStoredSupabaseSessionUser,
  prepareInitialAuthCallbackInWindow,
  getCapturedInitialCallback,
  clearCapturedInitialCallback,
  establishAndVerifyCallbackSession,
  verifyEmailChangeCallback,
  markTokenConsumed,
  isTokenAlreadyConsumed,
  clearConsumedTokens,
  recordPendingEmailChange,
  readPendingEmailChange,
  clearPendingEmailChange
} from './lib/auth-callback.js'
import { fetchAllPages } from './lib/paged-query.js'
import { supabase, isSupabaseConfigured } from './lib/supabase.js'
import {
  ROLE_LABELS,
  isSessionExpired,
  canAccessAdminPanel,
  ensureUserProfile,
  fetchUserWorkshops,
  signInWithEmail,
  signUpWithEmail,
  signOutUser,
  sendPasswordReset,
  updateUserPassword,
  requestUserEmailChange,
  validateEmailChange,
  translateAuthError
} from './lib/auth.js'
import {
  ALLOWED_MEMBER_ROLES,
  fetchAdminWorkshopMembers,
  fetchKnownUserProfiles,
  createNewWorkshop,
  upsertWorkshopMember,
  removeMemberFromWorkshop,
  inviteOrCreateWorkshopUser
} from './lib/admin.js'
import {
  fetchWorkshopProfile,
  updateWorkshopProfile,
  uploadWorkshopLogo,
  resolveWorkshopLogoUrl,
  rememberWorkshopProfile,
  buildBudgetWorkshopHeaderHtml,
  formatCuit
} from './lib/workshop-profile.js'
import {
  STOCK_CATEGORIES,
  STOCK_UNITS,
  PART_POSITIONS,
  isLowStock,
  formatPurchasePriceArs,
  validateStockItemInput,
  formatCompatibilityLabel,
  filterStockItems,
  getActiveStockItems,
  countActiveStockItems,
  fetchWorkshopStock,
  createStockItem,
  updateStockItem,
  archiveStockItem,
  recordStockMovement,
  fetchStockMovements
} from './lib/stock.js'
import {
  DEFAULT_WORKSHOP_SETTINGS,
  getSettingsSchema,
  getWorkshopSettings,
  saveWorkshopSettings
} from './lib/settings.js'
import { openWhatsappWithBudgetText } from './lib/budget-messages.js'
import * as budgetDeliveryStaticModule from './lib/budget-delivery.js'
import {
  saveOfflineJob,
  getOfflineJobsForScope,
  migrateLegacyLocalStorageJobs,
  enqueueJobSyncOperation,
  getPendingSyncOperations,
  getUnresolvedConflicts,
  processSyncQueue,
  resolveSyncConflict,
  getUnsyncedSummaryForUser,
  lockOfflineDataOnLogout,
  unlockOfflineDataForAuthenticatedOwner
} from './lib/offline-sync.js'
import {
  saveNavigationState,
  buildNavigationSnapshot,
  loadNavigationState,
  clearNavigationState,
  shouldReinitializeOnAuthEvent
} from './lib/navigation-state.js'
import {
  showErrorModal,
  closeErrorModal,
  isErrorModalOpen,
  markFieldError,
  clearFieldErrors,
  showSuccessToast,
  clearAllTransientErrors,
  inferErrorDetails
} from './lib/notifications.js'
import {
  VALID_BUDGET_MODES,
  VALID_PAINT_TYPES,
  resolveBudgetMode,
  normalizeSummaryBudget,
  normalizePaintType,
  resolvePaintType,
  resolveBudgetObservations,
  normalizeWorkIntervention,
  describeQuoteLine,
  syncBudgetFromInspection,
  computeDetailedBudgetTotals,
  computeSummaryBudgetTotals,
  buildSummaryPresentationLines,
  computeBudgetTotalsByMode,
  checkBudgetModesConsistency,
  formatArQuantity
} from './lib/piece-budget.js'

export {
  showErrorModal,
  closeErrorModal,
  isErrorModalOpen,
  markFieldError,
  clearFieldErrors,
  showSuccessToast,
  clearAllTransientErrors,
  inferErrorDetails,
  VALID_BUDGET_MODES,
  VALID_PAINT_TYPES,
  resolveBudgetMode,
  normalizeSummaryBudget,
  normalizePaintType,
  resolvePaintType,
  resolveBudgetObservations,
  normalizeWorkIntervention,
  describeQuoteLine,
  syncBudgetFromInspection,
  computeDetailedBudgetTotals,
  computeSummaryBudgetTotals,
  buildSummaryPresentationLines,
  computeBudgetTotalsByMode,
  checkBudgetModesConsistency,
  formatArQuantity,
  parseAuthCallbackUrl,
  decodeJwtPayload,
  prepareInitialAuthCallbackInWindow,
  getCapturedInitialCallback,
  clearCapturedInitialCallback,
  establishAndVerifyCallbackSession,
  markTokenConsumed,
  isTokenAlreadyConsumed,
  clearConsumedTokens,
  requestUserEmailChange,
  validateEmailChange
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    showErrorModal,
    closeErrorModal,
    isErrorModalOpen,
    markFieldError,
    clearFieldErrors,
    showSuccessToast,
    resolveBudgetMode,
    normalizeSummaryBudget,
    normalizePaintType,
    resolvePaintType,
    resolveBudgetObservations,
    normalizeWorkIntervention,
    describeQuoteLine,
    syncBudgetFromInspection,
    computeDetailedBudgetTotals,
    computeSummaryBudgetTotals,
    buildSummaryPresentationLines,
    computeBudgetTotalsByMode,
    checkBudgetModesConsistency,
    formatArQuantity
  })
}

const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export const appAuthState = {
  session: null,
  user: null,
  profile: null,
  memberships: [],
  activeWorkshopId: localStorage.getItem('mitaller_active_workshop_id') || null,
  activeWorkshopProfile: null,
  authMode: 'login', // 'login' | 'register' | 'reset' | 'update-password'
  loading: false,
  isSessionBootstrapped: false,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine !== false : true,
  isSyncingOfflineQueue: false,
  pendingSyncCount: 0,
  unresolvedConflicts: [],
  activePieceKey: null,
  openPieceDetailsKeys: [],
  adminMembers: [],
  knownProfiles: [],
  stockItems: [],
  stockMovements: [],
  stockFilters: {
    search: '',
    category: '',
    brand: '',
    status: 'active',
    vehicleMake: '',
    vehicleModel: '',
    vehicleYear: ''
  },
  editingStockItem: null,
  draftCompatibilities: [],
  stockVisibleCount: 40,
  stockRenderFilterKey: '',
  movementTargetItem: null,
  workshopSettings: { ...DEFAULT_WORKSHOP_SETTINGS },
  passwordFlowContext: null
}

function getActiveMembership() {
  if (!appAuthState.memberships.length) return null
  return (
    appAuthState.memberships.find(m => m.workshop_id === appAuthState.activeWorkshopId) ||
    appAuthState.memberships[0]
  )
}

let appRouter = null
let routeRenderingDepth = 0
let routeInitializedFor = null
let budgetDeliveryModule = budgetDeliveryStaticModule
let budgetDeliveryPromise = null
let pendingSessionInitialization = null
let jobsLoadPromise = null
let jobsLoadScope = null
let lastHeaderMarkup = ''
let headerBrandVersion = 0

const DEFAULT_GENERIC_SHOP = Object.freeze({
  id: null,
  name: 'Crash Solution',
  legal_name: '',
  tax_id: '',
  logo_path: '',
  logo_url: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: ''
})

function isSafeLogoUrl(url) {
  const clean = String(url || '').trim()
  if (!clean) return false
  return /^data:image\/(png|jpeg|jpg|webp|svg\+xml);/i.test(clean) || /^https?:\/\//i.test(clean)
}

export function renderHeaderBrand({ forceGeneric = false, workshop = null } = {}) {
  if (typeof document === 'undefined') return
  const brandEl = document.getElementById('appHeaderBrand') || document.querySelector('.app-header .brand, .brand')
  if (!brandEl) return

  const markEl =
    document.getElementById('headerBrandMark') ||
    brandEl.querySelector('.brand-mark') ||
    brandEl.querySelector('span:first-child')
  const copyEl =
    document.getElementById('headerBrandCopy') ||
    brandEl.querySelector('.brand-copy') ||
    brandEl.querySelector('span:nth-child(2)')

  const authenticated =
    !forceGeneric &&
    Boolean(appAuthState.user) &&
    !isSessionExpired(appAuthState.session) &&
    !appAuthState.passwordFlowContext?.blocked

  const ws = authenticated ? workshop || appAuthState.activeWorkshopProfile || getActiveMembership()?.workshop || null : null

  if (!authenticated || !ws) {
    brandEl.setAttribute('data-brand-mode', 'generic')
    brandEl.removeAttribute('data-workshop-id')
    if (markEl) {
      markEl.classList.remove('has-workshop-logo')
      markEl.setAttribute('data-brand-mode', 'generic')
      markEl.removeAttribute('data-workshop-id')
      markEl.textContent = 'ϟ'
    }
    if (copyEl) {
      copyEl.innerHTML = 'CRASH SOLUTION<small>MiTallerAPP</small>'
    }
    return
  }

  const wsId = String(ws.id || '')
  const wsName = String(ws.name || 'Crash Solution').trim() || 'Crash Solution'
  const wsSubtitle = String(ws.legal_name || 'Gestión del taller').trim() || 'Gestión del taller'
  const logoUrl = isSafeLogoUrl(ws.logo_url) ? String(ws.logo_url).trim() : ''

  brandEl.setAttribute('data-brand-mode', 'workshop')
  if (wsId) brandEl.setAttribute('data-workshop-id', wsId)
  else brandEl.removeAttribute('data-workshop-id')

  if (markEl) {
    if (wsId) markEl.setAttribute('data-workshop-id', wsId)
    else markEl.removeAttribute('data-workshop-id')

    if (logoUrl) {
      markEl.classList.add('has-workshop-logo')
      markEl.setAttribute('data-brand-mode', 'workshop')
      const existingImg = markEl.querySelector('#headerWorkshopLogo')
      if (!existingImg || existingImg.getAttribute('src') !== logoUrl) {
        markEl.innerHTML = `<img id="headerWorkshopLogo" class="brand-logo-img" src="${esc(logoUrl)}" alt="Logo de ${esc(wsName)}">`
        const imgEl = markEl.querySelector('#headerWorkshopLogo')
        imgEl?.addEventListener(
          'error',
          () => {
            markEl.classList.remove('has-workshop-logo')
            markEl.setAttribute('data-brand-mode', 'workshop-fallback')
            markEl.textContent = 'ϟ'
          },
          { once: true }
        )
      } else {
        existingImg.alt = `Logo de ${wsName}`
      }
    } else {
      markEl.classList.remove('has-workshop-logo')
      markEl.setAttribute('data-brand-mode', 'workshop-fallback')
      markEl.textContent = 'ϟ'
    }
  }

  if (copyEl) {
    copyEl.innerHTML = `${esc(wsName.toUpperCase())}<small>${esc(wsSubtitle)}</small>`
  }
}

export function resetHeaderBrandToGeneric() {
  headerBrandVersion++
  if (typeof window !== 'undefined' && window.store) {
    window.store.shop = { ...DEFAULT_GENERIC_SHOP }
  }
  renderHeaderBrand({ forceGeneric: true })
}
function prepareBudgetDelivery() {
  if (budgetDeliveryModule) return Promise.resolve(budgetDeliveryModule)
  budgetDeliveryModule = budgetDeliveryStaticModule
  return Promise.resolve(budgetDeliveryModule)
}
let initialRecoveryRequested = isPasswordSetupCallback(window.location)
const routeScope = () => `${appAuthState.user?.id || 'anonymous'}:${getActiveMembership()?.workshop_id || '-'}`
function clearWorkshopReadState() {
  clearScreenNotices()
  document.getElementById('syncNotice')?.replaceChildren()
  const syncNotice = document.getElementById('syncNotice')
  if (syncNotice) syncNotice.hidden = true
  resetInvitationRequests()
  appAuthState.activeWorkshopProfile = null
  appAuthState.stockItems = []
  appAuthState.stockMovements = []
  appAuthState.adminMembers = []
  appAuthState.knownProfiles = []
  appAuthState.editingStockItem = null
  appAuthState.movementTargetItem = null
  appAuthState.draftCompatibilities = []
  for (const id of ['profileScreen', 'stockScreen', 'adminScreen', 'settingsScreen']) document.getElementById(id)?.replaceChildren()
}
const duringRouteRender = callback => {
  routeRenderingDepth++
  try { return callback() } finally { routeRenderingDepth-- }
}

export function resetAppRouter() {
  appRouter?.dispose()
  appRouter = null
  routeInitializedFor = null
  initialRecoveryRequested = false
  appAuthState.passwordFlowContext = null
  clearCapturedInitialCallback()
  clearConsumedTokens()
}

function getAppRouter() {
  if (!appRouter) appRouter = createAppRouter({
    window, scope: routeScope, render: renderAppRoute,
    onError: () => window.toast?.('No se pudo abrir la sección. Intentá nuevamente.')
  })
  return appRouter
}

export function navigateAppRoute(route, options = {}) {
  if (options.captureDeparture !== false) persistCurrentNavigationState()
  return getAppRouter().navigate(route, options)
}

export function goBackAppRoute(fallbackRoute = { name: 'jobs' }) {
  return getAppRouter().goBack(fallbackRoute)
}

function ensureSettingsScreenElement() {
  let el = document.getElementById('settingsScreen')
  if (!el) {
    const main = document.getElementById('mainAppContainer')
    if (main) {
      el = document.createElement('section')
      el.id = 'settingsScreen'
      el.hidden = true
      main.append(el)
    }
  }
  return el
}

function hidePasswordScreen() {
  appAuthState.authMode = 'login'
  const authScreen = document.getElementById('authScreen')
  if (authScreen) { authScreen.hidden = true; authScreen.innerHTML = '' }
  const mainApp = document.getElementById('mainAppContainer')
  if (mainApp) mainApp.hidden = false
}

export function clearScreenNotices() {
  // Messages are transient UI state; clearing them must never change the draft or sync queue.
  for (const element of document.querySelectorAll('#notice, .auth-alert, #budgetDeliveryFeedback')) {
    element.hidden = true
    element.replaceChildren()
    delete element.dataset.validation
  }
  clearAllTransientErrors()
}

async function renderAppRoute(route, entry) {
  clearScreenNotices()
  document.getElementById('myProfileDialog')?.remove()
  const validSession = appAuthState.user && !isSessionExpired(appAuthState.session)
  if (!validSession || route.name === 'password') {
    appAuthState.authMode = validSession && route.name === 'password' ? 'update-password' : 'login'
    const main = document.getElementById('mainAppContainer')
    if (main) main.hidden = true
    const auth = document.getElementById('authScreen')
    if (auth) { auth.hidden = false; renderAuthScreen() }
    renderHeaderNavigation()
    return
  }
  hidePasswordScreen()
  ensureSettingsScreenElement()
  if (['stock', 'profile'].includes(route.name) && !getActiveMembership()) {
    return getAppRouter().navigate({ name: 'admin' }, { replace: true })
  }
  const screens = { jobs: 'jobsScreen', work: 'workScreen', stock: 'stockScreen', profile: 'profileScreen', admin: 'adminScreen', settings: 'settingsScreen' }
  for (const [name, id] of Object.entries(screens)) {
    const element = document.getElementById(id)
    if (element) element.hidden = name !== route.name
  }
  const restoreScroll = () => {
    if (entry.snapshot?.screen !== route.name || !entry.snapshot.scrollY) return
    requestAnimationFrame(() => {
      if (getAppRouter().state()?.id === entry.id) window.scrollTo({ top: entry.snapshot.scrollY, behavior: 'auto' })
    })
  }
  const loadSection = async task => {
    const section = document.getElementById(screens[route.name])
    if (section) {
      section.setAttribute('aria-busy', 'true')
      if (!section.textContent.trim()) section.innerHTML = '<p class="section-loading" role="status">Cargando sección…</p>'
    }
    try { await task() } finally { section?.removeAttribute('aria-busy') }
    restoreScroll()
  }
  if (route.name === 'admin') return loadSection(() => openAdminScreen({ fromRoute: true }))
  if (route.name === 'profile') return loadSection(() => openProfileScreen({ fromRoute: true }))
  if (route.name === 'settings') return loadSection(() => openSettingsScreen({ fromRoute: true }))
  if (route.name === 'stock') {
    if (entry.snapshot?.stockListLimit) {
      appAuthState.stockVisibleCount = entry.snapshot.stockListLimit
      appAuthState.stockRenderFilterKey = JSON.stringify([routeScope(), appAuthState.stockFilters])
    }
    return loadSection(() => openStockScreen({ fromRoute: true }))
  }
  if (route.name === 'work') {
    const stored = loadNavigationState({ userId: appAuthState.user.id, workshopId: getActiveMembership()?.workshop_id })
    const candidate = entry.snapshot?.activeJobId === route.jobId ? entry.snapshot : stored?.activeJobId === route.jobId ? stored : null
    const snapshot = buildNavigationSnapshot({
      ...candidate, userId: appAuthState.user.id, workshopId: getActiveMembership()?.workshop_id,
      screen: 'work', activeJobId: route.jobId, step: route.step,
      area: candidate?.area || window.store?.jobs?.find(job => job.id === route.jobId)?.area
    })
    const restored = await duringRouteRender(() => restoreSavedNavigationState(snapshot))
    if (getAppRouter().state()?.id !== entry.id || readAppRoute(window.location).name !== 'work') return
    if (!restored) return getAppRouter().navigate({ name: 'jobs' }, { replace: true })
    persistCurrentNavigationState({ screen: 'work' })
  } else {
    if (entry.snapshot?.jobListLimit) window.jobDisplayLimit = entry.snapshot.jobListLimit
    duringRouteRender(() => window.showJobs?.())
    persistCurrentNavigationState({ screen: 'jobs', activeJobId: null })
    restoreScroll()
  }
  renderHeaderNavigation()
}

function setAuthAlert(type, message) {
  const box = document.getElementById('authAlertBox')
  if (!message) {
    clearFieldErrors(document.getElementById('authScreen'))
    if (box) {
      box.hidden = true
      box.textContent = ''
    }
    return
  }
  if (box) {
    box.hidden = false
    box.className = `auth-alert ${type} animate__animated animate__fadeIn`
    box.textContent = message
  }
  if (type === 'error') {
    showErrorModal({ message, section: 'auth' })
  } else if (type === 'success') {
    showSuccessToast(message)
  }
}

function setAdminAlert(type, message) {
  const box = document.getElementById('adminAlertBox')
  if (!message) {
    clearFieldErrors(document.getElementById('adminScreen'))
    if (box) {
      box.hidden = true
      box.textContent = ''
    }
    return
  }
  if (box) {
    box.hidden = false
    box.className = `auth-alert ${type} animate__animated animate__fadeIn`
    box.textContent = message
  }
  if (type === 'error') {
    showErrorModal({ message, section: 'admin' })
  } else if (type === 'success') {
    showSuccessToast(message)
  }
}

function setProfileAlert(type, message) {
  const box = document.getElementById('profileAlertBox')
  if (!message) {
    clearFieldErrors(document.getElementById('profileScreen'))
    if (box) {
      box.hidden = true
      box.textContent = ''
    }
    return
  }
  if (box) {
    box.hidden = false
    box.className = `auth-alert ${type} animate__animated animate__fadeIn`
    box.textContent = message
  }
  if (type === 'error') {
    showErrorModal({ message, section: 'profile' })
  } else if (type === 'success') {
    showSuccessToast(message)
  }
}

function setStockAlert(type, message) {
  const box = document.getElementById('stockAlertBox')
  if (!message) {
    clearFieldErrors(document.getElementById('stockScreen'))
    if (box) {
      box.hidden = true
      box.textContent = ''
    }
    return
  }
  if (box) {
    box.hidden = false
    box.className = `auth-alert ${type} animate__animated animate__fadeIn`
    box.textContent = message
  }
  if (type === 'error') {
    showErrorModal({ message, section: 'stock' })
  } else if (type === 'success') {
    showSuccessToast(message)
  }
}

function setSettingsAlert(type, message) {
  const box = document.getElementById('settingsAlertBox')
  if (!message) {
    clearFieldErrors(document.getElementById('settingsScreen'))
    if (box) {
      box.hidden = true
      box.textContent = ''
    }
    return
  }
  if (box) {
    box.hidden = false
    box.className = `auth-alert ${type} animate__animated animate__fadeIn`
    box.textContent = message
  }
  if (type === 'error') {
    showErrorModal({ message, section: 'settings' })
  } else if (type === 'success') {
    showSuccessToast(message)
  }
}

export function switchAuthMode(mode, alertMsg = '') {
  appAuthState.authMode = mode
  renderAuthScreen()
  if (alertMsg) setAuthAlert('info', alertMsg)
}

function renderAuthScreen() {
  const authScreen = document.getElementById('authScreen')
  if (!authScreen) return

  const mode = appAuthState.authMode
  const isLogin = mode === 'login'
  const isRegister = mode === 'register'
  const isReset = mode === 'reset'
  const isUpdatePass = mode === 'update-password'

  const flowCtx = appAuthState.passwordFlowContext
  const isInviteFlow = isUpdatePass && flowCtx?.flowType === 'invite'
  const isRecoveryFlow = isUpdatePass && flowCtx?.flowType === 'recovery'
  const hasIdentityMismatch = Boolean(
    isUpdatePass &&
      flowCtx?.verified &&
      flowCtx?.userId &&
      appAuthState.user?.id &&
      String(appAuthState.user.id) !== String(flowCtx.userId)
  )
  const isFlowBlocked = Boolean(
    isUpdatePass &&
      flowCtx &&
      (flowCtx.blocked || !flowCtx.verified || hasIdentityMismatch)
  )
  const validatedEmail = String(
    (flowCtx?.verified ? flowCtx?.email : '') || appAuthState.user?.email || ''
  ).trim()

  const headingTitle = isLogin
    ? 'Ingresar al taller'
    : isRegister
      ? 'Crear cuenta de usuario'
      : isReset
        ? 'Recuperar contraseña'
        : isInviteFlow
          ? 'Activá tu cuenta'
          : isRecoveryFlow
            ? 'Recuperar contraseña'
            : 'Actualizar contraseña'

  const headingSubtitle = isLogin
    ? 'Accedé con tu cuenta para gestionar inspecciones, presupuestos y stock de tu taller.'
    : isRegister
      ? 'Registrá tus datos para crear tu taller o sumarte a un equipo existente.'
      : isReset
        ? 'Te enviaremos un enlace seguro a tu correo electrónico para restablecer tu clave.'
        : isInviteFlow
          ? 'Definí tu contraseña segura para activar tu cuenta e ingresar al taller asignado.'
          : 'Ingresá tu nueva contraseña segura (mínimo 8 caracteres).'

  authScreen.innerHTML = `
    <div class="auth-wrapper animate__animated animate__fadeIn">
      <div class="auth-card">
        <div class="auth-public-brand" id="authPublicBrand" data-brand-mode="generic">
          <span class="brand-mark auth-brand-mark" aria-hidden="true">ϟ</span>
          <div class="auth-public-brand-text">
            <strong>Crash Solution</strong>
            <span>MiTallerAPP · Portal de talleres</span>
          </div>
        </div>
        <div class="section-heading" style="margin-bottom:16px">
          <p class="eyebrow">MITALLERAPP · CRASH SOLUTION</p>
          <h1 style="font-size:24px;margin-bottom:6px">${headingTitle}</h1>
          <p class="subtitle">${headingSubtitle}</p>
        </div>

        ${
          isLogin || isRegister
            ? `<div class="auth-tabs" role="tablist">
                <button type="button" class="auth-tab ${isLogin ? 'active' : ''}" id="tabLoginBtn">Iniciar sesión</button>
                <button type="button" class="auth-tab ${isRegister ? 'active' : ''}" id="tabRegisterBtn">Crear cuenta</button>
              </div>`
            : ''
        }

        <div id="authAlertBox" class="auth-alert" role="alert" hidden></div>

        ${
          isLogin
            ? `<form id="loginForm" class="auth-form">
                <label>Correo electrónico <span class="required">*</span>
                  <input id="loginEmail" type="email" required autocomplete="email" placeholder="nombre@taller.com">
                </label>
                <label>Contraseña <span class="required">*</span>
                  <input id="loginPassword" type="password" required autocomplete="current-password" placeholder="••••••••">
                </label>
                <button type="submit" class="button primary" id="loginSubmitBtn">Iniciar sesión →</button>
                <div class="auth-links">
                  <button type="button" class="text-button" id="goToResetBtn">¿Olvidaste tu contraseña?</button>
                </div>
              </form>`
            : ''
        }

        ${
          isRegister
            ? `<form id="registerForm" class="auth-form">
                <label>Nombre y apellido <span class="required">*</span>
                  <input id="regName" type="text" required autocomplete="name" placeholder="Ej. Juan Morales">
                </label>
                <label>Teléfono / WhatsApp
                  <input id="regPhone" type="tel" autocomplete="tel" placeholder="Ej. 11 5555 1234">
                </label>
                <label>Correo electrónico <span class="required">*</span>
                  <input id="regEmail" type="email" required autocomplete="email" placeholder="nombre@taller.com">
                </label>
                <label>Contraseña (mínimo 8 caracteres) <span class="required">*</span>
                  <input id="regPassword" type="password" required minlength="8" autocomplete="new-password" placeholder="Mínimo 8 caracteres">
                </label>
                <label>Confirmar contraseña <span class="required">*</span>
                  <input id="regConfirm" type="password" required minlength="8" autocomplete="new-password" placeholder="Repetí tu contraseña">
                </label>
                <button type="submit" class="button primary" id="regSubmitBtn">Registrarme →</button>
              </form>`
            : ''
        }

        ${
          isReset
            ? `<form id="resetForm" class="auth-form">
                <label>Correo electrónico de tu cuenta <span class="required">*</span>
                  <input id="resetEmail" type="email" required autocomplete="email" placeholder="nombre@taller.com">
                </label>
                <button type="submit" class="button primary" id="resetSubmitBtn">Enviar enlace de recuperación</button>
                <div class="auth-links">
                  <button type="button" class="text-button" id="backToLoginBtn">← Volver a iniciar sesión</button>
                </div>
              </form>`
            : ''
        }

        ${
          isUpdatePass
            ? `<form id="updatePassForm" class="auth-form" data-flow-type="${esc(flowCtx?.flowType || 'authenticated')}">
                ${
                  isInviteFlow || validatedEmail
                    ? `<div class="activation-account-badge" id="activationAccountInfo" role="status">
                        <span class="activation-account-label">${
                          isInviteFlow
                            ? 'Correo electrónico de la cuenta a activar:'
                            : 'Cuenta verificada:'
                        }</span>
                        <strong id="activationAccountEmail">${esc(
                          isFlowBlocked
                            ? 'Sesión de activación no validada'
                            : validatedEmail || 'Cuenta autenticada'
                        )}</strong>
                      </div>`
                    : ''
                }
                <label>Nueva contraseña <span class="required">*</span>
                  <input id="newPasswordInput" type="password" required minlength="8" autocomplete="new-password" placeholder="Nueva contraseña (mínimo 8 caracteres)" ${isFlowBlocked ? 'disabled' : ''}>
                </label>
                <label>${isInviteFlow ? 'Confirmar contraseña' : 'Confirmar nueva contraseña'} <span class="required">*</span>
                  <input id="confirmNewPasswordInput" type="password" required minlength="8" autocomplete="new-password" placeholder="Repetí la nueva contraseña" ${isFlowBlocked ? 'disabled' : ''}>
                </label>
                <button type="submit" class="button primary" id="updatePassSubmitBtn" ${isFlowBlocked ? 'disabled' : ''}>${
                  isInviteFlow ? 'Activar cuenta' : 'Guardar nueva contraseña'
                }</button>
                ${
                  isFlowBlocked
                    ? `<div class="auth-links">
                        <button type="button" class="text-button" id="backToLoginFromBlockedBtn">← Ir a iniciar sesión</button>
                      </div>`
                    : appAuthState.user
                      ? `<div class="auth-links">
                          <button type="button" class="text-button" id="cancelUpdatePassBtn">← Volver</button>
                        </div>`
                      : ''
                }
              </form>`
            : ''
        }
      </div>
    </div>
  `

  document.getElementById('tabLoginBtn')?.addEventListener('click', () => switchAuthMode('login'))
  document.getElementById('tabRegisterBtn')?.addEventListener('click', () => switchAuthMode('register'))
  document.getElementById('goToResetBtn')?.addEventListener('click', () => switchAuthMode('reset'))
  document.getElementById('backToLoginBtn')?.addEventListener('click', () => switchAuthMode('login'))
  document.getElementById('backToLoginFromBlockedBtn')?.addEventListener('click', () => {
    appAuthState.passwordFlowContext = null
    clearCapturedInitialCallback()
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname)
    }
    switchAuthMode('login')
  })
  document.getElementById('cancelUpdatePassBtn')?.addEventListener('click', () => {
    appAuthState.passwordFlowContext = null
    clearCapturedInitialCallback()
    leavePasswordScreen()
    renderHeaderNavigation()
  })

  document.getElementById('loginForm')?.addEventListener('submit', handleLoginSubmit)
  document.getElementById('registerForm')?.addEventListener('submit', handleRegisterSubmit)
  document.getElementById('resetForm')?.addEventListener('submit', handleResetSubmit)
  document.getElementById('updatePassForm')?.addEventListener('submit', handleUpdatePasswordSubmit)
}

async function handleLoginSubmit(e) {
  e.preventDefault()
  const btn = document.getElementById('loginSubmitBtn')
  const email = document.getElementById('loginEmail')?.value
  const password = document.getElementById('loginPassword')?.value
  setAuthAlert('', '')
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Verificando credenciales…'
  }
  try {
    await signInWithEmail(email, password)
    window.toast?.('Sesión iniciada correctamente.')
  } catch (err) {
    setAuthAlert('error', err.message || 'No se pudo iniciar sesión.')
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = 'Iniciar sesión →'
    }
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault()
  const btn = document.getElementById('regSubmitBtn')
  const displayName = document.getElementById('regName')?.value
  const phone = document.getElementById('regPhone')?.value
  const email = document.getElementById('regEmail')?.value
  const password = document.getElementById('regPassword')?.value
  const confirmPassword = document.getElementById('regConfirm')?.value
  setAuthAlert('', '')
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Creando cuenta…'
  }
  try {
    const res = await signUpWithEmail({ email, password, confirmPassword, displayName, phone })
    if (res.session) {
      await onSessionEstablished(res.session)
      window.toast?.('Cuenta creada y sesión iniciada correctamente.')
    } else if (res.requiresEmailConfirmation) {
      switchAuthMode(
        'login',
        '¡Cuenta creada! Si tu servidor solicita verificación de correo, confirmalo desde tu bandeja de entrada o iniciá sesión con tus datos.'
      )
    } else {
      window.toast?.('Cuenta creada y sesión iniciada.')
    }
  } catch (err) {
    setAuthAlert('error', err.message || 'No se pudo completar el registro.')
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = 'Registrarme →'
    }
  }
}

async function handleResetSubmit(e) {
  e.preventDefault()
  const btn = document.getElementById('resetSubmitBtn')
  const email = document.getElementById('resetEmail')?.value
  setAuthAlert('', '')
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Enviando correo…'
  }
  try {
    await sendPasswordReset(email)
    setAuthAlert(
      'success',
      'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña en unos instantes.'
    )
  } catch (err) {
    setAuthAlert('error', err.message || 'No se pudo enviar el correo de recuperación.')
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = 'Enviar enlace de recuperación'
    }
  }
}

async function handleUpdatePasswordSubmit(e) {
  e.preventDefault()
  const btn = document.getElementById('updatePassSubmitBtn')
  const newPass = document.getElementById('newPasswordInput')?.value
  const confirmPass = document.getElementById('confirmNewPasswordInput')?.value
  const flowCtx = appAuthState.passwordFlowContext
  const isInviteFlow = flowCtx?.flowType === 'invite'
  const defaultBtnText = isInviteFlow ? 'Activar cuenta' : 'Guardar nueva contraseña'

  setAuthAlert('', '')

  // 1. Bloquear inmediatamente si el contexto de invitación/recuperación fue invalidado o no está verificado
  if (flowCtx && (flowCtx.blocked || !flowCtx.verified)) {
    const msg =
      flowCtx.error ||
      'No se pudo validar la sesión de la invitación o recuperación. Por seguridad, no se modificó ninguna contraseña.'
    setAuthAlert('error', msg)
    return
  }

  // 2. Verificar que exista sesión autenticada vigente y consistente con el contexto validado
  if (!appAuthState.user?.id || isSessionExpired(appAuthState.session)) {
    setAuthAlert(
      'error',
      'No hay una sesión de activación o recuperación válida activa. Abrí nuevamente el enlace del correo o iniciá sesión.'
    )
    return
  }

  const expectedUserId = flowCtx?.userId || appAuthState.user.id
  const expectedEmail = flowCtx?.email || appAuthState.user.email || null
  const forbiddenUserId =
    flowCtx?.preExistingUserId && String(flowCtx.preExistingUserId) !== String(expectedUserId)
      ? String(flowCtx.preExistingUserId)
      : null

  if (
    String(appAuthState.user.id) !== String(expectedUserId) ||
    (forbiddenUserId && String(appAuthState.user.id) === String(forbiddenUserId))
  ) {
    setAuthAlert(
      'error',
      'Bloqueo de seguridad: la identidad de la sesión activa no coincide con la cuenta de la invitación. No se modificó ninguna contraseña.'
    )
    return
  }

  if (btn) {
    btn.disabled = true
    btn.textContent = isInviteFlow ? 'Activando cuenta…' : 'Actualizando contraseña…'
  }
  try {
    const updatedUser = await updateUserPassword(newPass, confirmPass, {
      expectedUserId,
      expectedEmail,
      forbiddenUserId
    })

    if (updatedUser?.id && String(updatedUser.id) !== String(expectedUserId)) {
      throw new Error('Inconsistencia de identidad detectada al confirmar la contraseña.')
    }

    // Si es activación por invitación, verificar perfil, pertenencia al taller y rol asignado
    if (isInviteFlow) {
      const targetUser = updatedUser || appAuthState.user
      const [profile, memberships] = await Promise.all([
        ensureUserProfile(targetUser).catch(() => appAuthState.profile),
        fetchUserWorkshops(expectedUserId).catch(() => appAuthState.memberships)
      ])
      if (profile) appAuthState.profile = profile
      if (Array.isArray(memberships) && memberships.length > 0) {
        appAuthState.memberships = memberships
        if (!appAuthState.memberships.some(m => m.workshop_id === appAuthState.activeWorkshopId)) {
          appAuthState.activeWorkshopId = appAuthState.memberships[0].workshop_id
          localStorage.setItem('mitaller_active_workshop_id', appAuthState.activeWorkshopId)
        }
      }
    }

    if (flowCtx?.tokenFingerprint) {
      markTokenConsumed(flowCtx.tokenFingerprint)
    }
    appAuthState.passwordFlowContext = null
    clearCapturedInitialCallback()

    const activeMembership = getActiveMembership()
    const wsName = activeMembership?.workshop?.name || ''
    const roleLabel = activeMembership?.role ? ROLE_LABELS[activeMembership.role] || activeMembership.role : ''
    const confirmMsg = isInviteFlow
      ? wsName
        ? `Cuenta activada con éxito. Taller asignado: ${wsName}${roleLabel ? ` (${roleLabel})` : ''}.`
        : 'Cuenta activada con éxito.'
      : 'Contraseña actualizada con éxito.'

    window.toast?.(confirmMsg)
    showSuccessToast(confirmMsg)
    await leavePasswordScreen()
    renderHeaderNavigation()
  } catch (err) {
    setAuthAlert('error', err.message || 'No se pudo actualizar la contraseña.')
  } finally {
    if (btn && !appAuthState.passwordFlowContext?.blocked) {
      btn.disabled = false
      btn.textContent = defaultBtnText
    }
  }
}

export async function handleLogout() {
  privateReadCache.clear()
  const prevUserId = appAuthState.user?.id || null
  const activeMembership = getActiveMembership()
  try {
    if (prevUserId) {
      const unsynced = await getUnsyncedSummaryForUser(prevUserId)
      if (unsynced.totalUnsynced > 0 && typeof window.confirm === 'function') {
        const proceed = window.confirm(
          `Tenés ${unsynced.totalUnsynced} cambio(s) pendiente(s) de sincronizar con el servidor.\n\n` +
            `Si cerrás sesión ahora, tus trabajos pendientes NO se eliminarán: quedarán protegidos y bloqueados en este dispositivo bajo tu cuenta y se sincronizarán automáticamente cuando vuelvas a iniciar sesión.\n\n` +
            `¿Deseás cerrar sesión igualmente?`
        )
        if (!proceed) return
      }
    }

    await lockOfflineDataOnLogout({
      userId: prevUserId,
      workshopId: activeMembership?.workshop_id || null
    })
    resetHeaderBrandToGeneric()
    clearPendingEmailChange()
    clearWorkshopReadState()
    clearNavigationState()
    if (window.store) {
      window.store.jobs = []
      window.store.activeId = null
    }
    window.active = null
    appAuthState.activeWorkshopId = null
    appAuthState.activeWorkshopProfile = null
    localStorage.removeItem('mitaller_active_workshop_id')
    await signOutUser()
    appAuthState.authMode = 'login'
    appAuthState.session = null
    appAuthState.user = null
    appAuthState.profile = null
    appAuthState.memberships = []
    appAuthState.isSessionBootstrapped = false
    appAuthState.pendingSyncCount = 0
    appAuthState.unresolvedConflicts = []
    appAuthState.activePieceKey = null
    appAuthState.openPieceDetailsKeys = []
    renderHeaderNavigation()
    window.toast?.('Sesión cerrada. Los cambios pendientes quedaron resguardados en este dispositivo hasta tu próximo ingreso.')
    routeInitializedFor = null
    await getAppRouter().navigate({ name: 'jobs' }, { replace: true })
  } catch (err) {
    window.toast?.(err.message || 'Error al cerrar sesión.')
  }
}

function getCurrentActiveScreenName() {
  if (!document.getElementById('adminScreen')?.hidden) return 'admin'
  if (!document.getElementById('profileScreen')?.hidden) return 'profile'
  if (!document.getElementById('stockScreen')?.hidden) return 'stock'
  const settingsEl = document.getElementById('settingsScreen')
  if (settingsEl && !settingsEl.hidden) return 'settings'
  if (!document.getElementById('workScreen')?.hidden) return 'work'
  return 'jobs'
}

export async function preparePwaUpdate() {
  if (window.saveLocal?.(false) === false) return false
  persistCurrentNavigationState()
  const membership = getActiveMembership()
  if (appAuthState.user?.id && membership?.workshop_id && window.active) {
    // Local only: preserve the pending idempotent operation before any reload.
    await enqueueJobSyncOperation({ userId: appAuthState.user.id, workshopId: membership.workshop_id, job: window.active })
  }
  return true
}
window.preparePwaUpdate = preparePwaUpdate

export function persistCurrentNavigationState(overrides = {}, { capture = true } = {}) {
  if (!appAuthState.user?.id) return null
  if (appRouter && readAppRoute(window.location).name === 'password' && !overrides.screen) {
    return appRouter.state()?.snapshot || null
  }
  const activeMembership = getActiveMembership()
  const openDetails = Array.from(
    document.querySelectorAll('details.damage-details[open][data-piece-details]')
  )
    .map(el => el.getAttribute('data-piece-details'))
    .filter(Boolean)

  if (openDetails.length > 0 || document.querySelectorAll('details.damage-details').length > 0) {
    appAuthState.openPieceDetailsKeys = openDetails
  }

  const mapDisclosureEl = document.getElementById('mapDisclosure')

  const snapshot = saveNavigationState({
    userId: appAuthState.user.id,
    workshopId: activeMembership?.workshop_id || appAuthState.activeWorkshopId || null,
    screen: overrides.screen || getCurrentActiveScreenName(),
    jobListLimit: window.jobDisplayLimit || 60,
    stockListLimit: appAuthState.stockVisibleCount || 40,
    activeJobId:
      overrides.activeJobId !== undefined
        ? overrides.activeJobId
        : window.active?.id || window.store?.activeId || null,
    step: overrides.step || window.step || 'reception',
    area: overrides.area || window.active?.area || 'Parte delantera',
    page: overrides.page !== undefined ? overrides.page : Number(window.page || 0),
    activePieceKey:
      overrides.activePieceKey !== undefined ? overrides.activePieceKey : appAuthState.activePieceKey,
    openPieceDetailsKeys:
      overrides.openPieceDetailsKeys !== undefined
        ? overrides.openPieceDetailsKeys
        : appAuthState.openPieceDetailsKeys,
    mapOpen:
      overrides.mapOpen !== undefined
        ? overrides.mapOpen
        : mapDisclosureEl
          ? Boolean(mapDisclosureEl.open)
          : true,
    scrollY:
      overrides.scrollY !== undefined
        ? overrides.scrollY
        : typeof window !== 'undefined'
          ? Math.round(window.scrollY || 0)
          : 0
  })
  if (capture && appRouter && snapshot) appRouter.capture(snapshot)
  return snapshot
}

export async function restoreSavedNavigationState(savedOverride = null) {
  if (!appAuthState.user?.id) return false
  const activeMembership = getActiveMembership()
  const saved = savedOverride || loadNavigationState({
    userId: appAuthState.user.id,
    workshopId: activeMembership?.workshop_id || appAuthState.activeWorkshopId || null
  })
  if (!saved) return false

  if (saved.screen === 'admin') {
    await openAdminScreen()
    return true
  }
  if (saved.screen === 'settings') {
    await openSettingsScreen()
    return true
  }
  if (saved.screen === 'profile' && activeMembership) {
    await openProfileScreen()
    return true
  }
  if (saved.screen === 'stock' && activeMembership) {
    await openStockScreen()
    return true
  }
  if (saved.screen === 'work' && saved.activeJobId && window.store?.jobs?.length) {
    const targetJob = window.store.jobs.find(j => j.id === saved.activeJobId)
    if (targetJob) {
      const adminScreen = document.getElementById('adminScreen')
      const profileScreen = document.getElementById('profileScreen')
      const stockScreen = document.getElementById('stockScreen')
      const settingsScreen = document.getElementById('settingsScreen')
      const jobsScreen = document.getElementById('jobsScreen')
      const workScreen = document.getElementById('workScreen')
      const targetStep = saved.step || 'reception'
      const stepEl = document.getElementById(`${targetStep}Step`)
      const keepCurrentForm =
        window.active === targetJob &&
        window.step === targetStep &&
        workScreen?.dataset.renderedJobId === String(targetJob.id) &&
        workScreen?.dataset.renderedStep === String(targetStep) &&
        Boolean(stepEl && !stepEl.hidden) &&
        window.active?.area === saved.area &&
        Number(window.page || 0) === saved.page &&
        appAuthState.activePieceKey === saved.activePieceKey
      if (saved.area) {
        targetJob.area = saved.area
      }
      appAuthState.activePieceKey = saved.activePieceKey || null
      appAuthState.openPieceDetailsKeys = Array.isArray(saved.openPieceDetailsKeys)
        ? saved.openPieceDetailsKeys
        : []

      if (adminScreen) adminScreen.hidden = true
      if (profileScreen) profileScreen.hidden = true
      if (stockScreen) stockScreen.hidden = true
      if (settingsScreen) settingsScreen.hidden = true
      if (jobsScreen) jobsScreen.hidden = true
      if (workScreen) workScreen.hidden = false

      window.active = targetJob
      window.store.activeId = targetJob.id
      window.screen = 'work'
      if (!keepCurrentForm) {
        window.fillReception?.()
        window.showStep?.(targetStep, false)
      }
      if (workScreen) {
        workScreen.dataset.renderedJobId = String(targetJob.id)
        workScreen.dataset.renderedStep = String(window.step || targetStep)
      }
      if (targetStep === 'budget') {
        prepareBudgetDelivery().catch(() => {})
      }

      if (targetStep === 'inspection') {
        window.page = Number(saved.page || 0)
        const mapDisclosureEl = document.getElementById('mapDisclosure')
        if (mapDisclosureEl && typeof saved.mapOpen === 'boolean') {
          mapDisclosureEl.open = saved.mapOpen
        }
        if (!keepCurrentForm) window.renderInspection?.()
      }

      const openKeys = new Set(saved.openPieceDetailsKeys || [])
      document.querySelectorAll('details.damage-details[data-piece-details]').forEach(details => {
        details.open = openKeys.has(details.getAttribute('data-piece-details'))
      })
      restorePieceDomStateAfterRender()
      renderHeaderNavigation()

      if (saved.scrollY > 0 && typeof window.scrollTo === 'function') {
        requestAnimationFrame(() => {
          if (readAppRoute(window.location).name !== 'work' || appAuthState.user?.id !== saved.userId) return
          window.scrollTo({ top: saved.scrollY, behavior: 'auto' })
        })
      }
      return true
    }
  }
  return false
}

async function refreshOfflineQueueStatus() {
  const activeMembership = getActiveMembership()
  if (!appAuthState.user?.id || !activeMembership?.workshop_id) {
    appAuthState.pendingSyncCount = 0
    appAuthState.unresolvedConflicts = []
    return
  }
  const [pending, conflicts] = await Promise.all([
    getPendingSyncOperations(appAuthState.user.id, activeMembership.workshop_id),
    getUnresolvedConflicts(appAuthState.user.id, activeMembership.workshop_id)
  ])
  appAuthState.pendingSyncCount = pending.length
  appAuthState.unresolvedConflicts = conflicts
  renderConflictResolutionNotice()
}

export function renderConflictResolutionNotice() {
  const formNotice = document.getElementById('notice')
  if (!formNotice) return
  // Sync messages have a separate lifetime from the current form's validation.
  let noticeEl = document.getElementById('syncNotice')
  if (!noticeEl) {
    noticeEl = document.createElement('div')
    noticeEl.id = 'syncNotice'
    noticeEl.className = 'notice'
    noticeEl.setAttribute('role', 'status')
    formNotice.before(noticeEl)
  }

  const conflicts = appAuthState.unresolvedConflicts || []
  if (!conflicts.length) {
    if (appAuthState.isSyncingOfflineQueue) {
      noticeEl.hidden = false
      noticeEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <span>
            <b>⏳ Sincronizando tus cambios con el servidor…</b>
            Por favor, aguardá unos instantes mientras se actualizan los datos del taller.
          </span>
          <button type="button" class="button primary small-btn" id="manualSyncPendingBtn" disabled style="text-decoration:none;color:#fff">Sincronizando…</button>
        </div>
      `
      return
    }

    if (appAuthState.pendingSyncCount > 0) {
      noticeEl.hidden = false
      noticeEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <span>
            <b>⏳ Tenés ${appAuthState.pendingSyncCount} trabajo(s) modificado(s) en este dispositivo pendiente(s) de sincronizar.</b>
            ${
              appAuthState.isOnline
                ? 'Podés sincronizarlos ahora mismo.'
                : 'Se sincronizarán automáticamente en cuanto recuperes la conexión a Internet.'
            }
          </span>
          ${
            appAuthState.isOnline
              ? `<button type="button" class="button primary small-btn" id="manualSyncPendingBtn" style="text-decoration:none;color:#fff">Sincronizar ahora</button>`
              : ''
          }
        </div>
      `
      document.getElementById('manualSyncPendingBtn')?.addEventListener('click', () => {
        syncPendingJobsWithSupabase({ manual: true })
      })
      return
    }

    noticeEl.hidden = true
    noticeEl.innerHTML = ''
    return
  }

  const c = conflicts[0]
  const plate = c.localJob?.rec?.patente || c.remoteJob?.rec?.patente || 'Vehículo'
  const client = c.localJob?.rec?.cliente || c.remoteJob?.rec?.cliente || ''

  noticeEl.hidden = false
  noticeEl.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      <div>
        <b>⚠️ Diferencia de versiones detectada en ${esc(plate)} (${esc(client)})</b><br>
        <span>Otro dispositivo guardó una versión más reciente mientras trabajabas en este vehículo. Elegí cómo querés continuar para no perder información:</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="button primary small-btn" id="resolveKeepLocalBtn" style="text-decoration:none;color:#fff">Conservar mi edición actual</button>
        <button type="button" class="button secondary small-btn" id="resolveKeepRemoteBtn" style="text-decoration:none">Usar versión guardada en otro dispositivo</button>
        <button type="button" class="button secondary small-btn" id="resolveKeepBothBtn" style="text-decoration:none">Conservar ambas (crear copia)</button>
      </div>
    </div>
  `

  const handleResolve = async strategy => {
    const activeMembership = getActiveMembership()
    if (!appAuthState.user?.id || !activeMembership?.workshop_id) return
    try {
      await resolveSyncConflict({
        userId: appAuthState.user.id,
        workshopId: activeMembership.workshop_id,
        jobId: c.jobId,
        strategy
      })
      noticeEl.hidden = true
      await syncPendingJobsWithSupabase({ manual: true })
      await loadWorkshopJobsFromSupabase()
      window.toast?.('Diferencia resuelta y trabajo sincronizado correctamente.')
    } catch (err) {
      window.toast?.(err.message || 'No se pudo resolver la diferencia.')
    }
  }

  document.getElementById('resolveKeepLocalBtn')?.addEventListener('click', () => handleResolve('keep_local'))
  document.getElementById('resolveKeepRemoteBtn')?.addEventListener('click', () => handleResolve('keep_remote'))
  document.getElementById('resolveKeepBothBtn')?.addEventListener('click', () => handleResolve('keep_both'))
}

export function leavePasswordScreen() {
  if (!appAuthState.user || isSessionExpired(appAuthState.session)) return Promise.resolve()
  if (readAppRoute(window.location).name === 'password') return getAppRouter().returnFromPassword()
  hidePasswordScreen()
  return Promise.resolve()
}

export function openMyProfile() {
  if (!appAuthState.user || isSessionExpired(appAuthState.session)) return
  if (readAppRoute(window.location).name === 'password') return leavePasswordScreen().then(openMyProfile)
  clearScreenNotices()
  hidePasswordScreen()
  document.getElementById('myProfileDialog')?.remove()
  const user = appAuthState.user
  const membership = getActiveMembership()
  const roleLabel = ROLE_LABELS[membership?.role] || 'Sin taller asignado'
  let saved = {
    display_name: appAuthState.profile?.display_name || user.user_metadata?.display_name || user.user_metadata?.full_name || '',
    phone: appAuthState.profile?.phone ?? user.user_metadata?.phone ?? ''
  }
  const name = saved.display_name || 'Tu perfil'
  const avatarUrl = String(user.user_metadata?.avatar_url || '')
  const photo = /^https:\/\//i.test(avatarUrl) ? avatarUrl : ''
  const icon = path => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`
  const backIcon = icon('<path d="m12 5-7 7 7 7M5 12h14"/>')
  const personIcon = icon('<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>')
  const phoneIcon = icon('<path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a14 14 0 0 1-7-7l2-2z"/>')
  const mailIcon = icon('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>')
  const shopIcon = icon('<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-7h6v7"/>')
  const editIcon = icon('<path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/>')
  const returnFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const dialog = document.createElement('dialog')
  dialog.id = 'myProfileDialog'
  dialog.className = 'personal-profile-dialog'
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-labelledby', 'personalProfileTitle')
  dialog.innerHTML = `
    <div class="personal-profile-content" id="myProfileDialogContent">
      <div class="personal-profile-top">
        <button type="button" class="profile-back" id="backFromMyProfileBtn">${backIcon} Volver</button>
        <p class="eyebrow">CRASH SOLUTION · TU CUENTA</p>
        <h2 id="personalProfileTitle">Mi perfil</h2>
        <p>Tu información personal y tu lugar en el equipo.</p>
      </div>
      <div class="personal-profile-layout">
        <aside class="personal-profile-identity" aria-label="Identidad del usuario">
          <div class="personal-profile-avatar"><span id="personalProfileInitials">${esc(getProfileInitials(name))}</span>${photo ? `<img id="personalProfilePhoto" src="${esc(photo)}" alt="Foto de perfil" referrerpolicy="no-referrer">` : ''}</div>
          <h3 id="personalProfileName">${esc(name)}</h3>
          <span class="personal-profile-role">${personIcon}${esc(roleLabel)}</span>
          <div class="personal-profile-workshop">${shopIcon}<span>Taller activo<strong>${esc(membership?.workshop?.name || 'Sin taller asignado')}</strong></span></div>
        </aside>
        <section class="personal-profile-details" aria-labelledby="personalInfoTitle">
          <div class="personal-profile-section-heading"><h3 id="personalInfoTitle">Información personal</h3><p>Mantené actualizados tus datos de contacto.</p></div>
          <div id="personalProfileAlert" class="auth-alert" role="status" aria-live="polite" hidden></div>
          <form id="personalProfileForm">
            <div class="personal-profile-fields">
              <label for="personalName">${personIcon}Nombre completo<input id="personalName" name="display_name" autocomplete="name" required minlength="2" value="${esc(saved.display_name)}" readonly></label>
              <label for="personalPhone">${phoneIcon}Teléfono<input id="personalPhone" name="phone" type="tel" autocomplete="tel" maxlength="30" value="${esc(saved.phone)}" placeholder="Sin teléfono registrado" readonly></label>
            </div>
            <dl class="personal-profile-contact"><div><dt>${mailIcon}Correo electrónico</dt><dd id="personalProfileEmailValue">${esc(user.email || 'Sin correo registrado')}</dd></div></dl>
            <div class="personal-profile-actions">
              <button type="button" class="button secondary" id="editPersonalProfileBtn">${editIcon}Editar mis datos</button>
              <button type="submit" class="button primary" id="savePersonalProfileBtn" hidden>Guardar cambios</button>
              <button type="button" class="button secondary" id="cancelPersonalProfileBtn" hidden>Cancelar edición</button>
            </div>
          </form>
        </section>
      </div>
    </div>`
  document.body.append(dialog)
  const contentEl = dialog.querySelector('#myProfileDialogContent')
  const nameInput = dialog.querySelector('#personalName')
  const phoneInput = dialog.querySelector('#personalPhone')
  const alert = dialog.querySelector('#personalProfileAlert')
  const saveButton = dialog.querySelector('#savePersonalProfileBtn')
  let saving = false
  let pointerStartedInside = false
  const isPointInsideContent = event => {
    if (!contentEl) return false
    const rect = contentEl.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return false
    if (event.clientX === 0 && event.clientY === 0) return false
    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    )
  }
  const setEditing = editing => {
    nameInput.readOnly = phoneInput.readOnly = !editing
    dialog.querySelector('#editPersonalProfileBtn').hidden = editing
    saveButton.hidden = dialog.querySelector('#cancelPersonalProfileBtn').hidden = !editing
  }
  const dirty = () => nameInput.value !== saved.display_name || phoneInput.value !== (saved.phone || '')
  const close = () => {
    if (saving) return
    if (dirty() && !window.confirm('Tenés cambios en tu perfil sin guardar. ¿Querés descartarlos y volver?')) return
    dialog.close()
    dialog.remove()
    const menuToggle = document.getElementById('profileMenuToggle')
    if (menuToggle && menuToggle.isConnected) {
      menuToggle.focus()
    } else if (returnFocusTarget && returnFocusTarget.isConnected) {
      returnFocusTarget.focus()
    }
  }
  const markPointerOrigin = event => {
    if (
      (contentEl && contentEl.contains(event.target)) ||
      event.target?.closest?.('#appErrorModal') ||
      isPointInsideContent(event)
    ) {
      pointerStartedInside = true
    } else if (event.target === dialog) {
      pointerStartedInside = false
    }
  }
  dialog.addEventListener('pointerdown', markPointerOrigin)
  dialog.addEventListener('mousedown', markPointerOrigin)
  dialog.addEventListener('click', event => {
    if (pointerStartedInside) {
      pointerStartedInside = false
      return
    }
    if (isErrorModalOpen() || event.target?.closest?.('#appErrorModal')) return
    if (event.target !== dialog) return
    if (isPointInsideContent(event)) return
    close()
  })
  dialog.querySelector('#backFromMyProfileBtn').onclick = close
  dialog.addEventListener('cancel', event => {
    if (isErrorModalOpen()) return
    event.preventDefault()
    close()
  })
  dialog.querySelector('#personalProfilePhoto')?.addEventListener('error', event => { event.target.remove() }, { once: true })
  dialog.querySelector('#editPersonalProfileBtn').onclick = () => { alert.hidden = true; setEditing(true); nameInput.focus() }
  dialog.querySelector('#cancelPersonalProfileBtn').onclick = () => {
    nameInput.value = saved.display_name
    phoneInput.value = saved.phone || ''
    alert.hidden = true
    setEditing(false)
  }
  dialog.querySelector('#personalProfileForm').onsubmit = async event => {
    event.preventDefault()
    if (saving || nameInput.readOnly) return
    saving = true
    dialog.querySelectorAll('button').forEach(button => { button.disabled = true })
    nameInput.readOnly = phoneInput.readOnly = true
    saveButton.textContent = 'Guardando…'
    alert.hidden = true
    try {
      const updated = await updatePersonalProfile({ display_name: nameInput.value, phone: phoneInput.value })
      // Ignore a response if another account has since replaced the current session.
      if (appAuthState.user?.id !== user.id || !dialog.isConnected) return
      saved = { display_name: updated.display_name, phone: updated.phone || '' }
      appAuthState.profile = updated
      nameInput.value = saved.display_name
      phoneInput.value = saved.phone
      dialog.querySelector('#personalProfileName').textContent = saved.display_name
      dialog.querySelector('#personalProfileInitials').textContent = getProfileInitials(saved.display_name)
      renderHeaderNavigation()
      setEditing(false)
      alert.className = 'auth-alert success'
      alert.textContent = 'Tus datos se guardaron correctamente.'
      showSuccessToast('Tus datos se guardaron correctamente.')
    } catch (error) {
      setEditing(true)
      alert.className = 'auth-alert error'
      alert.textContent = error.message
      showErrorModal({
        message: error.message || 'No se pudieron actualizar tus datos personales.',
        section: 'personal_profile',
        field: nameInput
      })
    } finally {
      saving = false
      dialog.querySelectorAll('button').forEach(button => { button.disabled = false })
      saveButton.textContent = 'Guardar cambios'
      alert.hidden = false
    }
  }
  dialog.showModal()
}

export function renderHeaderNavigation() {
  const navContainer = document.getElementById('headerAuthNav')
  if (!navContainer) return

  const authenticated = !!appAuthState.user && !isSessionExpired(appAuthState.session)
  navContainer.hidden = !authenticated
  document.querySelectorAll('.header-tools').forEach(el => {
    el.hidden = true
    el.replaceChildren()
  })
  document.getElementById('saveState')?.remove()
  if (!authenticated) {
    lastHeaderMarkup = ''
    window.__headerMenuController?.abort()
    document.getElementById('myProfileDialog')?.remove()
    document.getElementById('settingsScreen')?.replaceChildren()
    renderHeaderBrand({ forceGeneric: true })
    navContainer.innerHTML = ''
    return
  }

  renderHeaderBrand()

  const activeMembership = getActiveMembership()
  const role = activeMembership?.role || 'sin taller'
  const roleLabel = ROLE_LABELS[role] || role
  const displayName =
    appAuthState.profile?.display_name ||
    appAuthState.user.user_metadata?.display_name ||
    appAuthState.user.email

  const currentRoute = readAppRoute(window.location).name
  const isAdminView = currentRoute === 'admin'
  const isStockView = currentRoute === 'stock'

  const connClass = !appAuthState.isOnline
    ? 'offline'
    : appAuthState.unresolvedConflicts.length > 0
      ? 'conflict'
      : appAuthState.pendingSyncCount > 0
        ? 'pending'
        : 'online'

  const connLabel = !appAuthState.isOnline
    ? `Sin internet${appAuthState.pendingSyncCount ? ` · ${appAuthState.pendingSyncCount} pend.` : ''}`
    : appAuthState.unresolvedConflicts.length > 0
      ? `Conflicto (${appAuthState.unresolvedConflicts.length})`
      : appAuthState.isSyncingOfflineQueue
        ? 'Sincronizando…'
        : appAuthState.pendingSyncCount > 0
          ? `En cola (${appAuthState.pendingSyncCount})`
          : 'En línea'

  const markup = `
    <button type="button" id="mobileNavToggle" class="nav-pill mobile-nav-toggle" aria-expanded="false" aria-controls="primaryNavigation">☰ Menú</button>
    <nav id="primaryNavigation" class="primary-navigation" aria-label="Navegación principal">
    <button type="button" class="nav-pill ${['jobs', 'work'].includes(currentRoute) ? 'active' : ''}" id="navJobsBtn">Trabajos</button>
    ${activeMembership ? `<button type="button" class="nav-pill ${isStockView ? 'active' : ''}" id="navStockBtn">Stock / Depósito</button>` : ''}
    ${canAccessAdminPanel(role) ? `<button type="button" class="nav-pill ${isAdminView ? 'active' : ''}" id="navAdminBtn">Administración</button>` : ''}
    </nav>
    <div class="profile-menu-wrap">
    <button type="button" class="profile-toggle" id="profileMenuToggle" aria-label="Abrir menú de usuario" aria-expanded="false" aria-controls="userMenu">${esc(String(displayName || 'U').charAt(0).toUpperCase())}</button>
    <div id="userMenu" class="profile-dropdown" hidden>
    <div class="profile-identity"><strong>${esc(displayName)}</strong><span class="role-chip ${esc(role)}">${esc(roleLabel)}</span></div>
    <button type="button" id="navMyProfileBtn">Mi perfil</button>
    ${activeMembership || appAuthState.memberships.length > 0 ? `<button type="button" id="navProfileBtn" ${currentRoute === 'profile' ? 'aria-current="page"' : ''}>Mi taller</button>` : ''}
    <button type="button" id="navSettingsBtn" ${['settings', 'password'].includes(currentRoute) ? 'aria-current="page"' : ''}>Configuración</button>
    <span id="connectivityBadge" class="conn-badge ${connClass}" role="status" aria-live="polite" title="Estado de conexión y sincronización">
      <span class="conn-dot"></span>
      <span>${esc(connLabel)}</span>
    </span>
    <button type="button" id="navLogoutBtn">Cerrar sesión</button>
    </div></div>
  `
  const settingsEl = ensureSettingsScreenElement()
  if (settingsEl && !settingsEl.querySelector('#settingsPasswordForm')) {
    renderSettingsScreen()
  }

  if (lastHeaderMarkup === markup && navContainer.dataset.navBound === 'true' && navContainer.querySelector('#profileMenuToggle')) return
  navContainer.innerHTML = markup
  navContainer.dataset.navBound = 'true'
  lastHeaderMarkup = markup
  navContainer.querySelectorAll('.primary-navigation .active').forEach(button => button.setAttribute('aria-current', 'page'))

  const closeMenus = () => {
    document.getElementById('userMenu').hidden = true
    document.getElementById('profileMenuToggle').setAttribute('aria-expanded', 'false')
    document.getElementById('primaryNavigation').classList.remove('is-open')
    document.getElementById('mobileNavToggle').setAttribute('aria-expanded', 'false')
  }
  document.getElementById('profileMenuToggle').onclick = () => {
    const menu = document.getElementById('userMenu')
    const opening = menu.hidden
    closeMenus()
    menu.hidden = !opening
    document.getElementById('profileMenuToggle').setAttribute('aria-expanded', String(opening))
  }
  document.getElementById('mobileNavToggle').onclick = () => {
    const opening = !document.getElementById('primaryNavigation').classList.contains('is-open')
    closeMenus()
    document.getElementById('primaryNavigation').classList.toggle('is-open', opening)
    document.getElementById('mobileNavToggle').setAttribute('aria-expanded', String(opening))
  }
  // Replace listeners on each render to avoid accumulating document handlers.
  window.__headerMenuController?.abort()
  const controller = new AbortController()
  window.__headerMenuController = controller
  document.addEventListener('click', e => { if (!navContainer.contains(e.target)) closeMenus() }, { signal: controller.signal })
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const menuOpen = !document.getElementById('userMenu')?.hidden || document.getElementById('primaryNavigation')?.classList.contains('is-open')
      closeMenus()
      if (menuOpen) document.getElementById('profileMenuToggle')?.focus()
    }
  }, { signal: controller.signal })
  navContainer.addEventListener('click', e => {
    if (e.target.closest('#userMenu button, #primaryNavigation button')) closeMenus()
  }, { signal: controller.signal })
  document.getElementById('navSettingsBtn').onclick = () => { openSettingsScreen() }
  document.getElementById('navMyProfileBtn').onclick = openMyProfile

  document.getElementById('navJobsBtn')?.addEventListener('click', () => {
    navigateAppRoute({ name: 'jobs' })
  })

  document.getElementById('navStockBtn')?.addEventListener('click', () => {
    openStockScreen()
  })

  document.getElementById('navProfileBtn')?.addEventListener('click', () => {
    openProfileScreen()
  })

  document.getElementById('navAdminBtn')?.addEventListener('click', () => {
    openAdminScreen()
  })

  document.getElementById('navLogoutBtn')?.addEventListener('click', handleLogout)
}

const workshopDraftJobsByScope = new Map()

export async function switchActiveWorkshop(targetWorkshopId) {
  if (!targetWorkshopId) return false
  const targetMembership = appAuthState.memberships.find(m => m.workshop_id === targetWorkshopId)
  if (!targetMembership) return false

  const userId = appAuthState.user?.id
  const previousMembership = getActiveMembership()
  const previousWorkshopId = previousMembership?.workshop_id || appAuthState.activeWorkshopId

  // 1. Conservar navegación y borradores del taller anterior antes de cambiar
  if (userId && previousWorkshopId) {
    persistCurrentNavigationState()
    if (!document.getElementById('workScreen')?.hidden) {
      syncActiveJobFromDom()
    }
    const currentJobs = Array.isArray(window.store?.jobs) ? [...window.store.jobs] : []
    if (window.active && !currentJobs.some(j => j.id === window.active.id)) {
      currentJobs.unshift(window.active)
    }
    if (currentJobs.length > 0) {
      workshopDraftJobsByScope.set(`${userId}:${previousWorkshopId}`, JSON.parse(JSON.stringify(currentJobs)))
      for (const jobItem of currentJobs) {
        await saveOfflineJob({
          userId,
          workshopId: previousWorkshopId,
          job: jobItem,
          syncStatus: 'pending'
        }).catch(() => {})
      }
    }
    if (window.active?.rec?.cliente?.trim() && window.active?.rec?.patente?.trim()) {
      clearTimeout(window.__jobCloudTimer)
      window.__jobCloudTimer = null
      await enqueueJobSyncOperation({
        userId,
        workshopId: previousWorkshopId,
        job: window.active
      }).catch(() => {})
    }
  }

  // 2. Activar el nuevo taller y aislar cachés/estados
  headerBrandVersion++
  appAuthState.activeWorkshopId = targetWorkshopId
  appAuthState.activeWorkshopProfile = targetMembership.workshop ? { ...targetMembership.workshop } : null
  clearWorkshopReadState()
  appAuthState.activeWorkshopProfile = targetMembership.workshop ? { ...targetMembership.workshop } : null
  if (window.store) {
    window.store.shop = {
      ...DEFAULT_GENERIC_SHOP,
      ...(targetMembership.workshop || {}),
      logo_url: targetMembership.workshop?.logo_url || ''
    }
  }
  renderHeaderBrand({ workshop: appAuthState.activeWorkshopProfile })
  privateReadCache.activate({ userId, workshopId: targetWorkshopId })
  localStorage.setItem('mitaller_active_workshop_id', targetWorkshopId)
  appAuthState.workshopSettings = getWorkshopSettings(targetWorkshopId)

  const restoredMemoryJobs = userId ? workshopDraftJobsByScope.get(`${userId}:${targetWorkshopId}`) : null
  if (window.store) {
    window.store.jobs = restoredMemoryJobs ? JSON.parse(JSON.stringify(restoredMemoryJobs)) : []
    window.store.activeId = null
  }
  window.active = null

  // 3. Actualizar perfil comercial, trabajos, stock y permisos del nuevo taller
  await syncActiveWorkshopToLegacyStore()
  await loadWorkshopJobsFromSupabase()
  if (restoredMemoryJobs?.length && window.store && (!window.store.jobs || !window.store.jobs.length)) {
    window.store.jobs = JSON.parse(JSON.stringify(restoredMemoryJobs))
  }
  try {
    const nextStock = await fetchWorkshopStock(targetWorkshopId, { force: true })
    if (appAuthState.activeWorkshopId === targetWorkshopId) {
      appAuthState.stockItems = nextStock
    }
  } catch {
    // Mantiene lista vacía si el taller no tiene stock o está sin conexión
  }

  renderHeaderNavigation()

  if (!document.getElementById('profileScreen')?.hidden) {
    await renderProfileScreen()
    setProfileAlert(
      'success',
      `Taller activo cambiado a "${targetMembership.workshop?.name || targetWorkshopId}" (${ROLE_LABELS[targetMembership.role] || targetMembership.role}).`
    )
  } else if (!document.getElementById('adminScreen')?.hidden) {
    await renderAdminScreen()
  } else if (!document.getElementById('stockScreen')?.hidden) {
    await renderStockScreen({ force: true })
  } else if (!document.getElementById('settingsScreen')?.hidden) {
    await renderSettingsScreen()
  } else if (!document.getElementById('jobsScreen')?.hidden) {
    window.renderJobs?.()
  }

  await enforceRouteProtection()
  window.toast?.(`Taller activo: ${targetMembership.workshop?.name || targetWorkshopId}`)
  return true
}

export async function syncActiveWorkshopToLegacyStore({ useMembership = false } = {}) {
  const expectedScope = routeScope()
  const expectedBrandVersion = headerBrandVersion
  const cacheToken = privateReadCache.token()
  const activeMembership = getActiveMembership()
  if (!activeMembership?.workshop || !window.store) return
  let ws = activeMembership.workshop

  try {
    const freshProfile = useMembership
      ? rememberWorkshopProfile({ ...ws, logo_url: await resolveWorkshopLogoUrl(ws.logo_path) }, cacheToken)
      : await fetchWorkshopProfile(ws.id)
    if (freshProfile) {
      ws = freshProfile
      activeMembership.workshop = freshProfile
      appAuthState.activeWorkshopProfile = freshProfile
    }
  } catch {
    const logoUrl = await resolveWorkshopLogoUrl(ws.logo_path)
    ws = { ...ws, logo_url: logoUrl }
    appAuthState.activeWorkshopProfile = ws
  }

  if (
    routeScope() !== expectedScope ||
    expectedBrandVersion !== headerBrandVersion ||
    !appAuthState.user ||
    isSessionExpired(appAuthState.session)
  ) {
    return
  }
  window.store.shop = {
    ...window.store.shop,
    id: ws.id,
    name: ws.name || 'Crash Solution',
    legal_name: ws.legal_name || '',
    tax_id: ws.tax_id || '',
    logo_path: ws.logo_path || '',
    logo_url: ws.logo_url || '',
    phone: ws.phone || '',
    whatsapp: ws.whatsapp || '',
    email: ws.email || '',
    address: ws.address || ''
  }

  renderHeaderBrand({ workshop: ws })
}

export async function syncPendingJobsWithSupabase({ manual = false } = {}) {
  const activeMembership = getActiveMembership()
  if (!supabase || !appAuthState.user?.id || !activeMembership?.workshop_id) {
    if (manual) {
      window.toast?.('Seleccioná un taller activo para sincronizar.')
    }
    return null
  }
  if (!appAuthState.isOnline) {
    if (manual) {
      window.toast?.('Sin conexión a Internet. Tus cambios están guardados y se sincronizarán al recuperar la red.')
    }
    return null
  }

  if (appAuthState.isSyncingOfflineQueue) {
    if (manual) {
      window.toast?.('Sincronización en curso. Aguardá unos instantes.')
    }
    return null
  }

  if (isSessionExpired(appAuthState.session)) {
    await handleExpiredSession()
    return null
  }

  // Si hay un guardado en espera (debounce) del trabajo abierto, encolarlo antes de sincronizar
  if (window.__jobCloudTimer) {
    clearTimeout(window.__jobCloudTimer)
    window.__jobCloudTimer = null
    if (window.active?.rec?.cliente?.trim() && window.active?.rec?.patente?.trim()) {
      await enqueueJobSyncOperation({
        userId: appAuthState.user.id,
        workshopId: activeMembership.workshop_id,
        job: window.active
      }).catch(() => null)
    }
  }

  appAuthState.isSyncingOfflineQueue = true
  renderConflictResolutionNotice()
  renderHeaderNavigation()

  try {
    const result = await processSyncQueue({
      supabaseClient: supabase,
      session: appAuthState.session,
      userId: appAuthState.user.id,
      workshopId: activeMembership.workshop_id,
      isOnline: appAuthState.isOnline
    })

    appAuthState.isSyncingOfflineQueue = false
    await refreshOfflineQueueStatus()
    renderHeaderNavigation()

    if (result.conflicts > 0) {
      window.toast?.('Se detectó una diferencia con otra edición guardada. Elegí cómo continuar en el aviso superior.')
    } else if (result.failed > 0) {
      window.toast?.(
        'No se pudo completar la sincronización en este momento. Tus cambios siguen resguardados en este dispositivo.'
      )
    } else if (result.synced > 0) {
      if (manual) {
        window.toast?.(
          result.synced === 1
            ? 'Sincronización completada: 1 trabajo actualizado.'
            : `Sincronización completada: ${result.synced} trabajos actualizados.`
        )
      }
    } else if (manual) {
      window.toast?.('No hay cambios pendientes para sincronizar. Todo está al día.')
    }

    return result
  } catch (err) {
    appAuthState.isSyncingOfflineQueue = false
    await refreshOfflineQueueStatus()
    renderHeaderNavigation()
    if (manual) {
      window.toast?.('No se pudo conectar con el servidor. Tus cambios permanecen guardados en este dispositivo.')
    }
    return null
  } finally {
    appAuthState.isSyncingOfflineQueue = false
    renderConflictResolutionNotice()
    renderHeaderNavigation()
  }
}

function syncActiveJobReferenceInMemory() {
  if (!window.active?.id || !Array.isArray(window.store?.jobs)) return
  const currentArea = window.active.area
  const matchedIdx = window.store.jobs.findIndex(j => j.id === window.active.id)
  if (matchedIdx >= 0) {
    const matched = window.store.jobs[matchedIdx]
    const activeTime = Date.parse(window.active.updatedAt || '') || 0
    const matchedTime = Date.parse(matched.updatedAt || '') || 0
    if (window.__jobCloudTimer || activeTime > matchedTime) {
      window.store.jobs[matchedIdx] = window.active
    } else {
      if (currentArea) matched.area = currentArea
      window.active = matched
    }
  } else {
    window.store.jobs.unshift(window.active)
  }
}

export async function loadWorkshopJobsFromSupabase() {
  const scope = routeScope()
  if (jobsLoadPromise && jobsLoadScope === scope) return jobsLoadPromise
  jobsLoadScope = scope
  const promise = loadWorkshopJobsUncached().finally(() => { if (jobsLoadPromise === promise) jobsLoadPromise = null })
  jobsLoadPromise = promise
  return promise
}

async function loadWorkshopJobsUncached() {
  const activeMembership = getActiveMembership()
  if (!appAuthState.user?.id || !activeMembership?.workshop_id || !window.store) return

  const userId = appAuthState.user.id
  const workshopId = activeMembership.workshop_id

  // 1. Migrar de forma verificada trabajos previos de localStorage a IndexedDB sin sobrescribir localStorage ni duplicar
  await migrateLegacyLocalStorageJobs({ userId, workshopId })

  // 2. Cargar inmediatamente los trabajos persistidos en IndexedDB para este usuario y taller (permite uso inmediato sin internet)
  const localIndexedDbJobs = await getOfflineJobsForScope(userId, workshopId)
  if (appAuthState.user?.id !== userId || getActiveMembership()?.workshop_id !== workshopId) return
  if (localIndexedDbJobs.length > 0) {
    window.store.jobs = localIndexedDbJobs.map(j => (window.adaptJob ? window.adaptJob(j) : j))
    syncActiveJobReferenceInMemory()
    if (window.screen === 'jobs') {
      window.renderJobs?.()
    } else if (window.screen === 'work' && window.active) {
      window.updateWorkHeading?.()
    }
  }

  await refreshOfflineQueueStatus()
  renderHeaderNavigation()

  if (!appAuthState.isOnline || !supabase) {
    return
  }

  // 3. Si estamos en línea y con sesión válida, procesar primero la cola pendiente antes de traer el listado remoto
  await syncPendingJobsWithSupabase()

  try {
    const data = await fetchAllPages(() => supabase
      .from('jobs')
      .select('id, workshop_id, job_number, status, revision, payload, customer_name, vehicle_plate, created_at, updated_at')
      .eq('workshop_id', workshopId)
      .order('updated_at', { ascending: false }).order('id', { ascending: true }))
    if (appAuthState.user?.id !== userId || getActiveMembership()?.workshop_id !== workshopId) return

    const remoteJobs = (data || []).map(row => {
      const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
      return {
        ...payload,
        id: row.id,
        number: row.job_number || payload.number || `OT-${String(row.id).slice(0, 6).toUpperCase()}`,
        status: row.status || payload.status || 'Borrador',
        createdAt: row.created_at || payload.createdAt || new Date().toISOString(),
        updatedAt: row.updated_at || payload.updatedAt || new Date().toISOString(),
        cloudRevision: row.revision || 1,
        rec: {
          ...(payload.rec || {}),
          cliente: row.customer_name || payload.rec?.cliente || '',
          patente: row.vehicle_plate || payload.rec?.patente || ''
        }
      }
    })

    // No sobrescribir trabajos locales que tengan operaciones pendientes o conflictos sin resolver
    const [pendingOps, unresolvedConflicts] = await Promise.all([
      getPendingSyncOperations(userId, workshopId),
      getUnresolvedConflicts(userId, workshopId)
    ])
    const protectedLocalIds = new Set([
      ...pendingOps.map(op => op.entityId),
      ...unresolvedConflicts.map(c => c.jobId)
    ])

    for (const rJob of remoteJobs) {
      if (!protectedLocalIds.has(rJob.id)) {
        await saveOfflineJob({
          userId,
          workshopId,
          job: rJob,
          syncStatus: 'synced'
        })
      }
    }

    const mergedJobs = await getOfflineJobsForScope(userId, workshopId)
    if (appAuthState.user?.id !== userId || getActiveMembership()?.workshop_id !== workshopId) return
    window.store.jobs = mergedJobs.map(j => (window.adaptJob ? window.adaptJob(j) : j))
    syncActiveJobReferenceInMemory()
    if (window.screen === 'jobs') {
      window.renderJobs?.()
    } else if (window.screen === 'work' && window.active) {
      window.updateWorkHeading?.()
    }
    await refreshOfflineQueueStatus()
    renderHeaderNavigation()
  } catch (err) {
    if (String(err?.message || '').toLowerCase().includes('jwt expired')) await handleExpiredSession()
    console.warn('Error al cargar trabajos desde Supabase (usando copia local IndexedDB):', err)
  }
}

export async function saveActiveJobToSupabase(job) {
  const activeMembership = getActiveMembership()
  if (!appAuthState.user?.id || !activeMembership?.workshop_id || !job?.id) return
  if (!job.rec?.cliente?.trim() || !job.rec?.patente?.trim()) return

  const userId = appAuthState.user.id
  const workshopId = activeMembership.workshop_id

  try {
    // 1. Persistir siempre primero en IndexedDB y en la cola idempotente de sincronización
    await enqueueJobSyncOperation({
      userId,
      workshopId,
      job
    })
    await refreshOfflineQueueStatus()
    renderHeaderNavigation()

    // 2. Si no hay conexión, conservar en la cola local
    if (!appAuthState.isOnline || !supabase) {
      return
    }

    // 3. Si hay conexión y sesión válida, ejecutar la cola idempotente
    await syncPendingJobsWithSupabase()
  } catch (err) {
    console.warn('Trabajo resguardado en cola local IndexedDB tras error de red:', err)
  }
}

// ============================================================================
// DEV-19: Pantalla de Perfil del Taller + Logo en Supabase Storage + PDF
// ============================================================================
export async function openProfileScreen({ fromRoute = false } = {}) {
  if (!fromRoute) return navigateAppRoute({ name: 'profile' })
  if (!appAuthState.user || isSessionExpired(appAuthState.session)) {
    await enforceRouteProtection()
    return
  }
  const activeMembership = getActiveMembership()
  if (!activeMembership) {
    await openAdminScreen()
    return
  }
  const jobsScreen = document.getElementById('jobsScreen')
  const workScreen = document.getElementById('workScreen')
  const adminScreen = document.getElementById('adminScreen')
  const stockScreen = document.getElementById('stockScreen')
  const settingsScreen = document.getElementById('settingsScreen')
  const profileScreen = document.getElementById('profileScreen')
  if (jobsScreen) jobsScreen.hidden = true
  if (workScreen) workScreen.hidden = true
  if (adminScreen) adminScreen.hidden = true
  if (stockScreen) stockScreen.hidden = true
  if (settingsScreen) settingsScreen.hidden = true
  if (profileScreen) profileScreen.hidden = false
  persistCurrentNavigationState({ screen: 'profile' })
  renderHeaderNavigation()
  await renderProfileScreen()
}

export async function renderProfileScreen() {
  const expectedScope = routeScope()
  const profileScreen = document.getElementById('profileScreen')
  if (!profileScreen) return

  const activeMembership = getActiveMembership()
  if (!activeMembership?.workshop) {
    profileScreen.innerHTML = `<div class="notice">Seleccioná o registrá un taller desde la sección <b>Administración</b> para configurar su perfil.</div>`
    return
  }

  let ws = appAuthState.activeWorkshopProfile || activeMembership.workshop
  try {
    ws = await fetchWorkshopProfile(activeMembership.workshop.id)
    if (routeScope() !== expectedScope) return
    appAuthState.activeWorkshopProfile = ws
    activeMembership.workshop = ws
  } catch (err) {
    console.warn('Usando datos en caché del taller:', err)
  }

  const canEdit = canAccessAdminPanel(activeMembership.role)
  const previewHeaderHtml = buildBudgetWorkshopHeaderHtml(ws, 'OT-DEMO01', '03/11/2026', '18/11/2026')
  const activeRoleLabel = ROLE_LABELS[activeMembership.role] || activeMembership.role
  const workshopOptions = appAuthState.memberships
    .map(
      m =>
        `<option value="${esc(m.workshop_id)}" ${
          m.workshop_id === activeMembership?.workshop_id ? 'selected' : ''
        }>${esc(m.workshop?.name || m.workshop_id)} (${esc(ROLE_LABELS[m.role] || m.role)})</option>`
    )
    .join('')

  if (routeScope() !== expectedScope) return
  profileScreen.innerHTML = `
    <div class="personal-profile-top unified-screen-top">
      <div class="unified-screen-top-bar">
        <button type="button" class="profile-back" id="backFromProfileBtn">← Volver</button>
      </div>
      <p class="eyebrow">IDENTIDAD COMERCIAL Y PRESUPUESTOS</p>
      <h1>Mi taller</h1>
      <p>Configurá los datos comerciales, de contacto y el logo oficial que se incluyen automáticamente en todos los presupuestos en PDF y mensajes de WhatsApp.</p>
    </div>

    <div id="profileAlertBox" class="auth-alert" role="alert" hidden></div>

    <div class="admin-card workshop-selector-card" style="margin-bottom:20px">
      <div class="workshop-selector-header">
        <div>
          <span class="eyebrow">TALLER ASIGNADO</span>
          <h2 id="activeWorkshopSectionTitle">Taller o sucursal activa</h2>
          <p class="subtitle">Seleccioná el taller con el que querés operar. Al cambiar de taller se actualizan sus trabajos, stock, perfil comercial y permisos.</p>
        </div>
        <div class="active-workshop-summary" id="activeWorkshopSummary">
          <span class="small muted">Taller activo:</span>
          <strong id="activeWorkshopNameBadge">${esc(ws.name || activeMembership.workshop.name)}</strong>
          <span class="role-chip ${esc(activeMembership.role)}" id="activeWorkshopRoleBadge">${esc(activeRoleLabel)}</span>
        </div>
      </div>
      <div class="workshop-selector-controls">
        <label for="activeWorkshopSelect" class="workshop-selector-label">
          <span>Seleccionar taller o sucursal</span>
          <select id="activeWorkshopSelect" class="workshop-switcher" aria-label="Taller o sucursal activa">
            ${workshopOptions}
          </select>
        </label>
      </div>
    </div>

    ${
      !canEdit
        ? `<div class="notice">Tu rol actual en este taller es <b>${esc(activeRoleLabel)}</b>. Podés consultar los datos del taller, pero solo el Propietario o Administrador pueden modificarlos.</div>`
        : ''
    }

    <div class="admin-grid">
      <!-- Columna 1: Formulario de Datos del Taller + Logo -->
      <div class="admin-card">
        <span class="eyebrow">DATOS DEL TALLER</span>
        <h2>Información comercial y de contacto</h2>
        <p class="subtitle">Estos datos identifican a tu taller frente a cada cliente.</p>

        <div class="logo-uploader" style="margin:16px 0">
          <div class="logo-preview-box" id="logoPreviewContainer">
            ${
              ws.logo_url
                ? `<img src="${esc(ws.logo_url)}" alt="Logo de ${esc(ws.name)}" id="workshopLogoImg">`
                : `<span class="logo-placeholder">Sin logo<br>cargado</span>`
            }
          </div>
          <div style="flex:1;min-width:210px">
            <h3 style="margin-bottom:4px">Logo del taller</h3>
            <p class="small muted" style="margin:0 0 10px">Se mostrará en el encabezado de tus presupuestos. Formatos admitidos: PNG, JPEG o WEBP (máximo 2 MB).</p>
            ${
              canEdit
                ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
                    <label class="button secondary small-btn" style="cursor:pointer">
                      Subir / actualizar logo
                      <input type="file" id="workshopLogoInput" accept="image/png,image/jpeg,image/webp" hidden>
                    </label>
                    <button type="button" class="button danger small-btn" id="removeLogoBtn" ${ws.logo_path ? '' : 'hidden'}>Quitar logo</button>
                  </div>`
                : ''
            }
          </div>
        </div>

        <form id="workshopProfileForm" class="form-grid">
          <label class="span-two">Nombre comercial <span class="required">*</span>
            <input id="profName" required maxlength="80" value="${esc(ws.name || '')}" ${!canEdit ? 'disabled' : ''} placeholder="Ej. Crash Solution">
          </label>
          <label>Razón social
            <input id="profLegalName" maxlength="120" value="${esc(ws.legal_name || '')}" ${!canEdit ? 'disabled' : ''} placeholder="Ej. Crash Solution S.R.L.">
          </label>
          <label>CUIT
            <input id="profTaxId" maxlength="15" value="${esc(ws.tax_id || '')}" ${!canEdit ? 'disabled' : ''} placeholder="Ej. 30-71234567-1">
          </label>
          <label>Teléfono fijo / principal
            <input id="profPhone" type="tel" maxlength="40" value="${esc(ws.phone || '')}" ${!canEdit ? 'disabled' : ''} placeholder="Ej. 011 4555-1234">
          </label>
          <label>WhatsApp de contacto (presupuestos)
            <input id="profWhatsapp" type="tel" maxlength="40" value="${esc(ws.whatsapp || '')}" ${!canEdit ? 'disabled' : ''} placeholder="Ej. +54 9 11 5555-1234">
          </label>
          <label class="span-two">Correo electrónico comercial
            <input id="profEmail" type="email" maxlength="120" value="${esc(ws.email || '')}" ${!canEdit ? 'disabled' : ''} placeholder="presupuestos@crashsolution.com.ar">
          </label>
          <label class="span-two">Dirección física del taller
            <input id="profAddress" maxlength="160" value="${esc(ws.address || '')}" ${!canEdit ? 'disabled' : ''} placeholder="Av. Warnes 1234, CABA">
          </label>
          ${
            canEdit
              ? `<div class="span-two" style="margin-top:6px">
                  <button type="submit" class="button primary" id="saveProfileBtn" style="width:100%">Guardar datos del taller</button>
                </div>`
              : ''
          }
        </form>
      </div>

      <!-- Columna 2: Vista previa en tiempo real para PDF + Respaldo -->
      <div class="admin-card">
        <span class="eyebrow">VISTA PREVIA DEL ENCABEZADO</span>
        <h2>Encabezado automático de presupuestos</h2>
        <p class="subtitle">Así se verá el encabezado en todos los presupuestos emitidos por tu taller.</p>

        <div class="budget-header-preview" id="liveBudgetHeaderPreview" style="margin:16px 0">
          ${previewHeaderHtml}
        </div>

        <details class="quiet-details" open>
          <summary>Datos incluidos automáticamente en cada presupuesto</summary>
          <ul class="small muted" style="line-height:1.7;padding-left:18px;margin:8px 0">
            <li><b>Nombre comercial y Razón social:</b> encabezan el PDF y el resumen de WhatsApp.</li>
            <li><b>CUIT:</b> se muestra debajo de la razón social con formato oficial.</li>
            <li><b>Logo del taller:</b> se incorpora automáticamente en la esquina superior del presupuesto.</li>
            <li><b>Teléfono, WhatsApp, Correo y Dirección:</b> figuran como canales de contacto directo para el cliente.</li>
          </ul>
        </details>

        <details class="quiet-details">
          <summary>Copia de respaldo (Exportar / Importar)</summary>
          <p class="muted small">Descargá una copia de seguridad de tus trabajos o restaurá un archivo guardado previamente.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
            <button type="button" class="button secondary small-btn" id="profExportBackupBtn">Descargar copia de respaldo</button>
            <label class="button secondary small-btn" style="cursor:pointer">
              Importar copia de respaldo
              <input type="file" id="profImportBackupInput" accept=".json,application/json" hidden>
            </label>
          </div>
        </details>
      </div>
    </div>
  `

  document.getElementById('backFromProfileBtn')?.addEventListener('click', () => {
    goBackAppRoute({ name: 'jobs' })
  })

  document.getElementById('activeWorkshopSelect')?.addEventListener('change', async e => {
    await switchActiveWorkshop(e.target.value)
  })

  // Formateo automático de CUIT al salir del campo y actualización de vista previa en vivo
  const cuitInput = document.getElementById('profTaxId')
  cuitInput?.addEventListener('blur', () => {
    if (cuitInput.value.trim()) {
      cuitInput.value = formatCuit(cuitInput.value)
      updateLivePreview()
    }
  })

  const updateLivePreview = () => {
    const previewBox = document.getElementById('liveBudgetHeaderPreview')
    if (!previewBox) return
    const draftWorkshop = {
      ...ws,
      name: document.getElementById('profName')?.value || ws.name,
      legal_name: document.getElementById('profLegalName')?.value || '',
      tax_id: document.getElementById('profTaxId')?.value || '',
      phone: document.getElementById('profPhone')?.value || '',
      whatsapp: document.getElementById('profWhatsapp')?.value || '',
      email: document.getElementById('profEmail')?.value || '',
      address: document.getElementById('profAddress')?.value || ''
    }
    previewBox.innerHTML = buildBudgetWorkshopHeaderHtml(draftWorkshop, 'OT-DEMO01', '03/11/2026', '18/11/2026')
  }

  ;['profName', 'profLegalName', 'profTaxId', 'profPhone', 'profWhatsapp', 'profEmail', 'profAddress'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateLivePreview)
  })

  document.getElementById('workshopLogoInput')?.addEventListener('change', async e => {
    if (!canEdit || e.target.disabled) return
    const file = e.target.files?.[0]
    if (!file) return
    e.target.disabled = true
    setProfileAlert('info', 'Subiendo y procesando logo del taller…')
    try {
      ws = await uploadWorkshopLogo(ws.id, file)
      appAuthState.activeWorkshopProfile = ws
      activeMembership.workshop = ws
      await syncActiveWorkshopToLegacyStore()
      // Keep unsaved form fields intact while updating the stored logo preview.
      const preview = document.getElementById('logoPreviewContainer')
      if (preview) preview.innerHTML = `<img src="${esc(ws.logo_url)}" alt="Logo de ${esc(ws.name)}" id="workshopLogoImg">`
      const removeButton = document.getElementById('removeLogoBtn')
      if (removeButton) removeButton.hidden = false
      updateLivePreview()
      setProfileAlert('success', 'Logo guardado correctamente')
    } catch (err) {
      setProfileAlert('error', err.message || 'No se pudo subir el logo del taller.')
    } finally {
      e.target.value = ''
      e.target.disabled = false
    }
  })

  document.getElementById('removeLogoBtn')?.addEventListener('click', async () => {
    if (!canEdit) return
    setProfileAlert('', '')
    try {
      const updated = await updateWorkshopProfile(ws.id, {
        ...ws,
        logo_path: null
      })
      ws = updated
      appAuthState.activeWorkshopProfile = ws
      activeMembership.workshop = ws
      await syncActiveWorkshopToLegacyStore()
      const preview = document.getElementById('logoPreviewContainer')
      if (preview) preview.innerHTML = '<span class="logo-placeholder">Sin logo<br>cargado</span>'
      document.getElementById('removeLogoBtn').hidden = true
      updateLivePreview()
      setProfileAlert('success', 'Logo quitado del perfil del taller.')
    } catch (err) {
      setProfileAlert('error', err.message || 'No se pudo quitar el logo.')
    }
  })

  document.getElementById('workshopProfileForm')?.addEventListener('submit', async e => {
    e.preventDefault()
    if (!canEdit) return
    const btn = document.getElementById('saveProfileBtn')
    setProfileAlert('', '')
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Guardando cambios…'
    }
    try {
      const updated = await updateWorkshopProfile(ws.id, {
        name: document.getElementById('profName')?.value,
        legal_name: document.getElementById('profLegalName')?.value,
        tax_id: document.getElementById('profTaxId')?.value,
        phone: document.getElementById('profPhone')?.value,
        whatsapp: document.getElementById('profWhatsapp')?.value,
        email: document.getElementById('profEmail')?.value,
        address: document.getElementById('profAddress')?.value,
        logo_path: ws.logo_path
      })
      ws = updated
      appAuthState.activeWorkshopProfile = updated
      activeMembership.workshop = updated
      await syncActiveWorkshopToLegacyStore()
      renderHeaderNavigation()
      updateLivePreview()
      setProfileAlert('success', 'Datos del taller actualizados correctamente.')
      window.toast?.('Datos del taller guardados.')
    } catch (err) {
      setProfileAlert('error', err.message || 'No se pudo guardar el perfil del taller.')
    } finally {
      if (btn) {
        btn.disabled = false
        btn.textContent = 'Guardar datos del taller'
      }
    }
  })

  document.getElementById('profExportBackupBtn')?.addEventListener('click', () => {
    window.exportBackup?.()
  })

  document.getElementById('profImportBackupInput')?.addEventListener('change', e => {
    const file = e.target.files?.[0]
    if (file && document.getElementById('importBackup')) {
      const dt = new DataTransfer()
      dt.items.add(file)
      const legacyInput = document.getElementById('importBackup')
      legacyInput.files = dt.files
      legacyInput.dispatchEvent(new Event('change'))
    }
    e.target.value = ''
  })
}

// ============================================================================
// DEV-22: Sistema de Stock / Inventario de Taller
// ============================================================================
export async function openStockScreen({ fromRoute = false } = {}) {
  if (!fromRoute) return navigateAppRoute({ name: 'stock' })
  if (!appAuthState.user || isSessionExpired(appAuthState.session)) {
    await enforceRouteProtection()
    return
  }
  const activeMembership = getActiveMembership()
  if (!activeMembership) {
    await openAdminScreen()
    return
  }
  const jobsScreen = document.getElementById('jobsScreen')
  const workScreen = document.getElementById('workScreen')
  const profileScreen = document.getElementById('profileScreen')
  const adminScreen = document.getElementById('adminScreen')
  const settingsScreen = document.getElementById('settingsScreen')
  const stockScreen = document.getElementById('stockScreen')
  if (jobsScreen) jobsScreen.hidden = true
  if (workScreen) workScreen.hidden = true
  if (profileScreen) profileScreen.hidden = true
  if (adminScreen) adminScreen.hidden = true
  if (settingsScreen) settingsScreen.hidden = true
  if (stockScreen) stockScreen.hidden = false
  persistCurrentNavigationState({ screen: 'stock' })
  renderHeaderNavigation()
  await renderStockScreen()
}

export async function renderStockScreen(options = {}) {
  const expectedScope = routeScope()
  const stockScreen = document.getElementById('stockScreen')
  if (!stockScreen) return

  const activeMembership = getActiveMembership()
  if (!activeMembership?.workshop) {
    stockScreen.innerHTML = `<div class="notice">Seleccioná o registrá un taller desde la sección <b>Administración</b> para gestionar su depósito.</div>`
    return
  }

  const ws = activeMembership.workshop
  const forceRefresh = Boolean(options?.force)
  const [itemsResult, movementsResult] = await Promise.allSettled([
    fetchWorkshopStock(ws.id, { force: forceRefresh }),
    fetchStockMovements(ws.id, null, 60, { force: forceRefresh })
  ])
  if (routeScope() !== expectedScope) return
  if (itemsResult.status === 'fulfilled' && Array.isArray(itemsResult.value)) {
    appAuthState.stockItems = itemsResult.value
  } else if (itemsResult.status === 'rejected') {
    console.warn('Error cargando stock desde Supabase:', itemsResult.reason)
  }
  if (movementsResult.status === 'fulfilled' && Array.isArray(movementsResult.value)) {
    appAuthState.stockMovements = movementsResult.value
  } else if (movementsResult.status === 'rejected') {
    console.warn('Error cargando movimientos de stock desde Supabase:', movementsResult.reason)
  }

  const activeItems = getActiveStockItems(appAuthState.stockItems, ws.id)
  const activeCount = countActiveStockItems(appAuthState.stockItems, ws.id)
  const lowStockItems = activeItems.filter(i => isLowStock(i))

  const editing = appAuthState.editingStockItem
  const movItem = appAuthState.movementTargetItem
  const f = appAuthState.stockFilters

  if (routeScope() !== expectedScope) return
  stockScreen.innerHTML = `
    <div class="personal-profile-top unified-screen-top">
      <div class="unified-screen-top-bar">
        <button type="button" class="profile-back" id="backFromStockBtn">← Volver</button>
        <button type="button" class="button primary small-btn" id="openNewStockItemBtn">+ Nuevo producto / repuesto</button>
      </div>
      <p class="eyebrow">INVENTARIO Y DEPÓSITO</p>
      <h1>Stock de ${esc(ws.name)}</h1>
      <p>Pinturas, materiales, insumos y repuestos con compatibilidad por vehículo, avisos de faltantes y registro completo de entradas y salidas.</p>
    </div>

    <div id="stockAlertBox" class="auth-alert" role="alert" hidden></div>

    <!-- Estadísticas rápidas del depósito -->
    <div class="dashboard-stats stock-summary-stats">
      <div class="dashboard-stat">
        <span>Productos activos</span>
        <b id="activeProductsCount">${activeCount}</b>
      </div>
      <div class="dashboard-stat" style="cursor:pointer" id="filterLowStockStatBtn" title="Filtrar productos con alerta de stock bajo">
        <span>Alertas de stock mínimo</span>
        <b style="color:${lowStockItems.length > 0 ? '#a95312' : 'inherit'}">${lowStockItems.length}</b>
      </div>
    </div>

    ${
      lowStockItems.length > 0
        ? `<div class="notice" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
            <span><b>⚠ Atención depósito:</b> Hay <b>${lowStockItems.length}</b> producto(s) en o por debajo del stock mínimo (${esc(
              lowStockItems
                .slice(0, 3)
                .map(i => `${i.name} (${i.quantity} ${i.unit || 'un.'})`)
                .join(', ')
            )}${lowStockItems.length > 3 ? '…' : ''}).</span>
            <button type="button" id="quickFilterLowBtn">Ver faltantes</button>
          </div>`
        : ''
    }

    <!-- Panel de Registro de Movimiento de Stock -->
    <div id="stockMovementPanel" class="panel animate__animated animate__fadeIn" style="margin-bottom:22px;border-color:var(--blue)" ${
      movItem ? '' : 'hidden'
    }>
      ${
        movItem
          ? `
            <div class="piece-heading" style="margin-bottom:14px">
              <div>
                <span class="eyebrow">REGISTRO DE ENTRADA O SALIDA DE STOCK</span>
                <h2>${esc(movItem.name)} ${movItem.sku ? `<small class="muted">· Código ${esc(movItem.sku)}</small>` : ''}</h2>
                <p class="subtitle">Disponible actual: <b>${movItem.quantity} ${esc(movItem.unit || 'un.')}</b> · Stock mínimo: ${movItem.minimum_quantity} ${esc(movItem.unit || 'un.')}</p>
              </div>
              <button type="button" class="text-button" id="closeMovementPanelBtn">✕ Cerrar</button>
            </div>
            <form id="stockMovementForm" class="form-grid">
              <label>Tipo de operación <span class="required">*</span>
                <select id="movDirection">
                  <option value="in">+ Ingreso a depósito (compra / devolución / ajuste +)</option>
                  <option value="out">− Salida de depósito (uso en trabajo / merma / ajuste −)</option>
                </select>
              </label>
              <label>Cantidad (${esc(movItem.unit || 'un.')}) <span class="required">*</span>
                <input id="movQuantity" type="number" min="0.01" step="0.01" required placeholder="Ej. 2">
              </label>
              <label class="span-two">Motivo / Referencia de trabajo o proveedor <span class="required">*</span>
                <input id="movReason" required maxlength="160" placeholder="Ej. Uso en patente AB 123 CD / Compra a proveedor">
              </label>
              <div class="span-two" style="display:flex;justify-content:flex-end;gap:10px">
                <button type="button" class="button secondary" id="cancelMovementBtn">Cancelar</button>
                <button type="submit" class="button primary" id="submitMovementBtn">Confirmar movimiento</button>
              </div>
            </form>
          `
          : ''
      }
    </div>

    <!-- Formulario de Alta / Edición de Producto y Compatibilidad -->
    <details id="stockFormDetails" class="panel" style="margin-bottom:22px" ${editing ? 'open' : ''}>
      <summary style="cursor:pointer;font-weight:800;font-size:15px">
        ${
          editing?.id
            ? `✎ Editando producto: ${esc(editing.name)}`
            : '+ Dar de alta nuevo producto, insumo, pintura o repuesto'
        }
      </summary>
      <form id="stockItemForm" novalidate style="margin-top:18px">
        <div class="form-grid">
          <label>Nombre del producto <span class="required">*</span>
            <input id="stName" required maxlength="120" value="${esc(editing?.name || '')}" placeholder="Ej. Espejo retrovisor exterior derecho / Barniz bicapa 2K">
          </label>
          <label>Categoría <span class="required">*</span>
            <select id="stCategory">
              ${STOCK_CATEGORIES.map(
                cat => `<option value="${esc(cat)}" ${(editing?.category || 'Repuestos') === cat ? 'selected' : ''}>${esc(cat)}</option>`
              ).join('')}
            </select>
          </label>
          <label>Marca del producto
            <input id="stBrand" maxlength="80" value="${esc(editing?.brand || '')}" placeholder="Ej. PPG, 3M, Valeo, Fitam">
          </label>
          <label>Código o referencia
            <input id="stSku" maxlength="60" class="plate-input" value="${esc(editing?.sku || '')}" placeholder="Ej. ESP-VW-204R">
          </label>
          <label>Unidad de medida
            <select id="stUnit">
              ${STOCK_UNITS.map(
                u => `<option value="${esc(u)}" ${(editing?.unit || 'un.') === u ? 'selected' : ''}>${esc(u)}</option>`
              ).join('')}
            </select>
          </label>
          <label>Ubicación física en depósito
            <input id="stLocation" maxlength="100" value="${esc(editing?.location || '')}" placeholder="Ej. Pasillo 2 · Estante B · Caja 4">
          </label>
          <label>Precio de compra (ARS)
            <input id="stPurchasePrice" type="number" min="0" step="1" inputmode="numeric" value="${editing?.purchase_price ?? 0}">
          </label>
          <label>Stock mínimo (aviso de faltante)
            <input id="stMinQty" type="number" min="0" step="0.01" value="${editing?.minimum_quantity ?? 1}">
          </label>
          ${
            !editing?.id
              ? `<label>Cantidad inicial disponible
                  <input id="stInitialQty" type="number" min="0" step="0.01" value="0">
                </label>`
              : `<label>Cantidad disponible actual (usar botón "± Movimiento")
                  <input value="${editing.quantity} ${esc(editing.unit || 'un.')}" disabled>
                </label>`
          }
          <label class="span-two">Descripción
            <input id="stDescription" maxlength="240" value="${esc(editing?.description || '')}" placeholder="Ej. Espejo eléctrico con desempañador y luz de giro">
          </label>
          <label class="span-two">Observaciones
            <textarea id="stNotes" rows="2" placeholder="Notas adicionales de ubicación o proveedor">${esc(editing?.notes || '')}</textarea>
          </label>
        </div>

        <!-- Sub-sección de Compatibilidad de Vehículos para Repuestos -->
        <div class="quiet-details" style="margin-top:18px;padding-top:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
            <div>
              <h3 style="margin:0">Compatibilidad con vehículos (para repuestos y autopartes)</h3>
              <p class="small muted" style="margin:2px 0 0">Indicá marca, modelo, año o rango de años, versión y lado/posición cuando corresponda.</p>
            </div>
            <button type="button" class="button secondary small-btn" id="addCompatRowBtn">+ Agregar vehículo compatible</button>
          </div>
          <div id="compatRowsContainer"></div>
        </div>

        <div class="form-footer">
          <small>Cada ingreso o salida queda registrado en el historial del depósito.</small>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            ${
              editing
                ? `<button type="button" class="button secondary" id="cancelEditStockBtn">Cancelar edición</button>`
                : ''
            }
            <button type="submit" class="button primary" id="saveStockItemBtn">
              ${editing?.id ? 'Guardar cambios del producto' : 'Registrar producto en stock'}
            </button>
          </div>
        </div>
      </form>
    </details>

    <!-- Barra de Búsqueda rápida y Filtros combinados -->
    <div class="stock-filters-panel">
      <div class="stock-filters-row">
        <label>Búsqueda rápida (nombre, código, ubicación, descripción)
          <input id="stockSearchInput" type="search" value="${esc(f.search)}" placeholder="Buscar pintura, repuesto, código o estante…">
        </label>
        <label>Categoría
          <select id="stockCategoryFilter">
            <option value="">Todas las categorías</option>
            ${STOCK_CATEGORIES.map(
              cat => `<option value="${esc(cat)}" ${f.category === cat ? 'selected' : ''}>${esc(cat)}</option>`
            ).join('')}
          </select>
        </label>
        <label>Marca de producto
          <input id="stockBrandFilter" type="search" value="${esc(f.brand)}" placeholder="Ej. PPG, Valeo…">
        </label>
        <label>Estado en depósito
          <select id="stockStatusFilter">
            <option value="active" ${f.status === 'active' ? 'selected' : ''}>Activos</option>
            <option value="low" ${f.status === 'low' ? 'selected' : ''}>⚠ Con stock bajo</option>
            <option value="archived" ${f.status === 'archived' ? 'selected' : ''}>Archivados</option>
            <option value="all" ${f.status === 'all' ? 'selected' : ''}>Todos</option>
          </select>
        </label>
      </div>

      <div class="stock-compat-filters">
        <label>Compatibilidad: Marca del vehículo
          <input id="stockVehMakeFilter" type="search" value="${esc(f.vehicleMake)}" placeholder="Ej. Volkswagen, Toyota">
        </label>
        <label>Compatibilidad: Modelo del vehículo
          <input id="stockVehModelFilter" type="search" value="${esc(f.vehicleModel)}" placeholder="Ej. Vento, Hilux">
        </label>
        <label>Compatibilidad: Año del vehículo
          <input id="stockVehYearFilter" type="number" min="1900" max="2100" value="${esc(f.vehicleYear)}" placeholder="Ej. 2018">
        </label>
        <button type="button" class="button secondary small-btn" id="clearStockFiltersBtn">Limpiar filtros</button>
      </div>
    </div>

    <!-- Grilla de Productos del Inventario -->
    <div id="stockItemsGrid" class="stock-grid"></div>

    <!-- Historial de Movimientos del Depósito -->
    <div class="panel" style="margin-top:26px">
      <div class="piece-heading">
        <div>
          <span class="eyebrow">HISTORIAL DEL DEPÓSITO</span>
          <h2>Movimientos recientes de stock (${appAuthState.stockMovements.length})</h2>
          <p class="subtitle">Detalle de ingresos, consumos y ajustes realizados en el taller.</p>
        </div>
      </div>
      <div id="stockMovementsContainer" class="movement-history-list"></div>
    </div>
  `

  renderCompatibilityDraftRows()
  renderStockItemsGrid()
  renderMovementHistorySection()

  document.getElementById('backFromStockBtn')?.addEventListener('click', () => {
    goBackAppRoute({ name: 'jobs' })
  })

  document.getElementById('openNewStockItemBtn')?.addEventListener('click', () => {
    appAuthState.editingStockItem = null
    appAuthState.draftCompatibilities = []
    renderStockScreen().then(() => {
      const details = document.getElementById('stockFormDetails')
      if (details) {
        details.open = true
        details.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      document.getElementById('stName')?.focus()
    })
  })

  const filterLowStockHandler = () => {
    appAuthState.stockFilters.status = 'low'
    const sel = document.getElementById('stockStatusFilter')
    if (sel) sel.value = 'low'
    renderStockItemsGrid()
  }
  document.getElementById('filterLowStockStatBtn')?.addEventListener('click', filterLowStockHandler)
  document.getElementById('quickFilterLowBtn')?.addEventListener('click', filterLowStockHandler)

  document.getElementById('closeMovementPanelBtn')?.addEventListener('click', () => {
    appAuthState.movementTargetItem = null
    renderStockScreen()
  })
  document.getElementById('cancelMovementBtn')?.addEventListener('click', () => {
    appAuthState.movementTargetItem = null
    renderStockScreen()
  })

  document.getElementById('stockMovementForm')?.addEventListener('submit', async e => {
    e.preventDefault()
    if (!movItem) return
    const btn = document.getElementById('submitMovementBtn')
    const direction = document.getElementById('movDirection')?.value
    const rawQty = Number(document.getElementById('movQuantity')?.value || 0)
    const quantityChange = direction === 'out' ? -Math.abs(rawQty) : Math.abs(rawQty)
    const reason = document.getElementById('movReason')?.value

    setStockAlert('', '')
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Registrando movimiento…'
    }
    try {
      const updatedRow = await recordStockMovement({
        itemId: movItem.id,
        currentQuantity: movItem.quantity,
        quantityChange,
        reason
      })
      if (updatedRow?.id) {
        appAuthState.stockItems = appAuthState.stockItems.map(i => (i.id === updatedRow.id ? { ...i, ...updatedRow } : i))
      }
      appAuthState.movementTargetItem = null
      await renderStockScreen({ force: true })
      setStockAlert('success', `Movimiento registrado (${quantityChange > 0 ? `+${quantityChange}` : quantityChange} ${movItem.unit || 'un.'}) para "${movItem.name}".`)
      window.toast?.('Stock actualizado correctamente.')
    } catch (err) {
      setStockAlert('error', err.message || 'No se pudo registrar el movimiento de stock.')
    } finally {
      if (btn) {
        btn.disabled = false
        btn.textContent = 'Confirmar movimiento'
      }
    }
  })

  document.getElementById('addCompatRowBtn')?.addEventListener('click', () => {
    syncDraftCompatibilitiesFromDom()
    appAuthState.draftCompatibilities.push({
      vehicle_make: '',
      vehicle_model: '',
      year_from: '',
      year_to: '',
      version: '',
      position: ''
    })
    renderCompatibilityDraftRows()
  })

  document.getElementById('cancelEditStockBtn')?.addEventListener('click', () => {
    appAuthState.editingStockItem = null
    appAuthState.draftCompatibilities = []
    renderStockScreen()
  })

  const purchasePriceInput = document.getElementById('stPurchasePrice')
  purchasePriceInput?.addEventListener('keydown', e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const currentRaw = String(purchasePriceInput.value ?? '0').trim().replace(',', '.')
    const currentNum = Number(currentRaw)
    const base = Number.isFinite(currentNum) ? Math.trunc(currentNum) : 0
    const delta = e.key === 'ArrowUp' ? 1 : -1
    purchasePriceInput.value = String(Math.max(0, base + delta))
    purchasePriceInput.dispatchEvent(new Event('input', { bubbles: true }))
  })

  document.getElementById('stockItemForm')?.addEventListener('submit', async e => {
    e.preventDefault()
    syncDraftCompatibilitiesFromDom()
    const btn = document.getElementById('saveStockItemBtn')
    setStockAlert('', '')

    const payload = {
      name: document.getElementById('stName')?.value,
      category: document.getElementById('stCategory')?.value,
      brand: document.getElementById('stBrand')?.value,
      sku: document.getElementById('stSku')?.value,
      unit: document.getElementById('stUnit')?.value,
      location: document.getElementById('stLocation')?.value,
      purchase_price: document.getElementById('stPurchasePrice')?.value,
      minimum_quantity: document.getElementById('stMinQty')?.value,
      initial_quantity: document.getElementById('stInitialQty')?.value ?? 0,
      description: document.getElementById('stDescription')?.value,
      notes: document.getElementById('stNotes')?.value
    }

    const validation = validateStockItemInput(payload)
    if (!validation.valid) {
      setStockAlert('error', validation.error)
      return
    }

    if (btn) btn.disabled = true

    try {
      if (editing?.id) {
        const updatedItem = await updateStockItem(ws.id, editing.id, payload, appAuthState.draftCompatibilities)
        if (updatedItem?.id) {
          appAuthState.stockItems = appAuthState.stockItems.map(i => (i.id === updatedItem.id ? { ...i, ...updatedItem } : i))
        }
        appAuthState.editingStockItem = null
        appAuthState.draftCompatibilities = []
        await renderStockScreen({ force: true })
        setStockAlert('success', 'Producto y compatibilidad actualizados correctamente.')
      } else {
        const createdItem = await createStockItem(ws.id, payload, appAuthState.draftCompatibilities)
        if (createdItem?.id && !appAuthState.stockItems.some(i => i.id === createdItem.id)) {
          appAuthState.stockItems = [{ ...createdItem, compatibilities: [...appAuthState.draftCompatibilities] }, ...appAuthState.stockItems]
        }
        appAuthState.editingStockItem = null
        appAuthState.draftCompatibilities = []
        await renderStockScreen({ force: true })
        setStockAlert('success', 'Producto dado de alta en el inventario del taller.')
      }
    } catch (err) {
      setStockAlert('error', err.message || 'No se pudo guardar el producto en el inventario.')
    } finally {
      if (btn) btn.disabled = false
    }
  })

  // Filtros en vivo
  const bindFilter = (id, key, eventName = 'input') => {
    document.getElementById(id)?.addEventListener(eventName, e => {
      appAuthState.stockFilters[key] = e.target.value
      renderStockItemsGrid()
    })
  }
  bindFilter('stockSearchInput', 'search', 'input')
  bindFilter('stockCategoryFilter', 'category', 'change')
  bindFilter('stockBrandFilter', 'brand', 'input')
  bindFilter('stockStatusFilter', 'status', 'change')
  bindFilter('stockVehMakeFilter', 'vehicleMake', 'input')
  bindFilter('stockVehModelFilter', 'vehicleModel', 'input')
  bindFilter('stockVehYearFilter', 'vehicleYear', 'input')

  document.getElementById('clearStockFiltersBtn')?.addEventListener('click', () => {
    appAuthState.stockFilters = {
      search: '',
      category: '',
      brand: '',
      status: 'active',
      vehicleMake: '',
      vehicleModel: '',
      vehicleYear: ''
    }
    renderStockScreen()
  })
}

function syncDraftCompatibilitiesFromDom() {
  const rows = document.querySelectorAll('[data-compat-row]')
  if (!rows.length) return
  const list = []
  rows.forEach(row => {
    list.push({
      vehicle_make: row.querySelector('[data-c-make]')?.value || '',
      vehicle_model: row.querySelector('[data-c-model]')?.value || '',
      year_from: row.querySelector('[data-c-yfrom]')?.value || '',
      year_to: row.querySelector('[data-c-yto]')?.value || '',
      version: row.querySelector('[data-c-version]')?.value || '',
      position: row.querySelector('[data-c-pos]')?.value || ''
    })
  })
  appAuthState.draftCompatibilities = list
}

function renderCompatibilityDraftRows() {
  const container = document.getElementById('compatRowsContainer')
  if (!container) return

  if (!appAuthState.draftCompatibilities.length) {
    container.innerHTML = `<p class="small muted" style="margin:6px 0">Sin restricciones de modelo cargadas (aplicable a pinturas, materiales universales o insumos generales).</p>`
    return
  }

  container.innerHTML = appAuthState.draftCompatibilities
    .map(
      (c, idx) => `
      <div class="compat-row-item" data-compat-row="${idx}">
        <label>Marca vehículo *
          <input data-c-make value="${esc(c.vehicle_make || '')}" placeholder="Ej. Volkswagen">
        </label>
        <label>Modelo
          <input data-c-model value="${esc(c.vehicle_model || '')}" placeholder="Ej. Amarok / Vento">
        </label>
        <label>Año desde
          <input data-c-yfrom type="number" min="1900" max="2100" value="${esc(c.year_from ?? '')}" placeholder="2016">
        </label>
        <label>Año hasta
          <input data-c-yto type="number" min="1900" max="2100" value="${esc(c.year_to ?? '')}" placeholder="2022">
        </label>
        <label>Versión
          <input data-c-version value="${esc(c.version || '')}" placeholder="Ej. Highline 2.0">
        </label>
        <label>Lado / Posición
          <select data-c-pos>
            ${PART_POSITIONS.map(
              pos => `<option value="${esc(pos)}" ${(c.position || '') === pos ? 'selected' : ''}>${esc(pos || '— Sin especificar —')}</option>`
            ).join('')}
          </select>
        </label>
        <button type="button" class="button danger small-btn" data-remove-compat="${idx}" aria-label="Quitar fila de compatibilidad">×</button>
      </div>
    `
    )
    .join('')

  container.querySelectorAll('[data-remove-compat]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncDraftCompatibilitiesFromDom()
      appAuthState.draftCompatibilities.splice(Number(btn.dataset.removeCompat), 1)
      renderCompatibilityDraftRows()
    })
  })
}

function renderStockItemsGrid() {
  const grid = document.getElementById('stockItemsGrid')
  if (!grid) return

  const filtered = filterStockItems(appAuthState.stockItems, appAuthState.stockFilters)
  const filterKey = JSON.stringify([routeScope(), appAuthState.stockFilters])
  if (appAuthState.stockRenderFilterKey !== filterKey) {
    appAuthState.stockVisibleCount = 40
    appAuthState.stockRenderFilterKey = filterKey
  }

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📦</span>
        <h2>No se encontraron productos con estos filtros</h2>
        <p>Podés limpiar los filtros de búsqueda o registrar un nuevo material, insumo o repuesto en el depósito.</p>
      </div>
    `
    return
  }

  const fmtMoney = v => formatPurchasePriceArs(v)

  grid.innerHTML = filtered.slice(0, appAuthState.stockVisibleCount)
    .map(item => {
      const low = isLowStock(item)
      const archived = Boolean(item.archived_at)
      const compatList = item.compatibilities || []

      return `
        <article class="stock-card ${low ? 'low-stock' : ''} ${archived ? 'archived-stock' : ''}">
          <div>
            <div class="stock-card-top">
              <span class="stock-category-tag">${esc(item.category || 'Materiales')}</span>
              ${
                archived
                  ? `<span class="status-tag rejected">Archivado</span>`
                  : low
                    ? `<span class="stock-alert-tag">⚠ Stock bajo (mín. ${item.minimum_quantity})</span>`
                    : `<span class="stock-ok-tag">✓ Disponible</span>`
              }
            </div>

            <h3 style="font-size:16px;margin:10px 0 4px">${esc(item.name)}</h3>
            <p class="small muted" style="margin:0 0 8px">
              ${esc([item.brand ? `Marca: ${item.brand}` : '', item.sku ? `SKU: ${item.sku}` : ''].filter(Boolean).join(' · ') || 'Sin marca / SKU')}
            </p>

            <div class="stock-qty-box">
              <div>
                <span class="small muted" style="display:block">Disponible</span>
                <span class="stock-qty-value">${item.quantity} <small style="font-size:13px;font-weight:700">${esc(item.unit || 'un.')}</small></span>
              </div>
              <div style="text-align:right">
                <span class="small muted" style="display:block">Precio de compra</span>
                <b style="font-size:14px">${fmtMoney(item.purchase_price)}</b>
              </div>
            </div>

            <div class="stock-meta-list">
              ${item.location ? `<div>📍 <b>Ubicación:</b> ${esc(item.location)}</div>` : ''}
              ${item.description ? `<div>${esc(item.description)}</div>` : ''}
              ${item.notes ? `<div class="small">Nota: ${esc(item.notes)}</div>` : ''}
            </div>

            ${
              compatList.length > 0
                ? `<div class="compat-chips">
                    ${compatList.map(c => `<span class="compat-chip">🚗 ${esc(formatCompatibilityLabel(c))}</span>`).join('')}
                  </div>`
                : ''
            }
          </div>

          <div class="stock-card-actions">
            <button type="button" class="button primary small-btn" data-mov-item="${esc(item.id)}" ${archived ? 'disabled' : ''}>± Movimiento</button>
            <button type="button" class="button secondary small-btn" data-edit-item="${esc(item.id)}">Editar</button>
            <button type="button" class="button ${archived ? 'secondary' : 'danger'} small-btn" data-archive-item="${esc(item.id)}" data-archived="${archived ? '1' : '0'}">
              ${archived ? 'Restaurar' : 'Archivar'}
            </button>
          </div>
        </article>
      `
    })
    .join('')

  grid.querySelectorAll('[data-mov-item]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = appAuthState.stockItems.find(i => i.id === btn.dataset.movItem)
      if (!item) return
      appAuthState.movementTargetItem = item
      renderStockScreen().then(() => {
        document.getElementById('stockMovementPanel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        document.getElementById('movQuantity')?.focus()
      })
    })
  })

  grid.querySelectorAll('[data-edit-item]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = appAuthState.stockItems.find(i => i.id === btn.dataset.editItem)
      if (!item) return
      appAuthState.editingStockItem = item
      appAuthState.draftCompatibilities = (item.compatibilities || []).map(c => ({ ...c }))
      renderStockScreen().then(() => {
        const details = document.getElementById('stockFormDetails')
        if (details) {
          details.open = true
          details.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      })
    })
  })

  if (filtered.length > appAuthState.stockVisibleCount) {
    const more = document.createElement('button')
    more.type = 'button'
    more.className = 'button secondary list-load-more'
    more.textContent = `Mostrar más productos (${appAuthState.stockVisibleCount} de ${filtered.length})`
    more.onclick = () => { appAuthState.stockVisibleCount += 40; renderStockItemsGrid(); persistCurrentNavigationState() }
    grid.append(more)
  }
  grid.querySelectorAll('[data-archive-item]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const activeMembership = getActiveMembership()
      if (!activeMembership?.workshop) return
      const itemId = btn.dataset.archiveItem
      const isCurrentlyArchived = btn.dataset.archived === '1'
      try {
        const updatedRow = await archiveStockItem(activeMembership.workshop.id, itemId, !isCurrentlyArchived)
        appAuthState.stockItems = appAuthState.stockItems.map(i =>
          i.id === itemId
            ? { ...i, ...(updatedRow || {}), archived_at: !isCurrentlyArchived ? updatedRow?.archived_at || new Date().toISOString() : null }
            : i
        )
        await renderStockScreen({ force: true })
        setStockAlert(
          'success',
          isCurrentlyArchived ? 'Producto restaurado al inventario activo.' : 'Producto archivado correctamente.'
        )
      } catch (err) {
        setStockAlert('error', err.message || 'No se pudo cambiar el estado de archivo del producto.')
      }
    })
  })
}

function renderMovementHistorySection() {
  const container = document.getElementById('stockMovementsContainer')
  if (!container) return

  if (!appAuthState.stockMovements.length) {
    container.innerHTML = `<p class="small muted">Todavía no hay movimientos de inventario registrados en este taller.</p>`
    return
  }

  const itemById = new Map(appAuthState.stockItems.map(i => [i.id, i]))

  container.innerHTML = appAuthState.stockMovements
    .map(mov => {
      const item = itemById.get(mov.stock_item_id)
      const delta = Number(mov.quantity_change || 0)
      const isPos = delta > 0
      const dateStr = mov.created_at
        ? new Date(mov.created_at).toLocaleString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : ''

      return `
        <div class="movement-row">
          <div>
            <b>${esc(item ? item.name : `Producto ${String(mov.stock_item_id).slice(0, 8)}`)}</b>
            ${item?.sku ? `<small class="muted">· SKU ${esc(item.sku)}</small>` : ''}
            <div class="small muted">${esc(mov.reason || 'Sin motivo especificado')} · ${esc(dateStr)}</div>
          </div>
          <span class="movement-delta ${isPos ? 'positive' : 'negative'}">
            ${isPos ? `+${delta}` : delta} ${esc(item?.unit || 'un.')}
          </span>
        </div>
      `
    })
    .join('')
}

// ============================================================================
// DEV-20: Panel de Administración (/admin) con roles owner | admin | staff
// ============================================================================
export async function openAdminScreen({ fromRoute = false } = {}) {
  if (!fromRoute) return navigateAppRoute({ name: 'admin' })
  if (!appAuthState.user || isSessionExpired(appAuthState.session)) {
    await enforceRouteProtection()
    return
  }
  const jobsScreen = document.getElementById('jobsScreen')
  const workScreen = document.getElementById('workScreen')
  const profileScreen = document.getElementById('profileScreen')
  const stockScreen = document.getElementById('stockScreen')
  const settingsScreen = document.getElementById('settingsScreen')
  const adminScreen = document.getElementById('adminScreen')
  if (jobsScreen) jobsScreen.hidden = true
  if (workScreen) workScreen.hidden = true
  if (profileScreen) profileScreen.hidden = true
  if (stockScreen) stockScreen.hidden = true
  if (settingsScreen) settingsScreen.hidden = true
  if (adminScreen) adminScreen.hidden = false
  persistCurrentNavigationState({ screen: 'admin' })
  renderHeaderNavigation()
  await renderAdminScreen()
}

export async function renderAdminScreen() {
  const expectedScope = routeScope()
  const adminScreen = document.getElementById('adminScreen')
  if (!adminScreen) return

  const activeMembership = getActiveMembership()
  const activeWorkshop = activeMembership?.workshop || null
  const callerRole = activeMembership?.role || null
  const isWorkshopAdmin = canAccessAdminPanel(callerRole)
  const isCallerOwner = callerRole === 'owner'

  if (activeWorkshop) {
    try {
      const [members, profiles] = await Promise.all([
        fetchAdminWorkshopMembers(activeWorkshop.id),
        fetchKnownUserProfiles()
      ])
      if (routeScope() !== expectedScope) return
      appAuthState.adminMembers = members
      appAuthState.knownProfiles = profiles
    } catch (err) {
      console.warn('Error cargando miembros del taller:', err)
    }
  } else {
    appAuthState.adminMembers = []
  }

  const ownerCount = appAuthState.adminMembers.filter(m => m.role === 'owner').length

  if (routeScope() !== expectedScope) return
  adminScreen.innerHTML = `
    <div class="personal-profile-top unified-screen-top">
      ${
        appAuthState.memberships.length > 0
          ? `<div class="unified-screen-top-bar">
              <button type="button" class="profile-back" id="backFromAdminBtn">← Volver</button>
              <button type="button" class="button secondary small-btn" id="goToProfileFromAdminBtn">Mi taller</button>
            </div>`
          : ''
      }
      <p class="eyebrow">ADMINISTRACIÓN Y EQUIPO</p>
      <h1>Gestión de Talleres y Usuarios</h1>
      <p>Administrá los datos de tu taller, los integrantes de tu equipo y los permisos de acceso de cada usuario.</p>
    </div>

    <div id="adminAlertBox" class="auth-alert" role="alert" hidden></div>

    ${
      !appAuthState.memberships.length
        ? `<div class="notice">
            <b>Bienvenido/a a MiTallerApp.</b> Aún no tenés un taller asignado. Podés registrar tu primer taller a continuación (quedarás asignado automáticamente como <b>Propietario</b>) o compartir tu código de usuario con el titular de un taller existente.
          </div>`
        : ''
    }

    <div class="admin-grid">
      <!-- Columna 1: Mis Talleres Autorizados + Alta de Taller -->
      <div class="admin-card">
        <span class="eyebrow">TALLERES</span>
        <h2>Mis talleres (${appAuthState.memberships.length})</h2>
        <p class="subtitle">Cada taller mantiene sus propios trabajos, clientes, presupuestos y repuestos de forma independiente.</p>

        <div class="admin-list">
          ${
            appAuthState.memberships.length
              ? appAuthState.memberships
                  .map(
                    m => `
                  <div class="admin-item ${m.workshop_id === activeWorkshop?.id ? 'active-workshop' : ''}">
                    <div class="admin-item-info">
                      <h4>${esc(m.workshop.name)}</h4>
                      <p>${esc([m.workshop.legal_name, m.workshop.tax_id ? `CUIT ${m.workshop.tax_id}` : ''].filter(Boolean).join(' · ') || 'Sin razón social / CUIT cargados')}</p>
                      <p>${esc([m.workshop.phone, m.workshop.address].filter(Boolean).join(' · ') || 'Sin teléfono o dirección')}</p>
                    </div>
                    <div class="admin-item-actions">
                      <span class="role-chip ${esc(m.role)}">${esc(ROLE_LABELS[m.role] || m.role)}</span>
                      ${
                        m.workshop_id !== activeWorkshop?.id
                          ? `<button type="button" class="button secondary small-btn" data-select-ws="${esc(m.workshop_id)}">Seleccionar</button>`
                          : `<span class="small muted" style="font-weight:700">Activo</span>`
                      }
                    </div>
                  </div>
                `
                  )
                  .join('')
              : `<p class="muted small" style="margin:12px 0">No tenés talleres asociados todavía.</p>`
          }
        </div>

        <details class="quiet-details" ${!appAuthState.memberships.length ? 'open' : ''}>
          <summary>+ Dar de alta un nuevo taller</summary>
          <form id="createWorkshopForm" class="form-grid" style="margin-top:12px">
            <label class="span-two">Nombre comercial del taller <span class="required">*</span>
              <input id="newWsName" required maxlength="80" placeholder="Ej. Crash Solution Chapa y Pintura">
            </label>
            <label>Razón social
              <input id="newWsLegal" maxlength="120" placeholder="Ej. Crash Solution S.R.L.">
            </label>
            <label>CUIT
              <input id="newWsCuit" maxlength="20" placeholder="Ej. 30-71234567-1">
            </label>
            <label>Teléfono
              <input id="newWsPhone" type="tel" maxlength="40" placeholder="Ej. 11 4444 5555">
            </label>
            <label>WhatsApp
              <input id="newWsWhatsapp" type="tel" maxlength="40" placeholder="Ej. 5491155551234">
            </label>
            <label>Correo electrónico
              <input id="newWsEmail" type="email" maxlength="120" placeholder="contacto@taller.com">
            </label>
            <label>Dirección
              <input id="newWsAddress" maxlength="160" placeholder="Av. Warnes 1234, CABA">
            </label>
            <div class="span-two">
              <button type="submit" class="button primary" id="createWsSubmitBtn" style="width:100%">Registrar taller</button>
            </div>
          </form>
        </details>

        <div class="quiet-details">
          <p class="small muted" style="margin:6px 0 4px"><b>Tu código de usuario</b> (compartilo si necesitás que el titular de otro taller te agregue a su equipo):</p>
          <div class="uuid-box">
            <span id="myUserUuidText">${esc(appAuthState.user?.id || '')}</span>
            <button type="button" class="button secondary small-btn" id="copyMyUuidBtn">Copiar código</button>
          </div>
        </div>
      </div>

      <!-- Columna 2: Miembros y Roles del Taller Activo -->
      <div class="admin-card">
        <span class="eyebrow">EQUIPO DEL TALLER Y PERMISOS</span>
        <h2>${activeWorkshop ? `Equipo de ${esc(activeWorkshop.name)}` : 'Seleccioná o registrá un taller'}</h2>
        <p class="subtitle">
          ${
            !activeWorkshop
              ? 'Una vez registrado o seleccionado un taller podrás ver y organizar a los integrantes del equipo.'
              : isWorkshopAdmin
                ? `Tu rol actual es "${esc(ROLE_LABELS[callerRole] || callerRole)}". Desde aquí podés invitar integrantes, asignar permisos o revocar accesos.`
                : `Tu rol actual en este taller es "${esc(ROLE_LABELS[callerRole] || callerRole)}". Solo el Propietario o Administrador pueden modificar los permisos del equipo.`
          }
        </p>

        ${
          activeWorkshop
            ? `
              <div class="admin-list">
                ${appAuthState.adminMembers
                  .map(mem => {
                    const canModifyThisMember = isWorkshopAdmin && (isCallerOwner || mem.role !== 'owner')
                    return `
                    <div class="admin-item">
                      <div class="admin-item-info">
                        <h4>${esc(mem.display_name)} ${mem.user_id === appAuthState.user?.id ? '<small class="muted">(Vos)</small>' : ''}</h4>
                        ${mem.phone ? `<p>Tel: ${esc(mem.phone)}</p>` : `<p class="small muted">Integrante registrado</p>`}
                      </div>
                      <div class="admin-item-actions">
                        ${
                          canModifyThisMember
                            ? `
                              <select data-role-user="${esc(mem.user_id)}" data-current-role="${esc(mem.role)}" aria-label="Rol de ${esc(mem.display_name)}">
                                ${ALLOWED_MEMBER_ROLES.map(
                                  r =>
                                    `<option value="${r}" ${mem.role === r ? 'selected' : ''} ${
                                      r === 'owner' && !isCallerOwner ? 'disabled' : ''
                                    }>${esc(ROLE_LABELS[r] || r)}</option>`
                                ).join('')}
                              </select>
                              ${
                                mem.user_id !== appAuthState.user?.id
                                  ? `<button type="button" class="button danger small-btn" data-remove-user="${esc(mem.user_id)}" data-remove-role="${esc(mem.role)}">Quitar</button>`
                                  : ''
                              }
                            `
                            : `<span class="role-chip ${esc(mem.role)}">${esc(ROLE_LABELS[mem.role] || mem.role)}</span>`
                        }
                      </div>
                    </div>
                  `
                  })
                  .join('')}
              </div>

              ${
                isWorkshopAdmin
                  ? `
                    <details class="quiet-details" open>
                      <summary>+ Agregar usuario existente al equipo</summary>
                      <form id="assignMemberForm" class="form-grid" style="margin-top:12px">
                        ${
                          appAuthState.knownProfiles.length
                            ? `<label class="span-two">Seleccionar usuario registrado (opcional)
                                <select id="knownProfileSelect">
                                  <option value="">— Elegir usuario o ingresar su código abajo —</option>
                                  ${appAuthState.knownProfiles
                                    .map(
                                      p =>
                                        `<option value="${esc(p.user_id)}">${esc(p.display_name || 'Sin nombre')}</option>`
                                    )
                                    .join('')}
                                </select>
                              </label>`
                            : ''
                        }
                        <label>Código de usuario <span class="required">*</span>
                          <input id="assignUserUuid" required placeholder="Pegá aquí el código del usuario">
                        </label>
                        <label>Permiso en el taller <span class="required">*</span>
                          <select id="assignUserRole">
                            <option value="staff">Personal del taller</option>
                            <option value="admin">Administrador</option>
                            ${isCallerOwner ? `<option value="owner">Propietario</option>` : ''}
                          </select>
                        </label>
                        <div class="span-two">
                          <button type="submit" class="button secondary" id="assignMemberBtn" style="width:100%">Agregar al equipo de ${esc(activeWorkshop.name)}</button>
                        </div>
                      </form>
                    </details>

                    <details class="quiet-details">
                      <summary>+ Invitar nuevo integrante por correo electrónico</summary>
                      <form id="inviteUserForm" class="form-grid" style="margin-top:12px">
                        <label>Nombre y apellido (opcional)
                          <input id="invName" maxlength="100" autocomplete="name" placeholder="Ej. Carlos Gómez">
                        </label>
                        <label>Teléfono
                          <input id="invPhone" type="tel" placeholder="Opcional">
                        </label>
                        <label>Correo electrónico <span class="required">*</span>
                          <input id="invEmail" type="email" required placeholder="carlos@taller.com">
                        </label>
                        <label>Permiso asignado <span class="required">*</span>
                          <select id="invRole">
                            <option value="staff">Personal del taller</option>
                            <option value="admin">Administrador</option>
                            ${isCallerOwner ? `<option value="owner">Propietario</option>` : ''}
                          </select>
                        </label>
                        <p class="small muted span-two" style="margin:0">
                          El integrante recibirá un correo electrónico de invitación para definir su propia contraseña e ingresar al taller.
                        </p>
                        <div class="span-two">
                          <button type="submit" class="button primary" id="inviteUserBtn" style="width:100%">Enviar invitación por correo</button>
                        </div>
                      </form>
                    </details>
                  `
                  : ''
              }
            `
            : ''
        }
      </div>
    </div>
  `

  document.getElementById('goToProfileFromAdminBtn')?.addEventListener('click', () => {
    openProfileScreen()
  })

  document.getElementById('backFromAdminBtn')?.addEventListener('click', () => {
    goBackAppRoute({ name: 'jobs' })
  })

  document.getElementById('copyMyUuidBtn')?.addEventListener('click', () => {
    if (appAuthState.user?.id) {
      navigator.clipboard?.writeText(appAuthState.user.id)
      window.toast?.('Código de usuario copiado al portapapeles.')
    }
  })

  document.querySelectorAll('[data-select-ws]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await switchActiveWorkshop(btn.dataset.selectWs)
      window.toast?.('Taller activo cambiado.')
    })
  })

  document.getElementById('createWorkshopForm')?.addEventListener('submit', async e => {
    e.preventDefault()
    const btn = document.getElementById('createWsSubmitBtn')
    setAdminAlert('', '')
    if (btn) btn.disabled = true
    try {
      const ws = await createNewWorkshop({
        userId: appAuthState.user.id,
        name: document.getElementById('newWsName')?.value,
        legal_name: document.getElementById('newWsLegal')?.value,
        tax_id: document.getElementById('newWsCuit')?.value,
        phone: document.getElementById('newWsPhone')?.value,
        whatsapp: document.getElementById('newWsWhatsapp')?.value,
        email: document.getElementById('newWsEmail')?.value,
        address: document.getElementById('newWsAddress')?.value
      })
      appAuthState.memberships = await fetchUserWorkshops(appAuthState.user.id)
      appAuthState.activeWorkshopId = ws.id
      clearWorkshopReadState()
      privateReadCache.activate({ userId: appAuthState.user?.id, workshopId: ws.id })
      localStorage.setItem('mitaller_active_workshop_id', ws.id)
      appAuthState.workshopSettings = getWorkshopSettings(ws.id)
      if (window.store) { window.store.jobs = []; window.store.activeId = null }
      window.active = null
      await syncActiveWorkshopToLegacyStore()
      await loadWorkshopJobsFromSupabase()
      renderHeaderNavigation()
      await renderAdminScreen()
      setAdminAlert('success', `Taller "${ws.name}" registrado y asociado a tu cuenta como Propietario.`)
    } catch (err) {
      setAdminAlert('error', err.message || 'No se pudo crear el taller.')
    } finally {
      if (btn) btn.disabled = false
    }
  })

  document.getElementById('knownProfileSelect')?.addEventListener('change', e => {
    const uuidInput = document.getElementById('assignUserUuid')
    if (uuidInput && e.target.value) uuidInput.value = e.target.value
  })

  document.getElementById('assignMemberForm')?.addEventListener('submit', async e => {
    e.preventDefault()
    if (!activeWorkshop) return
    const btn = document.getElementById('assignMemberBtn')
    setAdminAlert('', '')
    if (btn) btn.disabled = true
    try {
      const targetUserId = document.getElementById('assignUserUuid')?.value
      const existingMember = appAuthState.adminMembers.find(m => m.user_id === targetUserId)
      await upsertWorkshopMember({
        callerId: appAuthState.user.id,
        callerRole,
        workshopId: activeWorkshop.id,
        targetUserId,
        targetCurrentRole: existingMember?.role || null,
        role: document.getElementById('assignUserRole')?.value,
        currentOwnerCount: ownerCount
      })
      await renderAdminScreen()
      setAdminAlert('success', 'Usuario asociado al taller correctamente.')
    } catch (err) {
      setAdminAlert('error', err.message || 'No se pudo asociar el usuario al taller.')
    } finally {
      if (btn) btn.disabled = false
    }
  })

  document.querySelectorAll('[data-role-user]').forEach(sel => {
    sel.addEventListener('change', async () => {
      if (!activeWorkshop) return
      const targetUserId = sel.dataset.roleUser
      const targetCurrentRole = sel.dataset.currentRole
      const newRole = sel.value
      setAdminAlert('', '')
      try {
        await upsertWorkshopMember({
          callerId: appAuthState.user.id,
          callerRole,
          workshopId: activeWorkshop.id,
          targetUserId,
          targetCurrentRole,
          role: newRole,
          currentOwnerCount: ownerCount
        })
        appAuthState.memberships = await fetchUserWorkshops(appAuthState.user.id)
        renderHeaderNavigation()
        await renderAdminScreen()
        setAdminAlert('success', 'Rol actualizado correctamente.')
      } catch (err) {
        await renderAdminScreen()
        setAdminAlert('error', err.message || 'No se pudo actualizar el rol.')
      }
    })
  })

  document.querySelectorAll('[data-remove-user]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!activeWorkshop) return
      const targetUserId = btn.dataset.removeUser
      const targetCurrentRole = btn.dataset.removeRole
      if (!confirm('¿Confirmás que querés revocar el acceso de este usuario al taller?')) return
      setAdminAlert('', '')
      try {
        await removeMemberFromWorkshop({
          callerId: appAuthState.user.id,
          callerRole,
          workshopId: activeWorkshop.id,
          targetUserId,
          targetCurrentRole,
          currentOwnerCount: ownerCount
        })
        await renderAdminScreen()
        setAdminAlert('success', 'Acceso revocado para el usuario seleccionado.')
      } catch (err) {
        setAdminAlert('error', err.message || 'No se pudo revocar el acceso.')
      }
    })
  })

  document.getElementById('inviteUserForm')?.addEventListener('submit', async e => {
    e.preventDefault()
    if (!activeWorkshop) return
    const btn = document.getElementById('inviteUserBtn')
    if (btn?.disabled) return
    setAdminAlert('', '')
    if (btn) { btn.disabled = true; btn.textContent = 'Procesando invitación…' }
    const invitationScope = routeScope()
    try {
      const result = await inviteOrCreateWorkshopUser({
        callerId: appAuthState.user?.id,
        callerRole,
        workshopId: activeWorkshop.id,
        displayName: document.getElementById('invName')?.value,
        phone: document.getElementById('invPhone')?.value,
        email: document.getElementById('invEmail')?.value,
        role: document.getElementById('invRole')?.value
      })
      if (routeScope() !== invitationScope) return
      await renderAdminScreen()
      setAdminAlert('success', result.duplicateSuppressed
        ? 'Esta invitación ya fue procesada. No se envió otro correo.'
        : 'Invitación procesada y acceso al taller asignado. El integrante debe abrir el enlace del correo para configurar su contraseña; puede revisar también Spam.')
    } catch (err) {
      if (routeScope() !== invitationScope) return
      setAdminAlert('error', err.message || 'No se pudo enviar la invitación.')
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar invitación por correo' }
    }
  })
}

// ============================================================================
// DEV-33: Sección de Configuración (Seguridad, Contraseña y Parámetros)
// ============================================================================
export async function openSettingsScreen({ fromRoute = false } = {}) {
  if (!fromRoute) return navigateAppRoute({ name: 'settings' })
  if (!appAuthState.user || isSessionExpired(appAuthState.session)) {
    await enforceRouteProtection()
    return
  }
  const settingsScreen = ensureSettingsScreenElement()
  const jobsScreen = document.getElementById('jobsScreen')
  const workScreen = document.getElementById('workScreen')
  const profileScreen = document.getElementById('profileScreen')
  const stockScreen = document.getElementById('stockScreen')
  const adminScreen = document.getElementById('adminScreen')
  if (jobsScreen) jobsScreen.hidden = true
  if (workScreen) workScreen.hidden = true
  if (profileScreen) profileScreen.hidden = true
  if (stockScreen) stockScreen.hidden = true
  if (adminScreen) adminScreen.hidden = true
  if (settingsScreen) settingsScreen.hidden = false
  persistCurrentNavigationState({ screen: 'settings' })
  renderHeaderNavigation()
  await renderSettingsScreen()
}

export async function renderSettingsScreen() {
  const settingsScreen = ensureSettingsScreenElement()
  if (!settingsScreen) return

  const activeMembership = getActiveMembership()
  const ws = activeMembership?.workshop || null
  const workshopId = ws?.id || appAuthState.activeWorkshopId || 'default'
  const currentSettings = getWorkshopSettings(workshopId)
  appAuthState.workshopSettings = currentSettings
  const schemaGroups = getSettingsSchema()

  const renderParamField = param => {
    const val = currentSettings[param.key]
    if (param.type === 'boolean') {
      return `
        <label class="span-two settings-checkbox-row" for="setting_${esc(param.key)}">
          <input id="setting_${esc(param.key)}" data-setting-key="${esc(param.key)}" type="checkbox" ${val ? 'checked' : ''}>
          <span>
            <b>${esc(param.label)}</b>
            ${param.description ? `<small class="muted small" style="display:block;font-weight:400">${esc(param.description)}</small>` : ''}
          </span>
        </label>
      `
    }
    if (param.type === 'select') {
      return `
        <label for="setting_${esc(param.key)}">${esc(param.label)}
          <select id="setting_${esc(param.key)}" data-setting-key="${esc(param.key)}">
            ${(param.options || [])
              .map(opt => `<option value="${esc(opt.value)}" ${val === opt.value ? 'selected' : ''}>${esc(opt.label)}</option>`)
              .join('')}
          </select>
          ${param.description ? `<small class="muted small" style="display:block;margin-top:4px;font-weight:400">${esc(param.description)}</small>` : ''}
        </label>
      `
    }
    if (param.type === 'textarea') {
      return `
        <label class="span-two" for="setting_${esc(param.key)}">${esc(param.label)}
          <textarea id="setting_${esc(param.key)}" data-setting-key="${esc(param.key)}" rows="2" maxlength="${param.maxLength || 500}" placeholder="${esc(param.placeholder || '')}">${esc(val ?? '')}</textarea>
          ${param.description ? `<small class="muted small" style="display:block;margin-top:4px;font-weight:400">${esc(param.description)}</small>` : ''}
        </label>
      `
    }
    if (param.type === 'number') {
      return `
        <label for="setting_${esc(param.key)}">${esc(param.label)}
          <input id="setting_${esc(param.key)}" data-setting-key="${esc(param.key)}" type="number" min="${param.min ?? 0}" max="${param.max ?? 999999}" step="${param.step ?? 1}" value="${esc(val ?? param.defaultValue ?? 0)}">
          ${param.description ? `<small class="muted small" style="display:block;margin-top:4px;font-weight:400">${esc(param.description)}</small>` : ''}
        </label>
      `
    }
    return `
      <label for="setting_${esc(param.key)}">${esc(param.label)}
        <input id="setting_${esc(param.key)}" data-setting-key="${esc(param.key)}" type="text" maxlength="${param.maxLength || 200}" value="${esc(val ?? '')}">
        ${param.description ? `<small class="muted small" style="display:block;margin-top:4px;font-weight:400">${esc(param.description)}</small>` : ''}
      </label>
    `
  }

  const currentUserEmail = String(appAuthState.user?.email || '').trim().toLowerCase()
  const storedPendingEmail = readPendingEmailChange()
  const matchingStoredPending =
    storedPendingEmail &&
    appAuthState.user?.id &&
    String(storedPendingEmail.userId) === String(appAuthState.user.id)
      ? storedPendingEmail.newEmail
      : ''
  const pendingNewEmail = String(appAuthState.user?.new_email || matchingStoredPending || '')
    .trim()
    .toLowerCase()
  const showPendingEmailNotice = Boolean(pendingNewEmail && pendingNewEmail !== currentUserEmail)

  settingsScreen.innerHTML = `
    <div class="personal-profile-top unified-screen-top">
      <div class="unified-screen-top-bar">
        <button type="button" class="profile-back" id="backFromSettingsBtn">← Volver</button>
      </div>
      <p class="eyebrow">CRASH SOLUTION · CONFIGURACIÓN</p>
      <h1 class="settings-top-title">Configuración</h1>
    </div>

    <div id="settingsAlertBox" class="auth-alert" role="alert" hidden></div>

    <div class="admin-grid settings-grid">
      <!-- Columna 1: Seguridad, Contraseña y Correo electrónico -->
      <div class="admin-card">
        <span class="eyebrow">SEGURIDAD DE LA CUENTA</span>
        <h2>Cambiar contraseña</h2>
        <p class="subtitle">Actualizá la clave de acceso de tu cuenta (<span id="settingsPasswordAccountEmail">${esc(currentUserEmail || 'usuario autenticado')}</span>).</p>

        <form id="settingsPasswordForm" class="auth-form" style="margin-top:16px">
          <label>Nueva contraseña (mínimo 8 caracteres) <span class="required">*</span>
            <input id="settingsNewPassword" type="password" required minlength="8" autocomplete="new-password" placeholder="Mínimo 8 caracteres">
          </label>
          <label>Confirmar nueva contraseña <span class="required">*</span>
            <input id="settingsConfirmPassword" type="password" required minlength="8" autocomplete="new-password" placeholder="Repetí la nueva contraseña">
          </label>
          <button type="submit" class="button primary" id="settingsUpdatePassBtn">Guardar nueva contraseña</button>
        </form>

        <div id="settingsEmailSection" class="settings-account-section">
          <span class="eyebrow">CORREO DE LA CUENTA</span>
          <h2>Cambiar correo electrónico</h2>
          <p class="subtitle">Tu correo actual se mantiene activo hasta que confirmes el cambio desde los enlaces de verificación enviados por correo.</p>

          <div class="settings-current-email-box">
            <span class="settings-current-email-label">Correo actual</span>
            <strong id="settingsCurrentEmail">${esc(currentUserEmail || 'Sin correo registrado')}</strong>
            ${
              showPendingEmailNotice
                ? `<p id="settingsPendingEmailNotice" class="settings-pending-email-pill" role="status">Cambio pendiente de confirmación a <b>${esc(pendingNewEmail)}</b>. Revisá tu casilla (y Spam) para confirmarlo.</p>`
                : ''
            }
          </div>

          <form id="settingsEmailForm" class="auth-form" novalidate style="margin-top:14px">
            <label for="settingsNewEmail">Nuevo correo electrónico <span class="required">*</span>
              <input id="settingsNewEmail" type="email" required autocomplete="email" maxlength="254" placeholder="nuevo@correo.com">
            </label>
            <button type="submit" class="button secondary" id="settingsUpdateEmailBtn">Cambiar correo electrónico</button>
          </form>
        </div>

        <details class="quiet-details" open>
          <summary>Copia de respaldo (Exportar / Importar)</summary>
          <p class="muted small">Descargá una copia de seguridad de los trabajos o restaurá un archivo guardado previamente.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
            <button type="button" class="button secondary small-btn" id="settingsExportBackupBtn">Descargar copia de respaldo</button>
            <label class="button secondary small-btn" style="cursor:pointer">
              Importar copia de respaldo
              <input type="file" id="settingsImportBackupInput" accept=".json,application/json" hidden>
            </label>
          </div>
        </details>
      </div>

      <!-- Columna 2: Parámetros Operativos del Taller -->
      <div class="admin-card">
        <span class="eyebrow">PARÁMETROS OPERATIVOS</span>
        <h2>Parámetros del taller ${ws ? `(${esc(ws.name)})` : ''}</h2>
        <p class="subtitle">Definí los valores predeterminados para nuevos ingresos, inspecciones y presupuestos.</p>

        <form id="workshopSettingsForm" style="margin-top:16px">
          ${schemaGroups
            .map(
              group => `
              <div class="settings-group-block" data-settings-group="${esc(group.id)}">
                <div class="settings-group-header">
                  <h3>${esc(group.title)}</h3>
                  <p class="small muted">${esc(group.description || '')}</p>
                </div>
                <div class="form-grid">
                  ${group.parameters.map(renderParamField).join('')}
                </div>
              </div>
            `
            )
            .join('')}

          <div class="form-footer" style="margin-top:20px">
            <button type="button" class="button secondary small-btn" id="resetWorkshopSettingsBtn">Restaurar valores por defecto</button>
            <button type="submit" class="button primary" id="saveWorkshopSettingsBtn">Guardar configuración</button>
          </div>
        </form>
      </div>
    </div>
  `

  document.getElementById('backFromSettingsBtn')?.addEventListener('click', () => {
    goBackAppRoute({ name: 'jobs' })
  })

  document.getElementById('settingsPasswordForm')?.addEventListener('submit', async e => {
    e.preventDefault()
    const btn = document.getElementById('settingsUpdatePassBtn')
    const newPass = document.getElementById('settingsNewPassword')?.value
    const confirmPass = document.getElementById('settingsConfirmPassword')?.value
    setSettingsAlert('', '')
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Actualizando contraseña…'
    }
    try {
      await updateUserPassword(newPass, confirmPass)
      const newInput = document.getElementById('settingsNewPassword')
      const confirmInput = document.getElementById('settingsConfirmPassword')
      if (newInput) newInput.value = ''
      if (confirmInput) confirmInput.value = ''
      setSettingsAlert('success', 'Contraseña actualizada con éxito.')
      window.toast?.('Contraseña actualizada con éxito.')
    } catch (err) {
      setSettingsAlert('error', err.message || 'No se pudo actualizar la contraseña.')
    } finally {
      if (btn) {
        btn.disabled = false
        btn.textContent = 'Guardar nueva contraseña'
      }
    }
  })

  document.getElementById('settingsEmailForm')?.addEventListener('submit', async e => {
    e.preventDefault()
    const btn = document.getElementById('settingsUpdateEmailBtn')
    if (btn?.disabled) return
    const emailInput = document.getElementById('settingsNewEmail')
    const requestedEmail = emailInput?.value
    setSettingsAlert('', '')
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Solicitando cambio…'
    }
    try {
      const result = await requestUserEmailChange(requestedEmail, {
        expectedUserId: appAuthState.user?.id || null,
        expectedEmail: appAuthState.user?.email || null
      })

      if (result.user) {
        appAuthState.user = { ...appAuthState.user, ...result.user }
        if (appAuthState.session) {
          appAuthState.session = { ...appAuthState.session, user: appAuthState.user }
        }
      }

      if (result.requiresEmailConfirmation) {
        recordPendingEmailChange({
          userId: appAuthState.user?.id,
          currentEmail: result.currentEmail,
          newEmail: result.pendingEmail
        })
        if (emailInput) emailInput.value = ''
        const currentEmailEl = document.getElementById('settingsCurrentEmail')
        if (currentEmailEl && result.currentEmail) currentEmailEl.textContent = result.currentEmail
        let pendingEl = document.getElementById('settingsPendingEmailNotice')
        if (!pendingEl) {
          pendingEl = document.createElement('p')
          pendingEl.id = 'settingsPendingEmailNotice'
          pendingEl.className = 'settings-pending-email-pill'
          pendingEl.setAttribute('role', 'status')
          document.querySelector('.settings-current-email-box')?.appendChild(pendingEl)
        }
        pendingEl.innerHTML = `Cambio pendiente de confirmación a <b>${esc(result.pendingEmail)}</b>. Revisá tu casilla (y Spam) para confirmarlo.`
        setSettingsAlert('info', result.message)
      } else {
        clearPendingEmailChange()
        if (emailInput) emailInput.value = ''
        const currentEmailEl = document.getElementById('settingsCurrentEmail')
        if (currentEmailEl) currentEmailEl.textContent = result.currentEmail
        const passEmailEl = document.getElementById('settingsPasswordAccountEmail')
        if (passEmailEl) passEmailEl.textContent = result.currentEmail
        document.getElementById('settingsPendingEmailNotice')?.remove()
        setSettingsAlert('success', result.message)
        window.toast?.(result.message)
      }
    } catch (err) {
      setSettingsAlert('error', err.message || 'No se pudo iniciar el cambio de correo electrónico.')
    } finally {
      if (btn) {
        btn.disabled = false
        btn.textContent = 'Cambiar correo electrónico'
      }
    }
  })

  document.getElementById('workshopSettingsForm')?.addEventListener('submit', e => {
    e.preventDefault()
    setSettingsAlert('', '')
    const rawValues = {}
    settingsScreen.querySelectorAll('[data-setting-key]').forEach(input => {
      const key = input.getAttribute('data-setting-key')
      rawValues[key] = input.type === 'checkbox' ? input.checked : input.value
    })
    const result = saveWorkshopSettings(workshopId, rawValues)
    if (!result.valid) {
      setSettingsAlert('error', result.error || 'Revisá los parámetros ingresados.')
      return
    }
    appAuthState.workshopSettings = result.values
    setSettingsAlert('success', 'Parámetros de configuración guardados correctamente.')
    window.toast?.('Configuración guardada.')
  })

  document.getElementById('resetWorkshopSettingsBtn')?.addEventListener('click', () => {
    const result = saveWorkshopSettings(workshopId, DEFAULT_WORKSHOP_SETTINGS)
    appAuthState.workshopSettings = result.values
    renderSettingsScreen().then(() => {
      setSettingsAlert('info', 'Se restauraron los parámetros predeterminados del taller.')
    })
  })

  document.getElementById('settingsExportBackupBtn')?.addEventListener('click', () => {
    window.exportBackup?.()
  })

  document.getElementById('settingsImportBackupInput')?.addEventListener('change', e => {
    const file = e.target.files?.[0]
    if (file && document.getElementById('importBackup')) {
      const dt = new DataTransfer()
      dt.items.add(file)
      const legacyInput = document.getElementById('importBackup')
      legacyInput.files = dt.files
      legacyInput.dispatchEvent(new Event('change'))
    }
    e.target.value = ''
  })
}

async function handleExpiredSession() {
  resetHeaderBrandToGeneric()
  privateReadCache.clear()
  appAuthState.session = null
  appAuthState.user = null
  appAuthState.profile = null
  appAuthState.memberships = []
  appAuthState.activeWorkshopId = null
  appAuthState.activeWorkshopProfile = null
  localStorage.removeItem('mitaller_active_workshop_id')
  appAuthState.isSessionBootstrapped = false
  await enforceRouteProtection('Tu sesión expiró por seguridad. Volvé a iniciar sesión para continuar.')
}

export async function enforceRouteProtection(expiredMessage = '') {
  const authScreen = document.getElementById('authScreen')
  const mainApp = document.getElementById('mainAppContainer')
  const flowCtx = appAuthState.passwordFlowContext

  if (flowCtx?.blocked) {
    appAuthState.authMode = 'update-password'
    if (mainApp) mainApp.hidden = true
    if (authScreen) {
      authScreen.hidden = false
      renderAuthScreen()
      setAuthAlert('error', expiredMessage || flowCtx.error || 'El enlace de invitación o recuperación no es válido o expiró.')
    }
    renderHeaderNavigation()
    return
  }

  const hasValidSession = appAuthState.session && !isSessionExpired(appAuthState.session)
  if (!hasValidSession) {
    if (appAuthState.authMode === 'update-password') appAuthState.authMode = 'login'
    if (mainApp) mainApp.hidden = true
    if (authScreen) {
      authScreen.hidden = false
      renderAuthScreen()
      if (expiredMessage) setAuthAlert('error', expiredMessage)
    }
    renderHeaderNavigation()
    return
  }

  const router = getAppRouter()
  if (routeInitializedFor !== routeScope() || initialRecoveryRequested) {
    routeInitializedFor = routeScope()
    const saved = loadNavigationState({ userId: appAuthState.user.id, workshopId: getActiveMembership()?.workshop_id })
    let route = readAppRoute(window.location)
    if (initialRecoveryRequested) route = { name: 'password' }
    else if (!window.location.hash && !window.location.pathname.endsWith('/admin')) {
      route = saved ? routeForSnapshot(saved) : { name: appAuthState.memberships.length ? 'jobs' : 'admin' }
    }
    const recovering = initialRecoveryRequested
    initialRecoveryRequested = false
    if (!recovering && router.state() && routeHash(route) === window.location.hash) return router.sync({ force: true })
    return router.navigate(route, { replace: true, snapshot: saved, returnRoute: routeForSnapshot(saved) })
  }
  return router.sync({ force: true })
}

async function onSessionEstablished(session) {
  if (pendingSessionInitialization && pendingSessionInitialization.userId === session?.user?.id) return pendingSessionInitialization.promise
  const promise = initializeAuthenticatedSession(session).finally(() => {
    if (pendingSessionInitialization?.promise === promise) pendingSessionInitialization = null
  })
  pendingSessionInitialization = { userId: session?.user?.id, promise }
  return promise
}

async function initializeAuthenticatedSession(session) {
  resetHeaderBrandToGeneric()
  privateReadCache.clear()
  clearWorkshopReadState()
  appAuthState.session = session
  appAuthState.user = session?.user || null

  if (!appAuthState.user) {
    appAuthState.isSessionBootstrapped = false
    await enforceRouteProtection()
    return
  }

  try {
    // Desbloquear únicamente los datos locales asociados a este propietario autenticado
    await unlockOfflineDataForAuthenticatedOwner(appAuthState.user.id)

    const userId = appAuthState.user.id
    const [profile, memberships] = await Promise.all([ensureUserProfile(appAuthState.user), fetchUserWorkshops(userId)])
    if (appAuthState.user?.id !== userId) return
    appAuthState.profile = profile
    appAuthState.memberships = memberships

    if (
      appAuthState.memberships.length > 0 &&
      !appAuthState.memberships.some(m => m.workshop_id === appAuthState.activeWorkshopId)
    ) {
      appAuthState.activeWorkshopId = appAuthState.memberships[0].workshop_id
      localStorage.setItem('mitaller_active_workshop_id', appAuthState.activeWorkshopId)
    }

    privateReadCache.activate({ userId, workshopId: getActiveMembership()?.workshop_id })
    appAuthState.workshopSettings = getWorkshopSettings(getActiveMembership()?.workshop_id)
    await syncActiveWorkshopToLegacyStore({ useMembership: true })
    await loadWorkshopJobsFromSupabase()
    if (appAuthState.user?.id !== userId) return
    appAuthState.isSessionBootstrapped = true
  } catch (err) {
    console.warn('Error inicializando perfil y talleres del usuario:', err)
  }

  await enforceRouteProtection()
}

function setBudgetDeliveryFeedback(type, message, section = 'budget') {
  const box = document.getElementById('budgetDeliveryFeedback')
  if (!message) {
    if (box) {
      box.hidden = true
      box.textContent = ''
    }
    return
  }
  if (box) {
    box.className = `auth-alert ${type || 'info'}`
    box.textContent = message
    box.hidden = false
  }
  if (type === 'error') {
    showErrorModal({ message, section })
  }
}

function renderWhatsappDeliveryFeedback(type, message, url) {
  const box = document.getElementById('budgetDeliveryFeedback')
  if (!box) return
  if (!message) {
    box.hidden = true
    box.replaceChildren()
    return
  }
  box.className = `auth-alert ${type || 'info'}`
  box.innerHTML = `
    <div class="pdf-feedback-message">${esc(message)}</div>
    ${url ? `<div class="pdf-actions-bar"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="button whatsapp small-btn" id="openWhatsappDirectLink">💬 Abrir WhatsApp ahora</a></div>` : ''}
  `
  box.hidden = false
}

function renderBudgetPdfActionsFeedback(type, message) {
  const box = document.getElementById('budgetDeliveryFeedback')
  if (!box) return
  if (!message) {
    box.hidden = true
    box.replaceChildren()
    return
  }
  box.className = `auth-alert ${type || 'info'}`
  box.innerHTML = `
    <div class="pdf-feedback-message">${esc(message)}</div>
    <div class="pdf-actions-bar">
      <button type="button" class="button secondary small-btn" id="printBudgetA4Btn">🖨 Imprimir A4</button>
      <button type="button" class="button whatsapp small-btn" id="shareBudgetPdfBtn">📤 Compartir PDF</button>
      <button type="button" class="button secondary small-btn" id="repeatDownloadPdfBtn">⬇ Descargar PDF nuevamente</button>
    </div>
  `
  box.hidden = false
  box.querySelector('#printBudgetA4Btn')?.addEventListener('click', () => window.printBudget?.())
  box.querySelector('#shareBudgetPdfBtn')?.addEventListener('click', () => window.shareBudgetPdfAction?.())
  box.querySelector('#repeatDownloadPdfBtn')?.addEventListener('click', () => window.downloadBudgetPdfAction?.())
}

function getCurrentWorkshopForBudget() {
  return {
    ...(window.store?.shop || {}),
    ...(appAuthState.activeWorkshopProfile || {})
  }
}

function syncActiveJobFromDom() {
  const j = window.active
  if (!j) return null
  if (!j.rec) j.rec = {}
  document.querySelectorAll('#receptionForm [data-rec]').forEach(el => {
    const field = el.dataset.rec
    if (!field) return
    const val = el.value ?? ''
    if (String(val).trim() !== '' || !j.rec[field]) {
      j.rec[field] = field === 'patente' ? String(val).toUpperCase().trim() : val
    }
  })

  if (!Array.isArray(j.quote)) j.quote = []
  if (!j.pieceQuotes || typeof j.pieceQuotes !== 'object' || Array.isArray(j.pieceQuotes)) {
    j.pieceQuotes = {}
  }

  // Sincronizar campos manuales del modo resumido si están presentes en el DOM
  const summaryEls = document.querySelectorAll('#quoteLines [data-summary-field]')
  if (summaryEls.length > 0) {
    if (!j.summaryBudget || typeof j.summaryBudget !== 'object' || Array.isArray(j.summaryBudget)) {
      j.summaryBudget = { chapaDays: 0, chapaDayPrice: 0, pinturaPanels: 0, pinturaPanelPrice: 0 }
    }
    summaryEls.forEach(el => {
      const sField = el.dataset.summaryField
      if (sField) {
        j.summaryBudget[sField] = Math.max(0, Number(el.value) || 0)
      }
    })
    j.summaryBudget = normalizeSummaryBudget(j.summaryBudget)
  }

  const lineEls = document.querySelectorAll('#quoteLines [data-line][data-field]')
  lineEls.forEach(el => {
    const idx = Number(el.dataset.line)
    const field = el.dataset.field
    const line = j.quote[idx]
    if (!line || !field) return
    if (field === 'description') {
      line.description = el.value ?? ''
    } else if (field === 'qty' || field === 'price') {
      line[field] = Math.max(0, Number(el.value) || 0)
    } else {
      line[field] = el.value
    }
    if (line.sourceKey) {
      j.pieceQuotes[line.sourceKey] = {
        ...(j.pieceQuotes[line.sourceKey] || {}),
        qty: Math.max(0, Number(line.qty) || 0),
        price: Math.max(0, Number(line.price) || 0),
        unit: line.unit,
        workType: line.workType,
        workLabel: line.workLabel,
        pieceKey: line.pieceKey,
        pieceName: line.pieceName,
        zoneName: line.zoneName,
        description: line.description
      }
    }
  })

  // Si existen renglones válidos con descripción y cantidad > 0 (o datos en modo resumido),
  // eliminar renglones manuales extra en blanco que bloqueen la entrega, sin borrar nunca piezas de inspección.
  const mode = resolveBudgetMode(j)
  const sb = normalizeSummaryBudget(j.summaryBudget)
  const hasSummaryValues = mode === 'summary' && (sb.chapaDays > 0 || sb.pinturaPanels > 0)
  const validLines = j.quote.filter(q => String(q?.description || '').trim() && (Number(q?.qty) || 0) > 0)
  if ((validLines.length > 0 || hasSummaryValues) && validLines.length < j.quote.length) {
    const nextQuote = j.quote.filter(q => {
      const info = describeQuoteLine(q)
      if (info.isInspectionPiece) return true
      return Boolean(String(q?.description || '').trim() || (Number(q?.price) || 0) > 0)
    })
    if (nextQuote.length !== j.quote.length) {
      j.quote = nextQuote
      window.renderBudget?.()
    }
  }

  if (!j.document) j.document = {}
  const activePaintBtn = document.querySelector('#paintTypeSection [data-paint-type][aria-pressed="true"], #paintTypeSection .paint-pill.active[data-paint-type]')
  const paintTypeEl = document.getElementById('paintType')
  if (activePaintBtn) {
    const pt = normalizePaintType(activePaintBtn.getAttribute('data-paint-type'))
    j.paintType = pt
    j.document.paintType = pt
  } else if (paintTypeEl) {
    const pt = normalizePaintType(paintTypeEl.value)
    j.paintType = pt
    j.document.paintType = pt
  } else if (document.getElementById('paintTypeSection')) {
    const pt = normalizePaintType(j.paintType ?? j.document?.paintType ?? '')
    j.paintType = pt
    j.document.paintType = pt
  }
  const termsEl = document.getElementById('terms')
  if (termsEl && termsEl.value) {
    j.document.terms = termsEl.value
    j.observations = termsEl.value
  }
  const discountEl = document.getElementById('discount')
  if (discountEl && discountEl.value !== '') j.discount = Math.max(0, Number(discountEl.value) || 0)
  const taxEl = document.getElementById('tax')
  if (taxEl && taxEl.value !== '') j.tax = Math.max(0, Number(taxEl.value) || 0)
  const quoteDateEl = document.getElementById('quoteDate')
  if (quoteDateEl && quoteDateEl.value) j.document.date = quoteDateEl.value
  const validDaysEl = document.getElementById('validDays')
  if (validDaysEl && validDaysEl.value !== '') j.document.validDays = Math.max(1, Number(validDaysEl.value) || 15)

  return j
}

function validateBudgetBeforeAction() {
  const j = syncActiveJobFromDom()
  if (!j) {
    const msg = 'No hay un trabajo activo seleccionado. Volvé a Trabajos y abrí un presupuesto.'
    setBudgetDeliveryFeedback('error', msg)
    window.notify?.(msg, 'error')
    window.toast?.(msg)
    return false
  }

  const mode = resolveBudgetMode(j)
  const valid = Boolean(window.quoteValid?.())
  if (!valid) {
    const noticeEl = document.getElementById('notice')
    let reason = (!noticeEl?.hidden && noticeEl?.textContent?.trim()) || ''
    if (!reason) {
      if (!String(j.rec?.cliente || '').trim()) {
        reason = 'Completá el nombre del cliente en el Paso 1 (Recepción) antes de entregar el presupuesto.'
      } else if (!String(j.rec?.patente || '').trim()) {
        reason = 'Completá la patente del vehículo en el Paso 1 (Recepción) antes de entregar el presupuesto.'
      } else if (mode === 'summary') {
        const sb = normalizeSummaryBudget(j.summaryBudget)
        const manualLines = (Array.isArray(j.quote) ? j.quote : []).filter(q => !describeQuoteLine(q).isInspectionPiece)
        if (!sb.chapaDays && !sb.pinturaPanels && !manualLines.length) {
          reason = 'En el modo resumido, ingresá los días de chapa, paños de pintura o agregá al menos un repuesto o trabajo.'
        } else if (manualLines.some(q => !String(q?.description || '').trim() || !(Number(q?.qty) > 0))) {
          reason = 'Completá la descripción y una cantidad mayor a 0 en cada repuesto u otro trabajo.'
        } else {
          reason = 'Se canceló la entrega porque hay tarifas o trabajos con precio $ 0.'
        }
      } else if (!Array.isArray(j.quote) || !j.quote.length) {
        reason = 'Agregá al menos un trabajo o repuesto al presupuesto antes de descargarlo o enviarlo.'
      } else if (j.quote.some(q => !String(q?.description || '').trim() || !(Number(q?.qty) > 0))) {
        reason = 'Cada renglón del presupuesto necesita una descripción y una cantidad mayor a 0.'
      } else {
        reason = 'Se canceló la entrega porque hay renglones con precio $ 0. Completá el precio unitario o confirmá la entrega.'
      }
    }
    const emptyDescInput = Array.from(document.querySelectorAll('#quoteLines input[data-field="description"]')).find(
      el => !String(el.value || '').trim()
    )
    const invalidQtyInput = Array.from(document.querySelectorAll('#quoteLines input[data-field="qty"]')).find(
      el => !(Number(el.value) > 0)
    )
    if (emptyDescInput) {
      markFieldError(emptyDescInput, 'Ingresá la descripción del trabajo o repuesto.')
    }
    if (invalidQtyInput) {
      markFieldError(invalidQtyInput, 'Ingresá una cantidad mayor a 0.')
    }

    const section = !String(j.rec?.cliente || '').trim() || !String(j.rec?.patente || '').trim() ? 'reception' : 'budget'
    setBudgetDeliveryFeedback('error', reason, section)
    if (noticeEl) {
      noticeEl.className = 'notice error'
      noticeEl.textContent = reason
      noticeEl.hidden = false
    }
    window.toast?.(reason)
    return false
  }

  return true
}

function restorePieceDomStateAfterRender() {
  const openKeys = new Set(appAuthState.openPieceDetailsKeys || [])
  if (appAuthState.activePieceKey) {
    openKeys.add(appAuthState.activePieceKey)
  }

  document.querySelectorAll('details.damage-details[data-piece-details]').forEach(detailsEl => {
    const key = detailsEl.getAttribute('data-piece-details')
    if (key && openKeys.has(key)) {
      detailsEl.open = true
    }
    if (!detailsEl.__navToggleBound) {
      detailsEl.__navToggleBound = true
      detailsEl.addEventListener('toggle', () => {
        if (detailsEl.open && key) {
          appAuthState.activePieceKey = key
        }
        persistCurrentNavigationState()
      })
    }
  })

  if (appAuthState.activePieceKey) {
    document.querySelectorAll('.piece-item[data-piece-card]').forEach(cardEl => {
      const key = cardEl.getAttribute('data-piece-card')
      cardEl.classList.toggle('active-piece-focus', key === appAuthState.activePieceKey)
    })
  }
}

export function wireNavigationPersistence() {
  window.goBackFromWork = function () {
    if (appAuthState.user) return goBackAppRoute({ name: 'jobs' })
    return window.showJobs?.()
  }
  const backWorkBtn = document.getElementById('backFromWorkBtn')
  if (backWorkBtn) backWorkBtn.textContent = '← Volver'

  if (window.__navPersistenceWrapped) return
  window.__navPersistenceWrapped = true

  const origNewJob = window.newJob
  if (typeof origNewJob === 'function') {
    window.newJob = function (rec) {
      const existingIds = new Set((window.store?.jobs || []).map(j => j.id))
      const res = origNewJob.call(this, rec)
      const created = window.active
      if (created && !existingIds.has(created.id)) {
        const wsId = getActiveMembership()?.workshop_id || appAuthState.activeWorkshopId || 'default'
        const cfg = getWorkshopSettings(wsId)
        appAuthState.workshopSettings = cfg
        if (!rec?.tipo && cfg.defaultVehicleType) created.rec.tipo = cfg.defaultVehicleType
        if (cfg.defaultTaxPct !== undefined && !created.tax) created.tax = Number(cfg.defaultTaxPct) || 0
        if (created.document) {
          if (cfg.defaultValidDays) created.document.validDays = Number(cfg.defaultValidDays) || 15
          if (cfg.defaultTerms && !created.document.terms) created.document.terms = cfg.defaultTerms
        }
        window.fillReception?.()
        window.saveLocal?.(false)
      }
      return res
    }
  }

  const origRenderBudget = window.renderBudget
  if (typeof origRenderBudget === 'function') {
    window.renderBudget = function (...args) {
      prepareBudgetDelivery().catch(() => {})
      return origRenderBudget.apply(this, args)
    }
  }

  const origShowJobs = window.showJobs
  if (typeof origShowJobs === 'function') {
    window.showJobs = function (...args) {
      if (!routeRenderingDepth && appAuthState.user) return navigateAppRoute({ name: 'jobs' })
      const res = origShowJobs.apply(this, args)
      persistCurrentNavigationState({ screen: 'jobs', activeJobId: null })
      return res
    }
  }

  const origOpenJob = window.openJob
  if (typeof origOpenJob === 'function') {
    window.openJob = function (id, step) {
      prepareBudgetDelivery().catch(() => {})
      const target = window.store?.jobs?.find(job => job.id === id)
      const targetHasBudget = Boolean(
        target?.quote?.length ||
          Number(target?.summaryBudget?.chapaDays) > 0 ||
          Number(target?.summaryBudget?.pinturaPanels) > 0
      )
      const resolvedStep =
        step ||
        (targetHasBudget
          ? 'budget'
          : target?.inspection && Object.keys(target.inspection).length
            ? 'inspection'
            : 'reception')
      if (!routeRenderingDepth && appAuthState.user) {
        if (!target) return
        const snapshot = buildNavigationSnapshot({
          userId: appAuthState.user.id, workshopId: getActiveMembership()?.workshop_id,
          screen: 'work', activeJobId: id, step: resolvedStep, area: target.area
        })
        return navigateAppRoute({ name: 'work', jobId: id, step: resolvedStep }, { snapshot })
      }
      appAuthState.activePieceKey = null
      appAuthState.openPieceDetailsKeys = []
      const res = origOpenJob.call(this, id, resolvedStep)
      const workScreenEl = document.getElementById('workScreen')
      if (workScreenEl) {
        workScreenEl.dataset.renderedJobId = String(id || window.active?.id || '')
        workScreenEl.dataset.renderedStep = String(window.step || resolvedStep || 'reception')
      }
      persistCurrentNavigationState({
        screen: 'work',
        activeJobId: id || window.active?.id || null,
        step: window.step || resolvedStep || 'reception',
        area: window.active?.area || 'Parte delantera',
        page: Number(window.page || 0),
        activePieceKey: null,
        openPieceDetailsKeys: []
      })
      return res
    }
  }

  const origShowStep = window.showStep
  if (typeof origShowStep === 'function') {
    window.showStep = function (next, validate = true) {
      if (!routeRenderingDepth) persistCurrentNavigationState()
      const res = origShowStep.call(this, next, validate)
      if (window.step === 'budget') prepareBudgetDelivery().catch(() => {})
      const workScreenEl = document.getElementById('workScreen')
      if (workScreenEl && window.active) {
        workScreenEl.dataset.renderedJobId = String(window.active.id || '')
        workScreenEl.dataset.renderedStep = String(window.step || next || 'reception')
      }
      const snapshot = persistCurrentNavigationState({
        screen: 'work',
        step: window.step || next
      }, { capture: Boolean(routeRenderingDepth) })
      if (!routeRenderingDepth && window.active && window.step === next) {
        const noticeEl = document.getElementById('notice')
        const preservedNotice = !noticeEl?.hidden && noticeEl?.textContent
          ? { text: noticeEl.textContent, className: noticeEl.className, validation: noticeEl.dataset?.validation || '' }
          : null
        const navPromise = navigateAppRoute({ name: 'work', jobId: window.active.id, step: next }, { snapshot, captureDeparture: false })
        if (preservedNotice && navPromise && typeof navPromise.then === 'function') {
          navPromise.then(() => {
            if (noticeEl) {
              noticeEl.className = preservedNotice.className
              noticeEl.textContent = preservedNotice.text
              if (preservedNotice.validation) noticeEl.dataset.validation = preservedNotice.validation
              noticeEl.hidden = false
            }
            showErrorModal({ message: preservedNotice.text, section: preservedNotice.validation || 'jobs' })
          }).catch(() => {})
        }
      }
      return res
    }
  }

  const origSelectZone = window.selectZone
  if (typeof origSelectZone === 'function') {
    window.selectZone = function (zone) {
      appAuthState.activePieceKey = null
      appAuthState.openPieceDetailsKeys = []
      const res = origSelectZone.call(this, zone)
      persistCurrentNavigationState({
        screen: 'work',
        step: 'inspection',
        area: zone,
        page: 0,
        activePieceKey: null,
        openPieceDetailsKeys: []
      })
      return res
    }
  }

  const origChangePage = window.changePage
  if (typeof origChangePage === 'function') {
    window.changePage = function (delta) {
      const res = origChangePage.call(this, delta)
      persistCurrentNavigationState({
        screen: 'work',
        step: 'inspection',
        page: Number(window.page || 0)
      })
      return res
    }
  }

  const origRenderInspection = window.renderInspection
  if (typeof origRenderInspection === 'function') {
    window.renderInspection = function (...args) {
      const res = origRenderInspection.apply(this, args)
      restorePieceDomStateAfterRender()
      return res
    }
  }

  const pieceListEl = document.getElementById('pieceList')
  if (pieceListEl && !pieceListEl.__navListenerBound) {
    pieceListEl.__navListenerBound = true
    const recordPieceInteraction = e => {
      const pieceEl = e.target?.closest?.('[data-piece-card]')
      const key =
        pieceEl?.getAttribute('data-piece-card') ||
        e.target?.getAttribute?.('data-mark') ||
        e.target?.getAttribute?.('data-work') ||
        e.target?.getAttribute?.('data-note')
      if (key) {
        appAuthState.activePieceKey = key
        persistCurrentNavigationState({ activePieceKey: key })
      }
    }
    pieceListEl.addEventListener('click', recordPieceInteraction)
    pieceListEl.addEventListener('input', recordPieceInteraction)
    pieceListEl.addEventListener('focusin', recordPieceInteraction)
  }

  const mapDisclosureEl = document.getElementById('mapDisclosure')
  if (mapDisclosureEl && !mapDisclosureEl.__navListenerBound) {
    mapDisclosureEl.__navListenerBound = true
    mapDisclosureEl.addEventListener('toggle', () => {
      persistCurrentNavigationState({ mapOpen: Boolean(mapDisclosureEl.open) })
    })
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && appAuthState.user?.id) {
      persistCurrentNavigationState()
    }
  })

  let scrollTimer = null
  window.addEventListener(
    'scroll',
    () => {
      if (!appAuthState.user?.id) return
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => {
        persistCurrentNavigationState({ scrollY: Math.round(window.scrollY || 0) })
      }, 250)
    },
    { passive: true }
  )
}

export function wireEnhancedBudgetAndSettings() {
  wireNavigationPersistence()

  // DEV-25 / DEV-32: Opción A — Compartir presupuesto como mensaje de texto por WhatsApp (sin afirmar que fue enviado si solo se abrió WhatsApp)
  if (!window.__dev25WhatsappWrapped) {
    window.__dev25WhatsappWrapped = true
    window.shareWhatsapp = function () {
      if (!validateBudgetBeforeAction()) return null
      const j = window.active
      if (!j) return null
      const shop = getCurrentWorkshopForBudget()
      j.document.shop = JSON.parse(JSON.stringify(shop))
      window.saveLocal?.()

      try {
        const res = openWhatsappWithBudgetText(j, shop, window)
        renderWhatsappDeliveryFeedback('info', res.userMessage, res.url)
        window.toast?.(res.userMessage)
        return res
      } catch (err) {
        const errMsg = err.message || 'No se pudo preparar el mensaje de WhatsApp.'
        setBudgetDeliveryFeedback('error', errMsg, 'whatsapp')
        window.toast?.(errMsg)
        return null
      }
    }

    // DEV-32 / DEV-25: Botón único «Descargar / Imprimir» — Genera y descarga el PDF oficial verificado y habilita acciones de Impresión A4 y Compartir PDF
    window.downloadBudgetPdfAction = async function () {
      if (!validateBudgetBeforeAction()) return null
      const j = window.active
      if (!j) return null
      const shop = getCurrentWorkshopForBudget()
      j.document.shop = JSON.parse(JSON.stringify(shop))
      window.saveLocal?.()

      try {
        const module = budgetDeliveryModule || (await prepareBudgetDelivery())
        const res = module.downloadBudgetPdf(j, shop, document)
        renderBudgetPdfActionsFeedback('success', res.userMessage)
        window.toast?.(res.userMessage)
        return res
      } catch (err) {
        const errMsg = err.message || 'No se pudo generar ni descargar el archivo PDF.'
        setBudgetDeliveryFeedback('error', errMsg, 'pdf')
        window.toast?.(errMsg)
        return null
      }
    }

    // DEV-32 / DEV-25: Compartir el archivo PDF mediante Web Share API (Android/PWA/móvil) o fallback explícito en escritorio sin afirmar envío no confirmado
    window.shareBudgetPdfAction = async function () {
      if (!validateBudgetBeforeAction()) return null
      const j = window.active
      if (!j) return null
      const shop = getCurrentWorkshopForBudget()
      j.document.shop = JSON.parse(JSON.stringify(shop))
      window.saveLocal?.()

      try {
        const module = budgetDeliveryModule || (await prepareBudgetDelivery())
        const res = await module.shareBudgetPdf(j, shop, {
          navigatorObj: window.navigator,
          windowObj: window,
          documentObj: document
        })
        renderBudgetPdfActionsFeedback('info', res.userMessage)
        window.toast?.(res.userMessage)
        return res
      } catch (err) {
        const errMsg = err.message || 'No se pudo compartir el archivo PDF.'
        setBudgetDeliveryFeedback('error', errMsg, 'pdf')
        window.toast?.(errMsg)
        return null
      }
    }
  }

  const downloadPdfBtn = document.getElementById('downloadBudgetPdfBtn')
  if (downloadPdfBtn) {
    downloadPdfBtn.disabled = false
    downloadPdfBtn.onclick = e => {
      e?.preventDefault?.()
      return window.downloadBudgetPdfAction?.()
    }
  }

  const shareWhatsappBtn = document.getElementById('shareWhatsappTextBtn')
  if (shareWhatsappBtn) {
    shareWhatsappBtn.disabled = false
    shareWhatsappBtn.onclick = e => {
      e?.preventDefault?.()
      return window.shareWhatsapp?.()
    }
  }

  // DEV-19: Conectar la emisión de PDF / Impresión A4 para que use automáticamente todos los datos y el logo del taller desde Supabase
  if (!window.__dev19PrintWrapped) {
    window.__dev19PrintWrapped = true
    window.printBudget = function () {
      if (!validateBudgetBeforeAction()) return
      const j = window.active
      if (!j) return
      const shop = { ...(window.store?.shop || {}), ...(appAuthState.activeWorkshopProfile || {}) }
      j.document.shop = JSON.parse(JSON.stringify(shop))
      window.saveLocal?.()

      const safeDateFn = typeof window.safeDate === 'function' ? window.safeDate : v => String(v || '')
      const expiryFn = typeof window.expiry === 'function' ? window.expiry : dObj => String(dObj?.date || '')
      const moneyFn = typeof window.money === 'function' ? window.money : v => `$ ${Number(v || 0)}`
      const mode = resolveBudgetMode(j)
      const paintType = resolvePaintType(j)
      const observationsText = resolveBudgetObservations(j)
      const t = computeBudgetTotalsByMode(j, mode)
      const d = j.document || {}
      const quoteRef = j.number?.startsWith('LOCAL-') ? `Referencia ${j.id.slice(0, 8)}` : j.number
      const headerHtml = buildBudgetWorkshopHeaderHtml(
        shop,
        quoteRef,
        safeDateFn(d.date),
        safeDateFn(expiryFn(d))
      )

      const rowsHtml =
        mode === 'summary'
          ? buildSummaryPresentationLines(j)
              .map(
                row =>
                  `<tr><td>${esc(row.displayDescription)}</td><td>${esc(row.qtyWithUnit)}</td><td>${moneyFn(
                    row.price
                  )}</td><td>${moneyFn(row.subtotal)}</td></tr>`
              )
              .join('')
          : (j.quote || [])
              .map(q => {
                const info = describeQuoteLine(q)
                return `<tr><td>${esc(info.displayDescription)}</td><td>${esc(info.qtyWithUnit)}</td><td>${moneyFn(
                  info.price
                )}</td><td>${moneyFn(info.subtotal)}</td></tr>`
              })
              .join('')

      const printDoc = document.getElementById('printDocument')
      if (printDoc) {
        printDoc.innerHTML = `
          ${headerHtml}
          <div class="pdf-client">
            <div>
              <h3>Cliente</h3>
              <p><b>${esc(j.rec.cliente)}</b></p>
              <p>${esc(j.rec.telefono || '')}</p>
              <p>${esc([j.rec.direccion, j.rec.localidad].filter(Boolean).join(', '))}</p>
            </div>
            <div>
              <h3>Vehículo</h3>
              <p><b>${esc([j.rec.marca, j.rec.modelo].filter(Boolean).join(' '))}${j.rec.anio ? ` (${esc(j.rec.anio)})` : ''}</b></p>
              <p>Patente: <b>${esc((j.rec.patente || '').toUpperCase())}</b>${j.rec.anio ? ` · Año: <b>${esc(j.rec.anio)}</b>` : ''}${paintType ? ` · Pintura: <b>${esc(paintType)}</b>` : ''}</p>
              <p>${j.rec.km ? `Kilometraje: ${esc(j.rec.km)} km` : ''}</p>
            </div>
          </div>
          <table class="pdf-table">
            <thead>
              <tr><th>${mode === 'summary' ? 'Concepto / Trabajo' : 'Pieza / Intervención'}</th><th>Cant. / Unid.</th><th>Precio unit.</th><th>Subtotal</th></tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <div class="pdf-total">
            ${paintType ? `<div><span>Tipo de pintura</span><b>${esc(paintType)}</b></div>` : ''}
            ${t.chapaCount > 0 || t.chapaSubtotal > 0 ? `<div><span>Resumen Chapa (${formatArQuantity(t.chapaDays)} días)</span><b>${moneyFn(t.chapaSubtotal)}</b></div>` : ''}
            ${t.pinturaCount > 0 || t.pinturaSubtotal > 0 ? `<div><span>Resumen Pintura (${formatArQuantity(t.pinturaPanels)} paños)</span><b>${moneyFn(t.pinturaSubtotal)}</b></div>` : ''}
            ${t.otherSubtotal > 0 && (t.chapaCount > 0 || t.pinturaCount > 0) ? `<div><span>Otros trabajos / repuestos</span><b>${moneyFn(t.otherSubtotal)}</b></div>` : ''}
            <div><span>Subtotal</span><b>${moneyFn(t.subtotal)}</b></div>
            ${t.discount ? `<div><span>Descuento</span><b>- ${moneyFn(t.discount)}</b></div>` : ''}
            ${t.tax ? `<div><span>Impuesto</span><b>${moneyFn(t.tax)}</b></div>` : ''}
            <div class="pdf-grand"><span>Total</span><b>${moneyFn(t.total)}</b></div>
          </div>
          ${
            observationsText || paintType
              ? `<div class="pdf-terms"><b>Condiciones y observaciones</b><p>${esc(
                  [paintType ? `Sistema de pintura del vehículo: ${paintType}.` : '', observationsText]
                    .filter(Boolean)
                    .join('\n')
                )}</p></div>`
              : ''
          }
          <div class="pdf-signature">
            <div class="pdf-signature-space">
              ${
                shop.signature_url && /^data:image\/(png|jpeg|jpg|webp)/i.test(shop.signature_url)
                  ? `<img src="${esc(shop.signature_url)}" alt="Firma del taller" style="max-height:38px;max-width:140px;object-fit:contain">`
                  : ''
              }
            </div>
            <div class="pdf-signature-line">
              <b>FIRMA Y SELLO DEL TALLER EMISOR</b>
              <div>${esc([shop.name || 'Crash Solution', shop.legal_name, shop.tax_id ? `CUIT ${shop.tax_id}` : ''].filter(Boolean).join(' · '))}</div>
            </div>
          </div>
          <p class="pdf-footer">
            ${esc(
              [
                shop.name,
                shop.legal_name,
                shop.tax_id ? `CUIT ${shop.tax_id}` : '',
                shop.address,
                shop.phone ? `Tel: ${shop.phone}` : '',
                shop.whatsapp ? `WhatsApp: ${shop.whatsapp}` : '',
                shop.email
              ]
                .filter(Boolean)
                .join(' · ')
            )}<br>
            Presupuesto estimativo sujeto al alcance indicado. Este documento no es una factura.
          </p>
        `
      }
      const prevTitle = document.title
      document.title = `Presupuesto ${j.rec.patente || ''} · ${shop.name || 'Crash Solution'}`
      window.print()
      document.title = prevTitle
    }
  }

  // DEV-33: Conectar Configuración para abrir la sección dedicada (#/configuracion)
  window.openSettings = function () {
    if (appAuthState.user) {
      openSettingsScreen()
    }
  }
}

export async function initAuthAndAdmin() {
  const liveCallback = parseAuthCallbackUrl(window.location)
  const capturedCallback = getCapturedInitialCallback()
  const callbackInfo = liveCallback.isAuthCallback
    ? {
        ...liveCallback,
        preExistingUserId:
          appAuthState.user?.id ||
          capturedCallback?.preExistingUserId ||
          readStoredSupabaseSessionUser()?.userId ||
          null
      }
    : capturedCallback?.isAuthCallback
      ? {
          ...capturedCallback,
          preExistingUserId: appAuthState.user?.id || capturedCallback.preExistingUserId || null
        }
      : liveCallback

  const pendingEmailChange = readPendingEmailChange()
  const isPotentialEmailChangeCallback = Boolean(
    callbackInfo.isEmailChangeFlow ||
      (callbackInfo.hasCallbackError &&
        !callbackInfo.isPasswordSetupFlow &&
        !callbackInfo.hasUpdatePasswordRoute &&
        pendingEmailChange?.userId)
  )

  initialRecoveryRequested = initialRecoveryRequested || Boolean(callbackInfo.isPasswordSetupFlow)
  wireEnhancedBudgetAndSettings()

  if (!isSupabaseConfigured || !supabase) {
    await enforceRouteProtection('Faltan configurar las variables de entorno de Supabase.')
    return
  }

  const originalSaveLocal = window.saveLocal
  if (typeof originalSaveLocal === 'function' && !window.__supabaseSaveWrapped) {
    window.__supabaseSaveWrapped = true
    window.saveLocal = function (schedule = true) {
      const ok = originalSaveLocal(schedule)
      if (schedule && window.active && appAuthState.user) {
        clearTimeout(window.__jobCloudTimer)
        window.__jobCloudTimer = setTimeout(() => {
          saveActiveJobToSupabase(window.active)
        }, 800)
      }
      return ok
    }
  }

  // Si se abrió un enlace de invitación o recuperación mientras había otro usuario conectado en memoria,
  // aislar de inmediato la sesión anterior antes de resolver la nueva identidad.
  const preExistingUserId = callbackInfo.preExistingUserId || appAuthState.user?.id || null
  if (callbackInfo.isAuthCallback && !isPotentialEmailChangeCallback && preExistingUserId && appAuthState.user?.id === preExistingUserId) {
    const prevMembership = getActiveMembership()
    await lockOfflineDataOnLogout({
      userId: preExistingUserId,
      workshopId: prevMembership?.workshop_id || null
    }).catch(() => {})
    resetHeaderBrandToGeneric()
    privateReadCache.clear()
    clearWorkshopReadState()
    clearNavigationState()
    appAuthState.session = null
    appAuthState.user = null
    appAuthState.profile = null
    appAuthState.memberships = []
    appAuthState.activeWorkshopId = null
    appAuthState.activeWorkshopProfile = null
    localStorage.removeItem('mitaller_active_workshop_id')
    appAuthState.isSessionBootstrapped = false
  }

  const { data, error } = await supabase.auth.getSession()

  const isEmailChangeCallback = Boolean(
    callbackInfo.isEmailChangeFlow ||
      (callbackInfo.hasCallbackError &&
        !callbackInfo.isPasswordSetupFlow &&
        !callbackInfo.hasUpdatePasswordRoute &&
        pendingEmailChange?.userId &&
        data?.session?.user?.id &&
        String(pendingEmailChange.userId) === String(data.session.user.id))
  )

  if (callbackInfo.isAuthCallback && !isEmailChangeCallback) {
    appAuthState.passwordFlowContext = {
      flowType: callbackInfo.type === 'recovery' ? 'recovery' : 'invite',
      verified: false,
      blocked: false,
      pending: true,
      userId: null,
      email: callbackInfo.jwtClaims?.email || '',
      preExistingUserId,
      callbackInfo
    }
  }

  if (isEmailChangeCallback) {
    const verification = await verifyEmailChangeCallback({
      supabaseClient: supabase,
      callbackInfo,
      currentSession: data?.session || null
    })
    clearCapturedInitialCallback()

    const sessionToUse = verification.session || data?.session || null
    if (sessionToUse?.user?.id && !isSessionExpired(sessionToUse)) {
      if (window.history?.replaceState) {
        window.history.replaceState(null, '', `${window.location.pathname}#/configuracion`)
      }
      await onSessionEstablished(sessionToUse)
      await navigateAppRoute({ name: 'settings' }, { replace: true })
      if (!verification.ok) {
        setSettingsAlert('error', verification.error || 'No se pudo confirmar el cambio de correo electrónico.')
      } else if (verification.confirmed) {
        clearPendingEmailChange()
        setSettingsAlert('success', verification.message)
        window.toast?.(verification.message)
      } else {
        setSettingsAlert('info', verification.message)
      }
    } else {
      if (window.history?.replaceState) {
        window.history.replaceState(null, '', window.location.pathname)
      }
      await enforceRouteProtection(
        verification.error || 'No se pudo confirmar el cambio de correo electrónico. Iniciá sesión para intentarlo nuevamente.'
      )
    }
  } else if (callbackInfo.isAuthCallback) {
    const verification = await establishAndVerifyCallbackSession({
      supabaseClient: supabase,
      callbackInfo,
      currentSession: data?.session || null,
      preExistingUserId
    })

    if (verification.blocked) {
      appAuthState.passwordFlowContext = verification
      appAuthState.session = null
      appAuthState.user = null
      initialRecoveryRequested = false
      await enforceRouteProtection(verification.error)
    } else if (verification.ok && verification.verified) {
      appAuthState.passwordFlowContext = { ...verification, callbackInfo }
      initialRecoveryRequested = true
      await onSessionEstablished(verification.session)
    } else {
      appAuthState.passwordFlowContext = {
        ...verification,
        callbackInfo,
        preExistingUserId
      }
      await enforceRouteProtection()
    }
  } else if (error) {
    await enforceRouteProtection(translateAuthError(error))
  } else if (data?.session) {
    if (isSessionExpired(data.session)) {
      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
      if (refreshErr || !refreshed?.session) {
        await handleExpiredSession()
      } else {
        await onSessionEstablished(refreshed.session)
      }
    } else {
      await onSessionEstablished(data.session)
    }
  } else {
    await enforceRouteProtection()
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      const prevId = appAuthState.passwordFlowContext?.preExistingUserId || appAuthState.user?.id || null
      if (prevId && session?.user?.id && String(prevId) !== String(session.user.id)) {
        privateReadCache.clear()
        clearWorkshopReadState()
        clearNavigationState()
      }
      if (!session?.user?.id || isSessionExpired(session)) {
        appAuthState.passwordFlowContext = {
          flowType: 'recovery',
          verified: false,
          blocked: true,
          errorCode: 'RECOVERY_INVALID',
          error: 'El enlace de recuperación expiró o no es válido. Por seguridad, no se modificó ninguna contraseña.'
        }
        appAuthState.session = null
        appAuthState.user = null
        initialRecoveryRequested = false
        await enforceRouteProtection(appAuthState.passwordFlowContext.error)
        return
      }
      appAuthState.passwordFlowContext = {
        ok: true,
        verified: true,
        blocked: false,
        flowType: 'recovery',
        userId: String(session.user.id),
        email: String(session.user.email || '').trim().toLowerCase(),
        accessToken: session.access_token,
        tokenFingerprint: computeTokenFingerprint(session.access_token),
        preExistingUserId: prevId && String(prevId) !== String(session.user.id) ? String(prevId) : null
      }
      appAuthState.session = session
      appAuthState.user = session?.user || null
      initialRecoveryRequested = true
      await enforceRouteProtection()
      return
    }
    if (event === 'SIGNED_OUT') {
      resetHeaderBrandToGeneric()
      clearPendingEmailChange()
      privateReadCache.clear()
      clearWorkshopReadState()
      appAuthState.authMode = 'login'
      appAuthState.passwordFlowContext = null
      clearCapturedInitialCallback()
      const prevUserId = appAuthState.user?.id || null
      const activeMembership = getActiveMembership()
      await lockOfflineDataOnLogout({
        userId: prevUserId,
        workshopId: activeMembership?.workshop_id || null
      })
      clearNavigationState()
      if (window.store) {
        window.store.jobs = []
        window.store.activeId = null
      }
      window.active = null
      appAuthState.session = null
      appAuthState.user = null
      appAuthState.profile = null
      appAuthState.memberships = []
      appAuthState.activeWorkshopId = null
      appAuthState.activeWorkshopProfile = null
      localStorage.removeItem('mitaller_active_workshop_id')
      appAuthState.isSessionBootstrapped = false
      appAuthState.pendingSyncCount = 0
      appAuthState.unresolvedConflicts = []
      appAuthState.activePieceKey = null
      appAuthState.openPieceDetailsKeys = []
      renderHeaderNavigation()
      routeInitializedFor = null
      await getAppRouter().navigate({ name: 'jobs' }, { replace: true })
      return
    }
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      const activeCallbackInfo =
        appAuthState.passwordFlowContext?.callbackInfo ||
        (parseAuthCallbackUrl(window.location).isAuthCallback ? parseAuthCallbackUrl(window.location) : null)

      if (
        activeCallbackInfo &&
        !activeCallbackInfo.isEmailChangeFlow &&
        (appAuthState.passwordFlowContext?.pending || isPasswordSetupCallback(window.location))
      ) {
        const verification = await establishAndVerifyCallbackSession({
          supabaseClient: supabase,
          callbackInfo: activeCallbackInfo,
          currentSession: session,
          preExistingUserId: appAuthState.passwordFlowContext?.preExistingUserId || null
        })
        if (verification.blocked) {
          appAuthState.passwordFlowContext = verification
          appAuthState.session = null
          appAuthState.user = null
          initialRecoveryRequested = false
          await enforceRouteProtection(verification.error)
          return
        }
        if (verification.ok && verification.verified) {
          appAuthState.passwordFlowContext = { ...verification, callbackInfo: activeCallbackInfo }
          initialRecoveryRequested = true
          session = verification.session
        }
      }

      const shouldReinit = shouldReinitializeOnAuthEvent({
        event,
        previousUserId: appAuthState.user?.id || null,
        nextUserId: session?.user?.id || null,
        isInitialized: appAuthState.isSessionBootstrapped
      })
      appAuthState.session = session
      appAuthState.user = session?.user || appAuthState.user
      if (event === 'USER_UPDATED' && session?.user) {
        const pendingRec = readPendingEmailChange()
        const updatedEmail = String(session.user.email || '').trim().toLowerCase()
        const stillPendingEmail = String(session.user.new_email || '').trim().toLowerCase()
        if (!stillPendingEmail && pendingRec && updatedEmail === pendingRec.newEmail) {
          clearPendingEmailChange()
        }
        const currentEmailEl = document.getElementById('settingsCurrentEmail')
        if (currentEmailEl && updatedEmail) currentEmailEl.textContent = updatedEmail
        const passEmailEl = document.getElementById('settingsPasswordAccountEmail')
        if (passEmailEl && updatedEmail) passEmailEl.textContent = updatedEmail
        if (!stillPendingEmail) document.getElementById('settingsPendingEmailNotice')?.remove()
        const profileEmailEl = document.getElementById('personalProfileEmailValue')
        if (profileEmailEl && updatedEmail) profileEmailEl.textContent = updatedEmail
      }
      if (shouldReinit || initialRecoveryRequested) {
        await onSessionEstablished(session)
      }
    }
  })

  if (!window.__dev26OfflineListenersBound) {
    window.__dev26OfflineListenersBound = true

    window.addEventListener('offline', async () => {
      appAuthState.isOnline = false
      await refreshOfflineQueueStatus()
      renderHeaderNavigation()
      window.toast?.('Se perdió la conexión a Internet. Podés seguir trabajando; los cambios se guardan en este dispositivo.')
    })

    window.addEventListener('online', async () => {
      appAuthState.isOnline = true
      renderHeaderNavigation()
      window.toast?.('Conexión a Internet recuperada. Sincronizando cambios pendientes…')
      await loadWorkshopJobsFromSupabase()
    })
  }

  // popstate and hashchange are handled together by the shared app router.
  getAppRouter()
}

if (typeof window !== 'undefined' && document.getElementById('authScreen')) {
  initAuthAndAdmin()
}
