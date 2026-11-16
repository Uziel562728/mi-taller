import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'

const backend = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  storage: { from: vi.fn() },
  auth: {
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: vi.fn(),
    updateUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })),
    signOut: vi.fn(async () => ({ error: null }))
  }
}))

vi.mock('../Crash_Solution_Publicacion/src/lib/supabase.js', () => ({
  supabase: backend,
  isSupabaseConfigured: true
}))

import {
  appAuthState,
  enforceRouteProtection,
  navigateAppRoute,
  goBackAppRoute,
  openSettingsScreen,
  renderSettingsScreen,
  renderProfileScreen,
  renderStockScreen,
  renderAdminScreen,
  renderHeaderNavigation,
  switchActiveWorkshop,
  wireEnhancedBudgetAndSettings,
  resetAppRouter,
  showErrorModal,
  closeErrorModal,
  isErrorModalOpen,
  renderConflictResolutionNotice,
  syncBudgetFromInspection,
  computeDetailedBudgetTotals,
  describeQuoteLine,
  resolveBudgetMode,
  normalizeSummaryBudget,
  computeSummaryBudgetTotals,
  computeBudgetTotalsByMode,
  checkBudgetModesConsistency,
  normalizePaintType,
  resolvePaintType,
  resolveBudgetObservations,
  buildSummaryPresentationLines,
  formatArQuantity
} from '../Crash_Solution_Publicacion/src/main.js'
import { buildBudgetWhatsappMessage } from '../Crash_Solution_Publicacion/src/lib/budget-messages.js'
import {
  saveOfflineJob,
  getOfflineJobsForScope,
  setOfflineSessionOwner
} from '../Crash_Solution_Publicacion/src/lib/offline-sync.js'
import {
  generateBudgetPdfBytes,
  verifyPdfBytesIntegrity,
  downloadBudgetPdf,
  shareBudgetPdf
} from '../Crash_Solution_Publicacion/src/lib/budget-delivery.js'
import {
  getActiveStockItems,
  countActiveStockItems,
  formatPurchasePriceArs,
  validateStockItemInput,
  fetchWorkshopStock
} from '../Crash_Solution_Publicacion/src/lib/stock.js'
import {
  DEFAULT_WORKSHOP_SETTINGS,
  getSettingsSchema,
  registerSettingParameter,
  validateWorkshopSettings,
  getWorkshopSettings,
  saveWorkshopSettings
} from '../Crash_Solution_Publicacion/src/lib/settings.js'
import { privateReadCache } from '../Crash_Solution_Publicacion/src/lib/scoped-cache.js'

const SAMPLE_SHOP = {
  id: 'w1',
  name: 'Crash Solution Central',
  legal_name: 'Crash Solution S.R.L.',
  tax_id: '30-71234567-9',
  phone: '011 4555-1234',
  whatsapp: '+54 9 11 5555-1234',
  email: 'presupuestos@crashsolution.com.ar',
  address: 'Av. Warnes 1234, CABA'
}

const SAMPLE_JOB = {
  id: 'job-dev32-01',
  number: 'OT-00320',
  status: 'Borrador',
  rec: {
    cliente: 'Martín Gómez',
    telefono: '11 5555 1002',
    patente: 'AE 456 FG',
    marca: 'Fiat',
    modelo: 'Cronos',
    anio: '2021',
    km: '51000',
    localidad: 'CABA',
    direccion: 'Av. Corrientes 4500'
  },
  inspection: {},
  quote: [
    { id: 'q1', description: 'Paragolpes delantero · Chapa y pintura', qty: 1, price: 120000 }
  ],
  discount: 10,
  tax: 21,
  document: {
    date: '2026-11-10',
    validDays: 15,
    terms: 'Validez 15 días. No equivale a factura.'
  }
}

let stockRowsByWorkshop = {}
let movementsByWorkshop = {}

function setupDom() {
  document.body.innerHTML = `
    <header class="app-header">
      <div id="headerAuthNav"></div>
      <div class="header-tools"></div>
    </header>
    <section id="authScreen" hidden></section>
    <main class="container" id="mainAppContainer">
      <div id="notice" class="notice" role="alert" hidden></div>
      <section id="jobsScreen"></section>
      <section id="workScreen" hidden>
        <div class="work-heading">
          <button type="button" class="text-button" id="backFromWorkBtn">← Volver</button>
          <div class="work-title"><h1 id="workVehicle"></h1><span class="status-tag" id="workStatus"></span></div>
          <p class="subtitle" id="workCustomer"></p>
        </div>
        <section id="receptionStep">
          <div id="receptionForm">
            <input data-rec="cliente" value="Martín Gómez" />
            <input data-rec="patente" value="AE 456 FG" />
            <input data-rec="telefono" value="11 5555 1002" />
          </div>
        </section>
        <section id="inspectionStep" hidden></section>
        <section id="budgetStep" hidden>
          <div id="quoteLines"></div>
          <input id="discount" value="10" />
          <input id="tax" value="21" />
          <input id="quoteDate" value="2026-11-10" />
          <input id="validDays" value="15" />
          <textarea id="terms">Validez 15 días. No equivale a factura.</textarea>
          <div class="delivery-actions">
            <button type="button" class="button primary" id="downloadBudgetPdfBtn" onclick="downloadBudgetPdfAction()">Descargar / Imprimir</button>
            <button type="button" class="button whatsapp" id="shareWhatsappTextBtn" onclick="shareWhatsapp()">Enviar por WhatsApp</button>
          </div>
          <div id="budgetDeliveryFeedback" class="auth-alert info" role="status" aria-live="polite" hidden></div>
        </section>
      </section>
      <section id="stockScreen" hidden></section>
      <section id="profileScreen" hidden></section>
      <section id="adminScreen" hidden></section>
      <section id="settingsScreen" hidden></section>
    </main>
    <div id="toast" hidden></div>
    <section id="printDocument" class="print-document"></section>
  `
}

beforeEach(() => {
  resetAppRouter()
  privateReadCache.clear()
  vi.clearAllMocks()
  localStorage.clear()
  history.replaceState(null, '', '/')
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  window.scrollTo = vi.fn()
  window.print = vi.fn()
  window.toast = vi.fn()
  window.quoteValid = vi.fn(() => true)
  window.saveLocal = vi.fn(() => true)
  window.totals = vi.fn(() => ({ subtotal: 120000, discount: 12000, tax: 22680, total: 130680 }))
  window.money = vi.fn(v => `$ ${Number(v || 0).toLocaleString('es-AR')}`)
  window.safeDate = vi.fn(s => s || '10/11/2026')
  window.expiry = vi.fn(() => '25/11/2026')
  window.showJobs = vi.fn(() => {
    window.screen = 'jobs'
    document.getElementById('jobsScreen').hidden = false
    document.getElementById('workScreen').hidden = true
  })
  window.openJob = vi.fn((id, step = 'reception') => {
    window.active = window.store.jobs.find(j => j.id === id) || null
    window.screen = 'work'
    window.step = step
    document.getElementById('jobsScreen').hidden = true
    document.getElementById('workScreen').hidden = false
  })
  window.fillReception = vi.fn()
  window.renderInspection = vi.fn()
  window.renderBudget = vi.fn()
  window.showStep = vi.fn(next => {
    window.step = next
    for (const s of ['reception', 'inspection', 'budget']) {
      const el = document.getElementById(`${s}Step`)
      if (el) el.hidden = s !== next
    }
  })
  window.__navPersistenceWrapped = false
  window.__dev25WhatsappWrapped = false
  window.__dev19PrintWrapped = false
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = () => 'blob:https://mitaller/mock-pdf'
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = () => {}
  }

  setupDom()

  stockRowsByWorkshop = {
    w1: [
      {
        id: 'st-1',
        workshop_id: 'w1',
        name: 'Barniz Bicapa 2K',
        category: 'Pinturas',
        unit: 'lt',
        purchase_price: 18500,
        sale_price: 35000,
        quantity: 4,
        minimum_quantity: 2,
        archived_at: null
      },
      {
        id: 'st-2',
        workshop_id: 'w1',
        name: 'Primer Poliuretánico',
        category: 'Pinturas',
        unit: 'lt',
        purchase_price: 12000,
        sale_price: 24000,
        quantity: 1,
        minimum_quantity: 3,
        archived_at: null
      },
      {
        id: 'st-3-archived',
        workshop_id: 'w1',
        name: 'Lija al agua 600 ( discontinuada )',
        category: 'Abrasivos',
        unit: 'un.',
        purchase_price: 900,
        sale_price: 1800,
        quantity: 0,
        minimum_quantity: 5,
        archived_at: '2026-10-01T10:00:00.000Z'
      }
    ],
    w2: [
      {
        id: 'st-w2-1',
        workshop_id: 'w2',
        name: 'Paragolpes Hilux',
        category: 'Repuestos',
        unit: 'un.',
        purchase_price: 140000,
        sale_price: 220000,
        quantity: 2,
        minimum_quantity: 1,
        archived_at: null
      }
    ]
  }
  movementsByWorkshop = { w1: [], w2: [] }

  backend.from.mockImplementation(table => {
    let op = 'select'
    let payload = null
    const filters = {}
    const run = () => {
      if (table === 'workshops') {
        const wsId = filters.id || 'w1'
        return {
          data: {
            id: wsId,
            name: wsId === 'w2' ? 'Taller Sucursal Norte' : 'Crash Solution Central',
            legal_name: 'Crash Solution S.R.L.',
            tax_id: '30-71234567-9'
          },
          error: null
        }
      }
      if (table === 'workshop_members' || table === 'user_profiles' || table === 'part_compatibility') {
        return { data: [], error: null }
      }
      if (table === 'stock_movements') {
        const wsId = filters.workshop_id || 'w1'
        if (movementsByWorkshop.__fail) return { data: null, error: new Error('Error temporal en historial') }
        return { data: movementsByWorkshop[wsId] || [], error: null }
      }
      if (table === 'stock_items') {
        const wsId = filters.workshop_id || 'w1'
        const list = stockRowsByWorkshop[wsId] || []
        if (op === 'insert') {
          const created = {
            id: `st-new-${ list.length + 1 }`,
            workshop_id: wsId,
            archived_at: null,
            quantity: 0,
            ...payload
          }
          list.push(created)
          stockRowsByWorkshop[wsId] = list
          return { data: { ...created }, error: null }
        }
        if (op === 'update') {
          const target = list.find(r => r.id === filters.id)
          if (target) Object.assign(target, payload)
          return { data: target ? { ...target } : null, error: null }
        }
        return { data: list.map(r => ({ ...r })), error: null }
      }
      return { data: [], error: null }
    }

    const q = {
      select: () => q,
      order: () => q,
      limit: () => q,
      in: () => q,
      eq: (k, v) => {
        filters[k] = v
        return q
      },
      insert: val => {
        op = 'insert'
        payload = val
        return q
      },
      update: val => {
        op = 'update'
        payload = val
        return q
      },
      delete: () => q,
      range: async () => run(),
      single: async () => run(),
      maybeSingle: async () => run(),
      then: (res, rej) => Promise.resolve(run()).then(res, rej)
    }
    return q
  })

  backend.rpc.mockImplementation(async (fnName, args) => {
    if (fnName === 'record_stock_movement') {
      for (const list of Object.values(stockRowsByWorkshop)) {
        const found = Array.isArray(list) && list.find(i => i.id === args.p_item_id)
        if (found) {
          found.quantity = Number(found.quantity || 0) + Number(args.p_quantity || 0)
          return { data: { ...found }, error: null }
        }
      }
    }
    return { data: null, error: null }
  })

  Object.assign(appAuthState, {
    user: { id: 'u1', email: 'admin@crashsolution.com.ar' },
    session: { access_token: 'tok', user: { id: 'u1' }, expires_at: Math.floor(Date.now() / 1000) + 3600 },
    profile: { display_name: 'Román Admin' },
    activeWorkshopId: 'w1',
    activeWorkshopProfile: { ...SAMPLE_SHOP },
    memberships: [
      { workshop_id: 'w1', role: 'owner', workshop: { ...SAMPLE_SHOP } },
      { workshop_id: 'w2', role: 'owner', workshop: { id: 'w2', name: 'Taller Sucursal Norte' } }
    ],
    authMode: 'login',
    stockItems: [],
    stockMovements: [],
    editingStockItem: null,
    movementTargetItem: null,
    draftCompatibilities: [],
    stockFilters: {
      search: '',
      category: '',
      brand: '',
      status: 'active',
      vehicleMake: '',
      vehicleModel: '',
      vehicleYear: ''
    },
    workshopSettings: { ...DEFAULT_WORKSHOP_SETTINGS },
    isOnline: true
  })

  window.store = {
    jobs: [JSON.parse(JSON.stringify(SAMPLE_JOB))],
    activeId: SAMPLE_JOB.id,
    shop: { ...SAMPLE_SHOP },
    next: 2
  }
  window.active = window.store.jobs[0]
  privateReadCache.activate({ userId: 'u1', workshopId: 'w1' })
  wireEnhancedBudgetAndSettings()
})

afterEach(() => {
  resetAppRouter()
  privateReadCache.clear()
  window.__headerMenuController?.abort()
  delete HTMLElement.prototype.scrollIntoView
})

describe('ETAPA 1 — DEV-32: Descarga, Impresión y Compartición de Presupuestos PDF', () => {
  it('1. En index.html deja un único botón «Descargar / Imprimir» y conserva «Enviar por WhatsApp» por separado sin botones duplicados', () => {
    const html = readFileSync(resolve(process.cwd(), 'Crash_Solution_Publicacion/index.html'), 'utf8')
    const match = html.match(/<div class="delivery-actions">([\s\S]*?)<\/div>/)
    expect(match).not.toBeNull()
    const actionsHtml = match[1]
    expect(actionsHtml).toContain('id="downloadBudgetPdfBtn"')
    expect(actionsHtml).toContain('Descargar / Imprimir')
    expect(actionsHtml).toContain('id="shareWhatsappTextBtn"')
    expect(actionsHtml).toContain('Enviar por WhatsApp')
    expect(actionsHtml).not.toContain('id="printBudgetA4Btn"')
    expect(actionsHtml).not.toContain('id="shareBudgetPdfBtn"')
  })

  it('2. Genera un PDF válido e íntegro (%PDF-1.x), sanitizando signos Unicode fuera de WinAnsi y verificando su tamaño', () => {
    const bytes = generateBudgetPdfBytes(SAMPLE_JOB, SAMPLE_SHOP)
    const integrity = verifyPdfBytesIntegrity(bytes)
    expect(integrity.valid).toBe(true)
    expect(bytes.byteLength).toBeGreaterThan(1500)

    const rawText = new TextDecoder('latin1').decode(bytes)
    expect(rawText.startsWith('%PDF-')).toBe(true)
    expect(rawText).toContain('CRASH SOLUTION CENTRAL')
    expect(rawText).toContain('30-71234567-9')
    expect(rawText).toContain('AE 456 FG')
    expect(rawText).not.toContain('\u2212')
  })

  it('3. Descarga el PDF en Chrome, Android PWA y escritorio manteniendo el enlace en DOM y postergando revokeObjectURL', () => {
    vi.useFakeTimers()
    try {
      const createUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:https://mitaller/pdf-123')
      const revokeUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

      const result = downloadBudgetPdf(SAMPLE_JOB, SAMPLE_SHOP, document)
      expect(result.downloaded).toBe(true)
      expect(result.sentConfirmed).toBe(false)
      expect(result.filename).toBe('Presupuesto_AE_456_FG_2026-11-10.pdf')
      expect(result.byteLength).toBeGreaterThan(1500)
      expect(createUrlSpy).toHaveBeenCalledTimes(1)
      expect(clickSpy).toHaveBeenCalledTimes(1)

      // En Android PWA / Chrome el gestor de descargas necesita que el Blob URL no se revoque de inmediato
      expect(revokeUrlSpy).not.toHaveBeenCalled()
      vi.advanceTimersByTime(2000)
      expect(revokeUrlSpy).not.toHaveBeenCalled()
      vi.advanceTimersByTime(30000)
      expect(revokeUrlSpy).toHaveBeenCalledWith('blob:https://mitaller/pdf-123')

      createUrlSpy.mockRestore()
      revokeUrlSpy.mockRestore()
      clickSpy.mockRestore()
    } finally {
      vi.useRealTimers()
    }
  })

  it('4. Al pulsar «Descargar / Imprimir» descarga el PDF y despliega las acciones de Imprimir A4 y Compartir PDF sin afirmar envío falso', async () => {
    const createUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:https://mitaller/pdf-action')
    const revokeUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const res = await window.downloadBudgetPdfAction()
    expect(res?.downloaded).toBe(true)
    expect(res?.sentConfirmed).toBe(false)

    const feedback = document.getElementById('budgetDeliveryFeedback')
    expect(feedback.hidden).toBe(false)
    expect(feedback.textContent).toContain('PDF generado y descargado')
    expect(feedback.textContent).not.toMatch(/enviado exitosamente al cliente/i)

    const printBtn = document.getElementById('printBudgetA4Btn')
    const shareBtn = document.getElementById('shareBudgetPdfBtn')
    const repeatBtn = document.getElementById('repeatDownloadPdfBtn')
    expect(printBtn).not.toBeNull()
    expect(shareBtn).not.toBeNull()
    expect(repeatBtn).not.toBeNull()

    printBtn.click()
    expect(window.print).toHaveBeenCalledTimes(1)

    createUrlSpy.mockRestore()
    revokeUrlSpy.mockRestore()
    clickSpy.mockRestore()
  })

  it('5. «Compartir PDF» comparte en el primer toque sin retorno prematuro e informa errores reales sin afirmar envío no confirmado', async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined)
    const origNav = window.navigator
    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        ...origNav,
        canShare: vi.fn(() => true),
        share: mockShare
      }
    })

    const shareRes = await window.shareBudgetPdfAction()
    expect(mockShare).toHaveBeenCalledTimes(1)
    expect(shareRes?.mode).toBe('web-share-file')
    expect(shareRes?.sentConfirmed).toBe(false)

    // Si falla con un error distinto de AbortError, informa claramente el error y no afirma que fue enviado
    await expect(
      shareBudgetPdf(SAMPLE_JOB, SAMPLE_SHOP, {
        navigatorObj: {
          canShare: () => true,
          share: async () => {
            const err = new Error('NotAllowedError')
            err.name = 'NotAllowedError'
            throw err
          }
        },
        windowObj: window,
        documentObj: document
      })
    ).rejects.toThrow(/No se pudo compartir el archivo PDF/i)

    Object.defineProperty(window, 'navigator', { configurable: true, value: origNav })
  })

  it('6. INTEGRACIÓN DOM REAL: Clic directo sobre #downloadBudgetPdfBtn y #shareWhatsappTextBtn funciona tras navegar entre pantallas, editar un trabajo y volver al presupuesto', async () => {
    const createUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:https://mitaller/pdf-dom-click')
    const revokeUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => ({ closed: false }))

    // Simulamos renderBudget real que rellena #quoteLines con inputs
    window.renderBudget = vi.fn(() => {
      const container = document.getElementById('quoteLines')
      if (!container || !window.active) return
      container.innerHTML = (window.active.quote || [])
        .map(
          (line, idx) => `
          <div class="quote-row">
            <input data-line="${idx}" data-field="description" value="${line.description || ''}" />
            <input data-line="${idx}" data-field="qty" value="${line.qty ?? 1}" />
            <input data-line="${idx}" data-field="price" value="${line.price ?? 0}" />
          </div>
        `
        )
        .join('')
    })
    window.__navPersistenceWrapped = false
    window.__dev25WhatsappWrapped = false
    wireEnhancedBudgetAndSettings()

    // 1. Navegar a Trabajos -> Stock -> volver a abrir el trabajo sin pasar step explícito (debe abrir 'budget' porque tiene quote)
    await navigateAppRoute({ name: 'jobs' })
    await navigateAppRoute({ name: 'stock' })
    await window.openJob(SAMPLE_JOB.id)

    expect(window.step).toBe('budget')
    expect(document.getElementById('workScreen').hidden).toBe(false)
    expect(document.getElementById('budgetStep').hidden).toBe(false)

    // 2. Cambiar a Recepción, editar el trabajo en el DOM y agregar un renglón extra en blanco al presupuesto
    window.showStep('reception', false)
    const clienteInput = document.querySelector('#receptionForm [data-rec="cliente"]')
    clienteInput.value = 'Martín Gómez Editado'
    window.active.quote.push({ id: 'q-blank', description: '   ', qty: 1, price: 0 })
    window.showStep('budget', false)
    window.renderBudget()

    const downloadBtn = document.getElementById('downloadBudgetPdfBtn')
    const whatsappBtn = document.getElementById('shareWhatsappTextBtn')
    expect(downloadBtn.disabled).toBe(false)
    expect(whatsappBtn.disabled).toBe(false)

    // 3. Clic real en el botón DOM «Descargar / Imprimir»
    downloadBtn.click()
    await vi.waitFor(() => {
      const feedback = document.getElementById('budgetDeliveryFeedback')
      expect(feedback.hidden).toBe(false)
      expect(feedback.textContent).toContain('PDF generado y descargado')
    })
    expect(anchorClickSpy).toHaveBeenCalledTimes(1)
    expect(window.active.rec.cliente).toBe('Martín Gómez Editado')
    // El renglón en blanco extra se limpió automáticamente para no bloquear el presupuesto válido
    expect(window.active.quote).toHaveLength(1)

    // 4. Clic real en el botón DOM «Enviar por WhatsApp»
    whatsappBtn.click()
    await vi.waitFor(() => {
      const feedback = document.getElementById('budgetDeliveryFeedback')
      expect(feedback.hidden).toBe(false)
      expect(feedback.textContent).toContain('Se abrió WhatsApp con el presupuesto preparado. Confirmá el envío desde la aplicación.')
      expect(feedback.textContent).not.toMatch(/fue enviado exitosamente/i)
    })
    expect(openSpy).toHaveBeenCalledTimes(1)
    const openedWhatsappUrl = openSpy.mock.calls[0][0]
    expect(openedWhatsappUrl).toContain('https://wa.me/5491155551002?text=')
    expect(decodeURIComponent(openedWhatsappUrl)).toContain('Martín Gómez Editado')
    expect(decodeURIComponent(openedWhatsappUrl)).toContain('AE 456 FG')
    expect(document.getElementById('openWhatsappDirectLink')?.getAttribute('href')).toBe(openedWhatsappUrl)

    createUrlSpy.mockRestore()
    revokeUrlSpy.mockRestore()
    anchorClickSpy.mockRestore()
    openSpy.mockRestore()
  })

  it('7. INTEGRACIÓN DOM REAL: Si una validación bloquea la descarga o WhatsApp, muestra un error visible junto a los botones (#budgetDeliveryFeedback) y nunca falla en silencio', async () => {
    window.quoteValid = vi.fn(() => {
      const noticeEl = document.getElementById('notice')
      if (noticeEl) {
        noticeEl.className = 'notice error'
        noticeEl.textContent = 'Cada renglón del presupuesto necesita descripción y cantidad mayor a 0.'
        noticeEl.hidden = false
      }
      return false
    })
    window.active.quote = [{ id: 'q-empty', description: '', qty: 1, price: 0 }]

    const downloadBtn = document.getElementById('downloadBudgetPdfBtn')
    const whatsappBtn = document.getElementById('shareWhatsappTextBtn')

    downloadBtn.click()
    await vi.waitFor(() => {
      const feedback = document.getElementById('budgetDeliveryFeedback')
      expect(feedback.hidden).toBe(false)
      expect(feedback.className).toContain('error')
      expect(feedback.textContent).toContain('Cada renglón del presupuesto necesita descripción y cantidad mayor a 0.')
    })

    document.getElementById('budgetDeliveryFeedback').hidden = true
    whatsappBtn.click()
    expect(document.getElementById('budgetDeliveryFeedback').hidden).toBe(false)
    expect(document.getElementById('budgetDeliveryFeedback').textContent).toContain(
      'Cada renglón del presupuesto necesita descripción y cantidad mayor a 0.'
    )
  })
})

describe('ETAPA 2 — DEV-33: Navegación con «Volver», «Mi taller», Diseño Unificado y Configuración', () => {
  it('1. Renombra «Perfil y datos del taller» a «Mi taller» en menú de usuario, administración y pantalla de taller', async () => {
    renderHeaderNavigation()
    const userMenu = document.getElementById('userMenu')
    expect(userMenu.textContent).toContain('Mi taller')
    expect(userMenu.textContent).not.toContain('Perfil y datos del taller')

    await renderProfileScreen()
    const profileScreen = document.getElementById('profileScreen')
    expect(profileScreen.querySelector('h1')?.textContent).toBe('Mi taller')
    expect(profileScreen.querySelector('.personal-profile-top.unified-screen-top')).not.toBeNull()

    await renderAdminScreen()
    expect(document.getElementById('goToProfileFromAdminBtn')?.textContent).toBe('Mi taller')
  })

  it('2. Reemplaza «Volver a Trabajos» por «← Volver» y respeta la pantalla anterior en el historial', async () => {
    await enforceRouteProtection()
    await navigateAppRoute({ name: 'admin' })
    expect(location.hash).toBe('#/admin')
    expect(document.getElementById('backFromAdminBtn')?.textContent.trim()).toBe('← Volver')

    // Desde Administración abrimos Mi taller (#/perfil) y al tocar «← Volver» regresa a Administración (#/admin)
    await navigateAppRoute({ name: 'profile' })
    expect(location.hash).toBe('#/perfil')
    const backFromProfile = document.getElementById('backFromProfileBtn')
    expect(backFromProfile?.textContent.trim()).toBe('← Volver')
    expect(backFromProfile?.textContent).not.toContain('Volver a Trabajos')

    backFromProfile.click()
    await vi.waitFor(() => expect(location.hash).toBe('#/admin'))
    expect(document.getElementById('adminScreen').hidden).toBe(false)
  })

  it('3. Hace funcionar la sección Configuración (#/configuracion), mueve «Cambiar contraseña» dentro de ella y guarda parámetros extensibles', async () => {
    renderHeaderNavigation()
    const userMenuButtons = Array.from(document.querySelectorAll('#userMenu > button')).map(b => b.textContent.trim())
    expect(userMenuButtons).toContain('Configuración')
    expect(userMenuButtons).not.toContain('Cambiar contraseña')

    await openSettingsScreen()
    await vi.waitFor(() => expect(location.hash).toBe('#/configuracion'))
    const settingsScreen = document.getElementById('settingsScreen')
    expect(settingsScreen.hidden).toBe(false)
    expect(settingsScreen.querySelector('h1')?.textContent).toBe('Configuración')
    expect(settingsScreen.querySelector('#settingsPasswordForm')).not.toBeNull()
    expect(settingsScreen.querySelector('#navChangePassBtn')).toBeNull()
    expect(settingsScreen.textContent).not.toContain('Cambiar contraseña en vista dedicada')

    // Cambiar contraseña directamente desde Configuración
    document.getElementById('settingsNewPassword').value = 'NuevaClaveTaller2026!'
    document.getElementById('settingsConfirmPassword').value = 'NuevaClaveTaller2026!'
    document.getElementById('settingsPasswordForm').dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => {
      expect(backend.auth.updateUser).toHaveBeenCalledWith({ password: 'NuevaClaveTaller2026!' })
      expect(document.getElementById('settingsAlertBox').textContent).toContain('Contraseña actualizada con éxito')
    })

    // Guardar parámetros del taller y verificar que están preparados para nuevos parámetros futuros
    document.getElementById('setting_defaultValidDays').value = '30'
    document.getElementById('setting_defaultTaxPct').value = '21'
    document.getElementById('setting_defaultTerms').value = 'Garantía escrita de 6 meses.'
    document.getElementById('workshopSettingsForm').dispatchEvent(new Event('submit', { cancelable: true }))

    expect(document.getElementById('settingsAlertBox').textContent).toContain('guardados correctamente')
    const saved = getWorkshopSettings('w1')
    expect(saved.defaultValidDays).toBe(30)
    expect(saved.defaultTaxPct).toBe(21)
    expect(saved.defaultTerms).toBe('Garantía escrita de 6 meses.')

    // Registrar un parámetro futuro dinámicamente
    const reg = registerSettingParameter('budget_defaults', {
      key: 'defaultDiscountPct',
      label: 'Descuento comercial por defecto (%)',
      type: 'number',
      min: 0,
      max: 50,
      defaultValue: 5
    })
    expect(reg.registered).toBe(true)
    expect(getSettingsSchema().find(g => g.id === 'budget_defaults').parameters.some(p => p.key === 'defaultDiscountPct')).toBe(true)
    expect(validateWorkshopSettings({ defaultDiscountPct: 10 }).values.defaultDiscountPct).toBe(10)
    expect(saveWorkshopSettings('w1', { ...saved, defaultDiscountPct: 10 }).valid).toBe(true)
  })
})

describe('ETAPA 3 — DEV-34: Contador «Productos activos», Sincronización, Caché y Privacidad de Precios', () => {
  it('1. Calcula exactamente los productos activos del taller excluyendo archivados, duplicados y otros talleres', () => {
    const mixed = [
      ...stockRowsByWorkshop.w1,
      stockRowsByWorkshop.w1[0], // duplicado
      ...stockRowsByWorkshop.w2 // otro taller
    ]
    expect(getActiveStockItems(mixed, 'w1')).toHaveLength(2)
    expect(countActiveStockItems(mixed, 'w1')).toBe(2)
    expect(countActiveStockItems(mixed, 'w2')).toBe(1)
  })

  it('2. Actualiza «Productos activos» en altas, archivados, restauraciones y cambios de taller sin mostrar precios de venta ni valorizaciones', async () => {
    await renderStockScreen()
    const stockScreen = document.getElementById('stockScreen')
    expect(document.getElementById('activeProductsCount')?.textContent).toBe('2')
    expect(stockScreen.textContent).not.toMatch(/precio.*venta|valorizad|cotización|valor total/i)

    // Alta de nuevo producto activo -> contador sube de 2 a 3
    document.getElementById('stName').value = 'Masilla Poliéster Ultra'
    document.getElementById('stPurchasePrice').value = '9500'
    document.getElementById('stInitialQty').value = '5'
    document.getElementById('stockItemForm').dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(document.getElementById('activeProductsCount')?.textContent).toBe('3'))

    // Archivar un producto activo -> contador baja de 3 a 2
    const archiveBtn = document.querySelector('[data-archive-item="st-1"]')
    archiveBtn.click()
    await vi.waitFor(() => expect(document.getElementById('activeProductsCount')?.textContent).toBe('2'))

    // Mostrar archivados y restaurar -> contador vuelve de 2 a 3
    appAuthState.stockFilters.status = 'archived'
    await renderStockScreen()
    const restoreBtn = document.querySelector('[data-archive-item="st-1"]')
    restoreBtn.click()
    await vi.waitFor(() => expect(document.getElementById('activeProductsCount')?.textContent).toBe('3'))

    // Cambiar de taller (w1 -> w2) actualiza caché y refleja exactamente 1 producto activo en w2
    appAuthState.activeWorkshopId = 'w2'
    appAuthState.memberships[0].workshop_id = 'w1'
    privateReadCache.activate({ userId: 'u1', workshopId: 'w2' })
    await renderStockScreen({ force: true })
    expect(document.getElementById('activeProductsCount')?.textContent).toBe('1')
    expect(stockScreen.textContent).not.toMatch(/precio.*venta|valorizad|cotización|valor total/i)
  })

  it('3. Actualiza «Productos activos» incluso si la consulta secundaria de movimientos falla', async () => {
    movementsByWorkshop.__fail = true
    const items = await fetchWorkshopStock('w1', { force: true })
    expect(items).toHaveLength(3)
    await renderStockScreen({ force: true })
    expect(document.getElementById('activeProductsCount')?.textContent).toBe('2')
  })
})

describe('AJUSTES PRE-PUBLICACIÓN — Selector de Taller en «Mi taller» y Precio de Compra Entero (ARS)', () => {
  it('AJUSTE 1.1: Quita el selector de taller del menú desplegable del usuario y deja el orden exacto requerido', () => {
    renderHeaderNavigation()
    const userMenu = document.getElementById('userMenu')
    expect(userMenu).not.toBeNull()
    expect(userMenu.querySelector('#activeWorkshopSelect')).toBeNull()
    expect(userMenu.querySelector('.workshop-switcher')).toBeNull()

    // Verificar estructura y orden: Mi perfil -> Mi taller -> Configuración -> Estado de conexión -> Cerrar sesión
    const menuElements = Array.from(userMenu.children).filter(el => !el.classList.contains('profile-identity'))
    expect(menuElements.map(el => el.id)).toEqual([
      'navMyProfileBtn',
      'navProfileBtn',
      'navSettingsBtn',
      'connectivityBadge',
      'navLogoutBtn'
    ])
    expect(menuElements[0].textContent.trim()).toBe('Mi perfil')
    expect(menuElements[1].textContent.trim()).toBe('Mi taller')
    expect(menuElements[2].textContent.trim()).toBe('Configuración')
    expect(menuElements[4].textContent.trim()).toBe('Cerrar sesión')
  })

  it('AJUSTE 1.2: Muestra «Taller o sucursal activa» dentro de «Mi taller» y al cambiar de taller actualiza trabajos, stock, perfil y permisos conservando borradores y navegación (PC y móvil)', async () => {
    // Configuramos w1 como owner y w2 como staff (para comprobar aislamiento de permisos)
    appAuthState.memberships = [
      { workshop_id: 'w1', role: 'owner', workshop: { ...SAMPLE_SHOP } },
      {
        workshop_id: 'w2',
        role: 'staff',
        workshop: {
          id: 'w2',
          name: 'Taller Sucursal Norte',
          legal_name: 'Norte Chapa S.R.L.',
          tax_id: '30-79999999-1',
          phone: '011 4999-0000'
        }
      }
    ]
    window.store.jobs = [
      {
        ...JSON.parse(JSON.stringify(SAMPLE_JOB)),
        id: 'draft-w1',
        rec: { ...SAMPLE_JOB.rec, cliente: 'Borrador Taller Central', patente: 'AA 111 BB' }
      }
    ]
    window.active = window.store.jobs[0]

    // Comprobar navegación móvil (menú hamburguesa) y escritorio
    renderHeaderNavigation()
    const mobileToggle = document.getElementById('mobileNavToggle')
    mobileToggle.click()
    expect(document.getElementById('primaryNavigation').classList.contains('is-open')).toBe(true)
    expect(document.getElementById('navAdminBtn')).not.toBeNull() // En w1 es owner -> tiene Administración

    // Abrir «Mi taller» (#/perfil)
    await navigateAppRoute({ name: 'profile' })
    expect(location.hash).toBe('#/perfil')

    const profileScreen = document.getElementById('profileScreen')
    expect(profileScreen.querySelector('#activeWorkshopSectionTitle')?.textContent).toBe('Taller o sucursal activa')
    expect(profileScreen.querySelector('#activeWorkshopNameBadge')?.textContent).toBe('Crash Solution Central')
    expect(profileScreen.querySelector('#activeWorkshopRoleBadge')?.textContent).toBe('Propietario')
    expect(document.getElementById('profName')?.disabled).toBe(false)

    const selector = profileScreen.querySelector('#activeWorkshopSelect')
    expect(selector).not.toBeNull()
    expect(Array.from(selector.options).map(o => o.value)).toEqual(['w1', 'w2'])
    expect(selector.value).toBe('w1')

    // Cambiar a taller w2 desde el selector en «Mi taller»
    selector.value = 'w2'
    selector.dispatchEvent(new Event('change', { bubbles: true }))

    await vi.waitFor(() => {
      expect(appAuthState.activeWorkshopId).toBe('w2')
      expect(document.getElementById('activeWorkshopNameBadge')?.textContent).toBe('Taller Sucursal Norte')
      expect(document.getElementById('activeWorkshopRoleBadge')?.textContent).toBe('Personal del taller')
    })

    // Verificar actualización de perfil, stock, trabajos y permisos para w2 (rol staff)
    expect(window.store.shop.name).toBe('Taller Sucursal Norte')
    expect(countActiveStockItems(appAuthState.stockItems, 'w2')).toBe(1)
    expect(document.getElementById('profName')?.disabled).toBe(true)
    expect(document.getElementById('navAdminBtn')).toBeNull() // En w2 es staff -> oculta Administración

    // Volver al taller w1 y comprobar que se conservaron los borradores de w1 y se restauraron permisos de Propietario
    const selectorW2 = document.getElementById('activeWorkshopSelect')
    selectorW2.value = 'w1'
    selectorW2.dispatchEvent(new Event('change', { bubbles: true }))

    await vi.waitFor(() => {
      expect(appAuthState.activeWorkshopId).toBe('w1')
      expect(document.getElementById('activeWorkshopNameBadge')?.textContent).toBe('Crash Solution Central')
      expect(document.getElementById('activeWorkshopRoleBadge')?.textContent).toBe('Propietario')
    })

    expect(document.getElementById('profName')?.disabled).toBe(false)
    expect(document.getElementById('navAdminBtn')).not.toBeNull()
    expect(countActiveStockItems(appAuthState.stockItems, 'w1')).toBe(2)
    expect(window.store.jobs.some(j => j.id === 'draft-w1' && j.rec.cliente === 'Borrador Taller Central')).toBe(true)
  })

  it('AJUSTE 2.1: «Precio de compra (ARS)» usa step="1", incrementa/decrementa de a $1 con flechas y muestra formato argentino entero ($ 30.000) sin centavos', async () => {
    expect(formatPurchasePriceArs(30000)).toBe('$ 30.000')
    expect(formatPurchasePriceArs(18500)).toBe('$ 18.500')
    expect(formatPurchasePriceArs(0)).toBe('$ 0')

    await renderStockScreen()
    const priceInput = document.getElementById('stPurchasePrice')
    expect(priceInput).not.toBeNull()
    expect(priceInput.getAttribute('step')).toBe('1')
    expect(priceInput.getAttribute('min')).toBe('0')
    expect(priceInput.getAttribute('inputmode')).toBe('numeric')

    // Probar flechas ArrowUp y ArrowDown (incrementos y decrementos exactos de $1, sin bajar de $0)
    priceInput.value = '30000'
    priceInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
    expect(priceInput.value).toBe('30001')

    priceInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    expect(priceInput.value).toBe('30000')

    priceInput.value = '0'
    priceInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    expect(priceInput.value).toBe('0')

    // Verificar formato en tarjetas de stock ($ 18.500, $ 12.000) sin mostrar precio de venta ni valorización
    const gridText = document.getElementById('stockItemsGrid')?.textContent || ''
    expect(gridText).toContain('$ 18.500')
    expect(gridText).toContain('$ 12.000')
    expect(gridText).not.toContain('18.500,00')
    expect(gridText).not.toContain('35.000') // sale_price sigue oculto
  })

  it('AJUSTE 2.2: Rechaza precios de compra decimales o negativos al crear y editar sin redondear silenciosamente, y conserva precios existentes en Supabase', async () => {
    // 1. Validación unitaria directa
    expect(validateStockItemInput({ name: 'Laca', category: 'Pinturas', purchase_price: '0.05' })).toEqual({
      valid: false,
      error: 'El precio de compra debe ingresarse en pesos enteros, sin centavos ni decimales (por ejemplo: 30000).'
    })
    expect(validateStockItemInput({ name: 'Laca', category: 'Pinturas', purchase_price: '150,50' }).valid).toBe(false)
    expect(validateStockItemInput({ name: 'Laca', category: 'Pinturas', purchase_price: -1 }).valid).toBe(false)
    expect(validateStockItemInput({ name: 'Laca', category: 'Pinturas', purchase_price: '30000' })).toMatchObject({
      valid: true,
      values: { purchase_price: 30000 }
    })

    // 2. Creación en DOM: rechaza decimal mostrando mensaje claro sin borrar ni redondear el campo
    await renderStockScreen()
    document.getElementById('stName').value = 'Masilla Fina'
    document.getElementById('stPurchasePrice').value = '15000.50'
    document.getElementById('stockItemForm').dispatchEvent(new Event('submit', { cancelable: true }))

    const alertBox = document.getElementById('stockAlertBox')
    expect(alertBox.hidden).toBe(false)
    expect(alertBox.textContent).toContain('pesos enteros, sin centavos ni decimales')
    expect(document.getElementById('stPurchasePrice').value).toBe('15000.50') // No lo redondeó silenciosamente
    expect(stockRowsByWorkshop.w1).toHaveLength(3) // No se guardó

    // Rechaza negativo al crear
    document.getElementById('stPurchasePrice').value = '-200'
    document.getElementById('stockItemForm').dispatchEvent(new Event('submit', { cancelable: true }))
    expect(alertBox.textContent).toContain('no puede ser negativo')
    expect(stockRowsByWorkshop.w1).toHaveLength(3)

    // Permite guardar cuando se corrige a un entero válido
    document.getElementById('stPurchasePrice').value = '30000'
    document.getElementById('stockItemForm').dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(document.getElementById('stockAlertBox').textContent).toContain('dado de alta'))
    expect(document.getElementById('stockItemsGrid').textContent).toContain('$ 30.000')

    // 3. Edición de un producto existente en Supabase (con valor histórico decimal en base de datos)
    stockRowsByWorkshop.w1[0].purchase_price = 18500.75
    await renderStockScreen({ force: true })
    // El dato en Supabase no fue modificado ni redondeado automáticamente al listar
    expect(stockRowsByWorkshop.w1[0].purchase_price).toBe(18500.75)

    document.querySelector('[data-edit-item="st-1"]').click()
    await vi.waitFor(() => expect(document.getElementById('stName').value).toBe('Barniz Bicapa 2K'))
    expect(document.getElementById('stPurchasePrice').value).toBe('18500.75')

    // Si intenta guardar manteniendo un decimal al editar, muestra el mensaje claro para corregirlo
    document.getElementById('stockItemForm').dispatchEvent(new Event('submit', { cancelable: true }))
    expect(document.getElementById('stockAlertBox').textContent).toContain('pesos enteros, sin centavos ni decimales')
    expect(stockRowsByWorkshop.w1[0].purchase_price).toBe(18500.75)

    // Al corregirlo a un entero (ej. 19000), actualiza correctamente
    document.getElementById('stPurchasePrice').value = '19000'
    document.getElementById('stockItemForm').dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(document.getElementById('stockAlertBox').textContent).toContain('actualizados'))
    expect(stockRowsByWorkshop.w1[0].purchase_price).toBe(19000)
    expect(document.getElementById('stockItemsGrid').textContent).toContain('$ 19.000')
  })
})

describe('Sistema global centralizado de notificaciones y modales de error (#appErrorModal)', () => {
  afterEach(() => {
    closeErrorModal({ restoreFocus: false })
    vi.restoreAllMocks()
  })

  it('1. Campos obligatorios en Recepción y Presupuesto: abre modal centrado accesible, resalta el campo afectado, gestiona foco/Escape y conserva los datos sin disparar popups al tipear', async () => {
    const job = JSON.parse(JSON.stringify(SAMPLE_JOB))
    job.rec.cliente = ''
    job.rec.patente = 'AB 999 CD'
    window.store.jobs = [job]
    window.active = job

    window.quoteValid = () => {
      if (!window.active?.rec?.cliente?.trim() || !window.active?.rec?.patente?.trim()) {
        const missing = !window.active?.rec?.cliente?.trim() ? 'cliente' : 'patente'
        const targetEl = document.querySelector(`[data-rec="${missing}"]`)
        targetEl?.focus()
        window.showErrorModal?.({
          message: 'Completá el nombre del cliente y la patente para continuar.',
          section: 'reception'
        })
        return false
      }
      if (!window.active?.quote?.length || window.active.quote.some(q => !String(q.description || '').trim() || !(Number(q.qty) > 0))) {
        window.showErrorModal?.({
          message: 'Agregá al menos un trabajo y completá su descripción y cantidad.',
          section: 'budget'
        })
        return false
      }
      return true
    }

    wireEnhancedBudgetAndSettings()
    document.getElementById('workScreen').hidden = false
    document.getElementById('budgetStep').hidden = false
    const clienteInput = document.querySelector('[data-rec="cliente"]')
    const patenteInput = document.querySelector('[data-rec="patente"]')
    clienteInput.value = ''
    patenteInput.value = 'AB 999 CD'

    // Intentar descargar PDF sin nombre del cliente
    await window.downloadBudgetPdfAction()

    const modal = document.getElementById('appErrorModal')
    expect(modal).not.toBeNull()
    expect(modal.hidden).toBe(false)
    expect(isErrorModalOpen()).toBe(true)
    expect(modal.querySelector('#appErrorModalDialog').getAttribute('role')).toBe('alertdialog')
    expect(modal.querySelector('#appErrorModalDialog').getAttribute('aria-modal')).toBe('true')
    expect(modal.querySelector('#appErrorModalMessage').textContent).toContain('nombre del cliente')
    expect(modal.querySelector('#appErrorModalSolution').textContent).toContain('Paso 1 (Recepción)')

    // El foco pasa al botón «Entendido» y el campo afectado queda resaltado con indicación junto al campo
    const understoodBtn = document.getElementById('appErrorModalCloseBtn')
    expect(understoodBtn.textContent).toBe('Entendido')
    expect(document.activeElement).toBe(understoodBtn)
    expect(clienteInput.classList.contains('input-field-error')).toBe(true)
    expect(clienteInput.getAttribute('aria-invalid')).toBe('true')
    const fieldContainer = clienteInput.closest('label') || clienteInput.parentElement
    expect(fieldContainer.querySelector('[data-field-error-hint="true"]').textContent).toContain('nombre del cliente')

    // Al cerrar con Escape, se cierra el modal, se conserva la patente ingresada y el foco vuelve al campo afectado
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(modal.hidden).toBe(true)
    expect(patenteInput.value).toBe('AB 999 CD')
    expect(document.activeElement).toBe(clienteInput)

    // Tipear en el campo limpia la marca de error sin abrir ningún popup por pulsación de teclado
    clienteInput.value = 'Juan'
    clienteInput.dispatchEvent(new Event('input', { bubbles: true }))
    expect(clienteInput.classList.contains('input-field-error')).toBe(false)
    expect(fieldContainer.querySelector('[data-field-error-hint="true"]')).toBeNull()
    expect(isErrorModalOpen()).toBe(false)
  })

  it('2. Simulación de fallo en generación de PDF y en envío por WhatsApp: muestra modal claro sin afirmar que el archivo fue enviado', async () => {
    const job = JSON.parse(JSON.stringify(SAMPLE_JOB))
    window.store.jobs = [job]
    window.active = job
    window.quoteValid = () => true
    wireEnhancedBudgetAndSettings()

    const cli = document.querySelector('[data-rec="cliente"]')
    const pat = document.querySelector('[data-rec="patente"]')
    cli.value = job.rec.cliente
    pat.value = job.rec.patente

    // Simular fallo al crear URL del Blob de PDF
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('Fallo simulado al generar el archivo PDF en el navegador.')
    })

    const resPdf = await window.downloadBudgetPdfAction()
    expect(resPdf).toBeNull()
    expect(isErrorModalOpen()).toBe(true)
    expect(document.getElementById('appErrorModalSection').textContent).toBe('DESCARGA E IMPRESIÓN DE PDF')
    expect(document.getElementById('appErrorModalTitle').textContent).toContain('No se pudo generar o entregar el PDF')
    expect(document.getElementById('appErrorModalMessage').textContent).toContain('Fallo simulado al generar el archivo PDF')
    expect(document.getElementById('appErrorModalMessage').textContent).not.toMatch(/fue enviado|enviado con éxito/i)

    // Cerrar con botón «Entendido»
    document.getElementById('appErrorModalCloseBtn').click()
    expect(isErrorModalOpen()).toBe(false)
  })

  it('3. Errores de Stock, Autenticación, Permisos y Configuración usan un único modal sin superponer popups y se limpian al cambiar de sección sin bloquear la navegación', async () => {
    // 1. Error en Stock (precio decimal) abre modal y marca el campo #stPurchasePrice
    await renderStockScreen()
    document.getElementById('stName').value = 'Primer Poliuretano'
    document.getElementById('stPurchasePrice').value = '1200.50'
    document.getElementById('stockItemForm').dispatchEvent(new Event('submit', { cancelable: true }))

    expect(isErrorModalOpen()).toBe(true)
    expect(document.querySelectorAll('#appErrorModal').length).toBe(1)
    expect(document.getElementById('appErrorModalTitle').textContent).toContain('Precio de compra con decimales no permitido')
    expect(document.getElementById('stPurchasePrice').classList.contains('input-field-error')).toBe(true)
    expect(document.getElementById('stName').value).toBe('Primer Poliuretano') // Conserva los datos del formulario

    // 2. Disparar múltiples errores seguidos (ej. Auth y Permisos) nunca crea popups duplicados
    showErrorModal({ message: 'Credenciales inválidas al iniciar sesión.', section: 'auth' })
    showErrorModal({ message: 'Solo el Propietario o Administrador pueden modificar los permisos.', section: 'admin' })
    expect(document.querySelectorAll('#appErrorModal').length).toBe(1)
    expect(document.getElementById('appErrorModalSection').textContent).toBe('ADMINISTRACIÓN Y PERMISOS')
    expect(document.getElementById('appErrorModalMessage').textContent).toContain('Solo el Propietario o Administrador')

    // 3. Cambiar de sección cierra el modal automáticamente y no bloquea la navegación ni vuelve a mostrar errores viejos
    await navigateAppRoute({ name: 'settings' })
    expect(isErrorModalOpen()).toBe(false)
    expect(document.getElementById('settingsScreen').hidden).toBe(false)

    // 4. Avisos de sincronización/conflictos offline (#syncNotice) permanecen separados del modal de error
    appAuthState.pendingSyncCount = 2
    renderConflictResolutionNotice()
    const syncNotice = document.getElementById('syncNotice')
    expect(syncNotice).not.toBeNull()
    expect(syncNotice.hidden).toBe(false)
    expect(isErrorModalOpen()).toBe(false)
  })
})

// ============================================================================
// DEV-35 — Presupuesto por Pieza e Intervención (Días de Chapa y Paños de Pintura)
// ============================================================================
describe('DEV-35 — Presupuesto generado desde la Inspección por Pieza e Intervención', () => {
  it('1. Genera únicamente las intervenciones seleccionadas por pieza sin cantidades ni tarifas predeterminadas ficticias (Puerta con Chapa+Pintura, Capot solo Pintura, Guardabarros solo Chapa, Reparar y Reemplazar)', () => {
    const job = {
      id: 'job-dev35-1',
      rec: { cliente: 'Roberto Gómez', patente: 'AF 901 BC', marca: 'Toyota', modelo: 'Corolla', anio: '2022' },
      inspection: {
        'Lado derecho|||Puerta delantera derecha': {
          status: 'danado',
          works: ['Chapa', 'Pintura'],
          note: 'Abolladura y rayón profundo',
          photos: []
        },
        'Parte delantera|||Capot': {
          status: 'danado',
          works: ['Pintura'],
          note: 'Detalles de laca',
          photos: []
        },
        'Parte delantera|||Guardabarros delantero izquierdo': {
          status: 'danado',
          works: ['Chapa'],
          note: 'Golpe leve',
          photos: []
        },
        'Lado derecho|||Espejo retrovisor derecho': {
          status: 'danado',
          works: ['Reponer'],
          note: '',
          photos: []
        },
        'Parte trasera|||Paragolpes trasero': {
          status: 'danado',
          works: ['Reacondicionar'],
          note: '',
          photos: []
        }
      },
      pieceQuotes: {},
      quote: [],
      discount: 0,
      tax: 0
    }

    const res = syncBudgetFromInspection(job)
    expect(res.added).toBe(6)
    expect(job.quote).toHaveLength(6)

    // Ninguna línea tiene cantidades ni precios predeterminados ficticios (todos inician en 0)
    for (const line of job.quote) {
      expect(line.qty).toBe(0)
      expect(line.price).toBe(0)
    }

    // Puerta delantera derecha tiene exactamente 2 intervenciones: Chapa (días) y Pintura (paños)
    const puertaLines = job.quote.filter(q => q.pieceName === 'Puerta delantera derecha')
    expect(puertaLines).toHaveLength(2)
    expect(describeQuoteLine(puertaLines[0])).toMatchObject({
      pieceName: 'Puerta delantera derecha',
      workType: 'Chapa',
      workLabel: 'Chapa',
      unit: 'días',
      qtyLabel: 'Días de chapa',
      priceLabel: 'Precio por día',
      qty: 0,
      price: 0
    })
    expect(describeQuoteLine(puertaLines[1])).toMatchObject({
      pieceName: 'Puerta delantera derecha',
      workType: 'Pintura',
      workLabel: 'Pintura',
      unit: 'paños',
      qtyLabel: 'Paños de pintura',
      priceLabel: 'Precio por paño',
      qty: 0,
      price: 0
    })

    // Capot tiene únicamente Pintura
    const capotLines = job.quote.filter(q => q.pieceName === 'Capot')
    expect(capotLines).toHaveLength(1)
    expect(describeQuoteLine(capotLines[0])).toMatchObject({
      pieceName: 'Capot',
      workType: 'Pintura',
      unit: 'paños',
      qtyLabel: 'Paños de pintura',
      priceLabel: 'Precio por paño'
    })

    // Guardabarros delantero izquierdo tiene únicamente Chapa
    const guardabarrosLines = job.quote.filter(q => q.pieceName === 'Guardabarros delantero izquierdo')
    expect(guardabarrosLines).toHaveLength(1)
    expect(describeQuoteLine(guardabarrosLines[0])).toMatchObject({
      pieceName: 'Guardabarros delantero izquierdo',
      workType: 'Chapa',
      unit: 'días',
      qtyLabel: 'Días de chapa',
      priceLabel: 'Precio por día'
    })

    // Espejo retrovisor derecho tiene únicamente Reemplazar
    const espejoLines = job.quote.filter(q => q.pieceName === 'Espejo retrovisor derecho')
    expect(espejoLines).toHaveLength(1)
    expect(describeQuoteLine(espejoLines[0])).toMatchObject({
      pieceName: 'Espejo retrovisor derecho',
      workType: 'Reemplazar',
      workLabel: 'Reemplazar',
      unit: 'un.'
    })

    // Paragolpes trasero tiene únicamente Reacondicionar (Reparar)
    const paragolpesLines = job.quote.filter(q => q.pieceName === 'Paragolpes trasero')
    expect(paragolpesLines).toHaveLength(1)
    expect(describeQuoteLine(paragolpesLines[0])).toMatchObject({
      pieceName: 'Paragolpes trasero',
      workType: 'Reparar',
      workLabel: 'Reacondicionar',
      unit: 'un.'
    })
  })

  it('2. Calcula días × tarifa por día para Chapa, paños × tarifa por paño para Pintura, subtotales por pieza, totales generales separados, repuestos, impuestos y descuentos', () => {
    const job = {
      id: 'job-dev35-calc',
      rec: { cliente: 'Lucía Fernández', patente: 'AE 777 ZZ', marca: 'Peugeot', modelo: '208', anio: '2023' },
      inspection: {
        'Lado derecho|||Puerta delantera derecha': {
          status: 'danado',
          works: ['Chapa', 'Pintura']
        },
        'Parte delantera|||Capot': {
          status: 'danado',
          works: ['Pintura']
        },
        'Parte delantera|||Guardabarros delantero izquierdo': {
          status: 'danado',
          works: ['Chapa']
        },
        'Lado derecho|||Espejo retrovisor derecho': {
          status: 'danado',
          works: ['Reponer']
        }
      },
      pieceQuotes: {},
      quote: [
        { id: 'manual-1', source: null, description: 'Insumos y clips de fijación', qty: 1, price: 25000 }
      ],
      discount: 10,
      tax: 21
    }

    syncBudgetFromInspection(job)

    // Cargar valores específicos por pieza e intervención
    const puertaChapa = job.quote.find(q => q.pieceName === 'Puerta delantera derecha' && q.workType === 'Chapa')
    const puertaPintura = job.quote.find(q => q.pieceName === 'Puerta delantera derecha' && q.workType === 'Pintura')
    const capotPintura = job.quote.find(q => q.pieceName === 'Capot' && q.workType === 'Pintura')
    const guardabarrosChapa = job.quote.find(
      q => q.pieceName === 'Guardabarros delantero izquierdo' && q.workType === 'Chapa'
    )
    const espejoReemplazo = job.quote.find(q => q.pieceName === 'Espejo retrovisor derecho' && q.workType === 'Reemplazar')

    // Puerta delantera derecha: 2 días × $45.000 ($90.000) + 1.5 paños × $80.000 ($120.000) = $210.000
    puertaChapa.qty = 2
    puertaChapa.price = 45000
    puertaPintura.qty = 1.5
    puertaPintura.price = 80000

    // Capot: 2 paños × $85.000 = $170.000
    capotPintura.qty = 2
    capotPintura.price = 85000

    // Guardabarros: 1.5 días × $40.000 = $60.000
    guardabarrosChapa.qty = 1.5
    guardabarrosChapa.price = 40000

    // Espejo: 1 un. × $35.000 = $35.000
    espejoReemplazo.qty = 1
    espejoReemplazo.price = 35000

    const t = computeDetailedBudgetTotals(job)

    // Subtotales por pieza
    expect(t.pieceSubtotals['Lado derecho|||Puerta delantera derecha'].subtotal).toBe(210000)
    expect(t.pieceSubtotals['Lado derecho|||Puerta delantera derecha'].chapaSubtotal).toBe(90000)
    expect(t.pieceSubtotals['Lado derecho|||Puerta delantera derecha'].pinturaSubtotal).toBe(120000)
    expect(t.pieceSubtotals['Parte delantera|||Capot'].subtotal).toBe(170000)
    expect(t.pieceSubtotals['Parte delantera|||Guardabarros delantero izquierdo'].subtotal).toBe(60000)
    expect(t.pieceSubtotals['Lado derecho|||Espejo retrovisor derecho'].subtotal).toBe(35000)

    // Totales generales separados de Chapa y Pintura
    expect(t.chapaDays).toBe(3.5)
    expect(t.chapaSubtotal).toBe(150000) // 90.000 + 60.000
    expect(t.pinturaPanels).toBe(3.5)
    expect(t.pinturaSubtotal).toBe(290000) // 120.000 + 170.000
    expect(t.otherSubtotal).toBe(60000) // 35.000 espejo + 25.000 insumos

    // Subtotal general, descuento (10%), neto e impuesto (21%)
    expect(t.subtotal).toBe(500000)
    expect(t.discount).toBe(50000)
    expect(t.net).toBe(450000)
    expect(t.tax).toBe(94500)
    expect(t.total).toBe(544500)
  })

  it('3. Conserva cantidades y tarifas al volver a la inspección y regresar al presupuesto, evita duplicar conceptos y mantiene compatibilidad con trabajos históricos, IndexedDB offline y Supabase', async () => {
    const job = {
      id: 'job-dev35-persist',
      number: 'OT-DEV3501',
      rec: { cliente: 'Martín Silva', patente: 'AD 444 KL', marca: 'Ford', modelo: 'Focus', anio: '2020' },
      inspection: {
        'Lado derecho|||Puerta delantera derecha': {
          status: 'danado',
          works: ['Chapa', 'Pintura']
        },
        // Pieza con línea histórica combinada ya cotizada
        'Parte trasera|||Portón trasero': {
          status: 'danado',
          works: ['Chapa', 'Pintura']
        }
      },
      pieceQuotes: {},
      quote: [
        // Línea histórica combinada ya valorizada (no debe duplicarse)
        {
          id: 'hist-1',
          source: 'Parte trasera|||Portón trasero',
          description: 'Portón trasero · Chapa y pintura',
          qty: 1,
          price: 185000
        }
      ],
      discount: 0,
      tax: 0,
      document: { date: '2026-11-12', validDays: 15, terms: 'Entrega en 4 días' }
    }

    // 1. Primera entrada al presupuesto
    syncBudgetFromInspection(job)
    expect(job.quote).toHaveLength(3) // 2 de Puerta delantera derecha + 1 histórica protegida de Portón trasero

    const puertaChapa = job.quote.find(q => q.pieceName === 'Puerta delantera derecha' && q.workType === 'Chapa')
    const puertaPintura = job.quote.find(q => q.pieceName === 'Puerta delantera derecha' && q.workType === 'Pintura')
    puertaChapa.qty = 3
    puertaChapa.price = 42000
    puertaPintura.qty = 2
    puertaPintura.price = 78000

    // 2. El usuario vuelve a la inspección, agrega una pieza nueva (Capot solo Pintura) y regresa al presupuesto
    job.inspection['Parte delantera|||Capot'] = {
      status: 'danado',
      works: ['Pintura']
    }
    syncBudgetFromInspection(job)

    // No se duplicó ningún concepto y se conservaron las cantidades y tarifas de Puerta delantera derecha
    expect(job.quote).toHaveLength(4)
    const puertaChapaAfter = job.quote.find(q => q.pieceName === 'Puerta delantera derecha' && q.workType === 'Chapa')
    const puertaPinturaAfter = job.quote.find(q => q.pieceName === 'Puerta delantera derecha' && q.workType === 'Pintura')
    expect(puertaChapaAfter.qty).toBe(3)
    expect(puertaChapaAfter.price).toBe(42000)
    expect(puertaPinturaAfter.qty).toBe(2)
    expect(puertaPinturaAfter.price).toBe(78000)

    // 3. Si el usuario desmarca temporalmente Pintura en la inspección y luego la vuelve a marcar, recupera sus paños y tarifa desde pieceQuotes
    job.inspection['Lado derecho|||Puerta delantera derecha'].works = ['Chapa']
    syncBudgetFromInspection(job)
    expect(job.quote.filter(q => q.pieceName === 'Puerta delantera derecha')).toHaveLength(1)

    job.inspection['Lado derecho|||Puerta delantera derecha'].works = ['Chapa', 'Pintura']
    syncBudgetFromInspection(job)
    const restoredPintura = job.quote.find(q => q.pieceName === 'Puerta delantera derecha' && q.workType === 'Pintura')
    expect(restoredPintura.qty).toBe(2)
    expect(restoredPintura.price).toBe(78000)

    // 4. Persistencia en IndexedDB offline y recuperación íntegra
    setOfflineSessionOwner('u1')
    await saveOfflineJob({
      userId: 'u1',
      workshopId: 'w1',
      job,
      syncStatus: 'pending'
    })
    const offlineJobs = await getOfflineJobsForScope('u1', 'w1')
    const savedJob = offlineJobs.find(j => j.id === 'job-dev35-persist')
    expect(savedJob).toBeTruthy()
    expect(savedJob.pieceQuotes['Lado derecho|||Puerta delantera derecha::Chapa']).toMatchObject({
      qty: 3,
      price: 42000,
      unit: 'días',
      workType: 'Chapa'
    })
    expect(savedJob.pieceQuotes['Lado derecho|||Puerta delantera derecha::Pintura']).toMatchObject({
      qty: 2,
      price: 78000,
      unit: 'paños',
      workType: 'Pintura'
    })
  })

  it('4. PDF y WhatsApp muestran pieza, intervención, cantidad, unidad (días o paños), precio unitario, subtotal y resumen separado de Chapa y Pintura', async () => {
    const job = {
      id: 'job-dev35-delivery',
      number: 'OT-00350',
      rec: {
        cliente: 'Carlos Méndez',
        telefono: '11 5555 8899',
        patente: 'AG 123 XY',
        marca: 'Volkswagen',
        modelo: 'Amarok',
        anio: '2023'
      },
      inspection: {
        'Lado derecho|||Puerta delantera derecha': {
          status: 'danado',
          works: ['Chapa', 'Pintura']
        },
        'Parte delantera|||Capot': {
          status: 'danado',
          works: ['Pintura']
        }
      },
      pieceQuotes: {},
      quote: [],
      discount: 0,
      tax: 0,
      document: { date: '2026-11-12', validDays: 15, terms: 'Validez 15 días.' }
    }

    syncBudgetFromInspection(job)
    job.quote[0].qty = 2.5
    job.quote[0].price = 44000 // Chapa: 2.5 días × $44.000 = $110.000
    job.quote[1].qty = 1.5
    job.quote[1].price = 80000 // Pintura puerta: 1.5 paños × $80.000 = $120.000
    job.quote[2].qty = 2
    job.quote[2].price = 85000 // Pintura capot: 2 paños × $85.000 = $170.000

    const shop = { name: 'Crash Solution Taller Central', phone: '11 4444 5555', address: 'Av. Mitre 1234' }

    // Verificar mensaje de WhatsApp
    const waText = buildBudgetWhatsappMessage(job, shop)
    expect(waText).toContain('Puerta delantera derecha · Chapa (2,5 días x $ 44.000,00): $ 110.000,00')
    expect(waText).toContain('Puerta delantera derecha · Pintura (1,5 paños x $ 80.000,00): $ 120.000,00')
    expect(waText).toContain('Capot · Pintura (2 paños x $ 85.000,00): $ 170.000,00')
    expect(waText).toContain('Resumen Chapa (2,5 días): $ 110.000,00')
    expect(waText).toContain('Resumen Pintura (3,5 paños): $ 290.000,00')
    expect(waText).toContain('*TOTAL PRESUPUESTADO: $ 400.000,00*')

    // Verificar generación real de bytes PDF con desglose de días, paños y resúmenes
    const pdfBytes = await generateBudgetPdfBytes(job, shop)
    const check = verifyPdfBytesIntegrity(pdfBytes)
    expect(check.valid).toBe(true)

    // Verificar vista de impresión A4 en el DOM
    window.active = job
    window.print = vi.fn()
    window.printBudget()
    const printHtml = document.getElementById('printDocument').innerHTML
    expect(printHtml).toContain('Puerta delantera derecha · Chapa')
    expect(printHtml).toContain('2,5 días')
    expect(printHtml).toContain('Puerta delantera derecha · Pintura')
    expect(printHtml).toContain('1,5 paños')
    expect(printHtml).toContain('Capot · Pintura')
    expect(printHtml).toContain('2 paños')
    expect(printHtml).toContain('Resumen Chapa (2,5 días)')
    expect(printHtml).toContain('Resumen Pintura (3,5 paños)')
  })

  it('5. INTEGRACIÓN DOM REAL: En el paso Presupuesto agrupa las piezas con sus campos de Días de chapa / Paños de pintura, actualiza subtotales por pieza y totales separados en vivo, y conserva todo al ir y volver de la Revisión', () => {
    const html = readFileSync(resolve('Crash_Solution_Publicacion/index.html'), 'utf8')
    const dom = new JSDOM(html, {
      url: 'http://localhost:5173/',
      runScripts: 'dangerously',
      beforeParse(win) {
        win.scrollTo = () => {}
      }
    })
    const win = dom.window
    const doc = win.document

    try {
      win.newJob({
        cliente: 'Valeria Sosa',
        patente: 'AF 321 ZW',
        marca: 'Honda',
        modelo: 'Civic',
        anio: '2021'
      })

      // En la revisión (Paso 2) NO se solicitan días ni paños
      win.showStep('inspection')
      expect(doc.getElementById('pieceList').textContent).not.toContain('Días de chapa')
      expect(doc.getElementById('pieceList').textContent).not.toContain('Paños de pintura')

      // Marcar intervenciones en distintas piezas
      win.active.inspection['Lado derecho|||Puerta delantera derecha'] = {
        status: 'danado',
        works: ['Chapa', 'Pintura'],
        note: '',
        photos: []
      }
      win.active.inspection['Parte delantera|||Capot'] = {
        status: 'danado',
        works: ['Pintura'],
        note: '',
        photos: []
      }
      win.active.inspection['Parte delantera|||Guardabarros delantero izquierdo'] = {
        status: 'danado',
        works: ['Chapa'],
        note: '',
        photos: []
      }

      // Pasar al Paso 3 (Presupuesto)
      win.showStep('budget')

      const quoteLinesEl = doc.getElementById('quoteLines')
      const pieceGroups = quoteLinesEl.querySelectorAll('.piece-quote-group')
      expect(pieceGroups).toHaveLength(3)

      // Verificar que Puerta delantera derecha muestra Días de chapa, Precio por día, Paños de pintura, Precio por paño
      const puertaGroup = quoteLinesEl.querySelector('[data-piece-group="Lado derecho|||Puerta delantera derecha"]')
      expect(puertaGroup.textContent).toContain('Puerta delantera derecha')
      expect(puertaGroup.textContent).toContain('Días de chapa')
      expect(puertaGroup.textContent).toContain('Precio por día')
      expect(puertaGroup.textContent).toContain('Paños de pintura')
      expect(puertaGroup.textContent).toContain('Precio por paño')

      // Verificar que Capot muestra únicamente los campos de Pintura (sin Chapa)
      const capotGroup = quoteLinesEl.querySelector('[data-piece-group="Parte delantera|||Capot"]')
      expect(capotGroup.textContent).toContain('Capot')
      expect(capotGroup.textContent).toContain('Paños de pintura')
      expect(capotGroup.textContent).toContain('Precio por paño')
      expect(capotGroup.textContent).not.toContain('Días de chapa')

      // Verificar que Guardabarros muestra únicamente los campos de Chapa (sin Pintura)
      const guardabarrosGroup = quoteLinesEl.querySelector(
        '[data-piece-group="Parte delantera|||Guardabarros delantero izquierdo"]'
      )
      expect(guardabarrosGroup.textContent).toContain('Guardabarros delantero izquierdo')
      expect(guardabarrosGroup.textContent).toContain('Días de chapa')
      expect(guardabarrosGroup.textContent).toContain('Precio por día')
      expect(guardabarrosGroup.textContent).not.toContain('Paños de pintura')

      // Todos los inputs de cantidad y precio arrancan vacíos (sin valores predeterminados ficticios)
      const qtyInputs = quoteLinesEl.querySelectorAll('input[data-field="qty"]')
      const priceInputs = quoteLinesEl.querySelectorAll('input[data-field="price"]')
      qtyInputs.forEach(inp => expect(inp.value).toBe(''))
      priceInputs.forEach(inp => expect(inp.value).toBe(''))

      // Completar los campos en el DOM real:
      // Línea 0: Puerta Chapa -> 2 días × $45.000 = $90.000
      // Línea 1: Puerta Pintura -> 1.5 paños × $80.000 = $120.000 (Subtotal Puerta = $210.000)
      // Línea 2: Capot Pintura -> 2 paños × $85.000 = $170.000
      // Línea 3: Guardabarros Chapa -> 1 día × $40.000 = $40.000
      const fillLine = (idx, qty, price) => {
        const qEl = quoteLinesEl.querySelector(`input[data-line="${idx}"][data-field="qty"]`)
        const pEl = quoteLinesEl.querySelector(`input[data-line="${idx}"][data-field="price"]`)
        qEl.value = String(qty)
        qEl.dispatchEvent(new win.Event('input', { bubbles: true }))
        pEl.value = String(price)
        pEl.dispatchEvent(new win.Event('input', { bubbles: true }))
      }

      fillLine(0, 2, 45000)
      fillLine(1, 1.5, 80000)
      fillLine(2, 2, 85000)
      fillLine(3, 1, 40000)

      // Subtotal de Puerta delantera derecha = $210.000
      const puertaSubtotalEl = quoteLinesEl.querySelector(
        '[data-piece-subtotal="Lado derecho|||Puerta delantera derecha"]'
      )
      expect(puertaSubtotalEl.textContent).toContain('210.000')

      // Totales generales separados en el panel de totales
      expect(doc.getElementById('chapaTotalRow').hidden).toBe(false)
      expect(doc.getElementById('chapaTotalLabel').textContent).toBe('Total Chapa (3 días)')
      expect(doc.getElementById('chapaTotalAmount').textContent).toContain('130.000')

      expect(doc.getElementById('pinturaTotalRow').hidden).toBe(false)
      expect(doc.getElementById('pinturaTotalLabel').textContent).toBe('Total Pintura (3,5 paños)')
      expect(doc.getElementById('pinturaTotalAmount').textContent).toContain('290.000')

      expect(doc.getElementById('grandTotal').textContent).toContain('420.000')

      // Volver al Paso 2 (Inspección) y regresar al Paso 3 (Presupuesto): conserva los valores ingresados
      win.showStep('inspection')
      expect(win.step).toBe('inspection')
      win.showStep('budget')
      expect(win.step).toBe('budget')

      expect(quoteLinesEl.querySelector('input[data-line="0"][data-field="qty"]').value).toBe('2')
      expect(quoteLinesEl.querySelector('input[data-line="0"][data-field="price"]').value).toBe('45000')
      expect(quoteLinesEl.querySelector('input[data-line="1"][data-field="qty"]').value).toBe('1.5')
      expect(quoteLinesEl.querySelector('input[data-line="1"][data-field="price"]').value).toBe('80000')
      expect(doc.getElementById('grandTotal').textContent).toContain('420.000')
    } finally {
      win.close()
    }
  })
})

describe('ÚLTIMAS MODIFICACIONES — Dos modos de presupuesto, Bicapa/Tricapa, Observaciones y Firma del Taller', () => {
  it('1. Presupuestos históricos conservan automáticamente Modo B (detallado) sin alterar sus cálculos ni exigir selección previa', () => {
    const legacyJob = {
      id: 'hist-1',
      rec: { cliente: 'Martín Fernández', patente: 'AB 482 KD', marca: 'Volkswagen', modelo: 'Gol Trend' },
      quote: [
        { piece: 'Puerta delantera derecha', workType: 'Chapa', unit: 'día', qty: 2, price: 45000 },
        { piece: 'Puerta delantera derecha', workType: 'Pintura', unit: 'paño', qty: 1.5, price: 80000 }
      ],
      discountPct: 10,
      taxPct: 21
    }

    expect(resolveBudgetMode(legacyJob)).toBe('detailed')
    expect(resolvePaintType(legacyJob)).toBe('')
    const detTotals = computeBudgetTotalsByMode(legacyJob)
    expect(detTotals.mode).toBe('detailed')
    expect(detTotals.chapaSubtotal).toBe(90000)
    expect(detTotals.pinturaSubtotal).toBe(120000)
    expect(detTotals.subtotal).toBe(210000)
    expect(detTotals.discountAmount).toBe(21000)
    expect(detTotals.taxAmount).toBe(39690)
    expect(detTotals.grandTotal).toBe(228690)
  })

  it('2. Modo A (Totalizar al final) y Modo B (Detallado por ítem) calculan días, paños, repuestos, descuentos e impuestos de forma independiente sin perder datos ni inventar distribuciones por pieza', () => {
    const job = {
      id: 'dual-mode-job',
      budgetMode: 'summary',
      paintType: 'Bicapa',
      rec: { cliente: 'Carolina Gómez', patente: 'AE 731 LM', marca: 'Toyota', modelo: 'Corolla', seguro: 'Federación Patronal' },
      inspection: {
        'Lado derecho|||Puerta delantera derecha': { status: 'danado', works: ['Chapa', 'Pintura'], note: '', photos: [] },
        'Parte delantera|||Paragolpes delantero': { status: 'danado', works: ['Pintura'], note: '', photos: [] }
      },
      quote: [],
      pieceQuotes: {},
      summaryBudget: {
        chapaDays: 4,
        chapaDayRate: 50000,
        pinturaPanels: 3.5,
        pinturaPanelRate: 80000
      },
      discountPct: 5,
      taxPct: 21,
      document: {
        date: '2026-11-16',
        validDays: 15,
        paintType: 'Bicapa',
        terms: 'Incluye cabina presurizada y pulido final.',
        observations: 'Incluye cabina presurizada y pulido final.'
      }
    }

    syncBudgetFromInspection(job)
    // Agregamos además un repuesto/trabajo adicional manual
    job.quote.push({
      id: 'manual-optica',
      source: 'manual',
      pieceKey: null,
      piece: 'Óptica delantera derecha',
      workType: 'Repuesto',
      unit: 'unidad',
      qty: 1,
      price: 120000
    })

    // Verificar cálculos en Modo A (Resumido):
    // Chapa: 4 × 50.000 = 200.000
    // Pintura: 3.5 × 80.000 = 280.000
    // Repuesto manual: 1 × 120.000 = 120.000
    // Subtotal = 600.000 | Desc 5% = 30.000 | Base = 570.000 | IVA 21% = 119.700 | Total = 689.700
    const sumTotals = computeBudgetTotalsByMode(job, 'summary')
    expect(sumTotals.mode).toBe('summary')
    expect(sumTotals.chapaDays).toBe(4)
    expect(sumTotals.chapaSubtotal).toBe(200000)
    expect(sumTotals.pinturaPanels).toBe(3.5)
    expect(sumTotals.pinturaSubtotal).toBe(280000)
    expect(sumTotals.otherSubtotal).toBe(120000)
    expect(sumTotals.subtotal).toBe(600000)
    expect(sumTotals.discountAmount).toBe(30000)
    expect(sumTotals.taxAmount).toBe(119700)
    expect(sumTotals.grandTotal).toBe(689700)

    // Verificar que las líneas por pieza NO recibieron una distribución inventada
    const pieceLines = job.quote.filter(l => l.pieceKey)
    expect(pieceLines).toHaveLength(3)
    pieceLines.forEach(l => {
      expect(l.qty).toBe(0)
      expect(l.price).toBe(0)
    })

    // Cambiar a Modo B y cargar cantidades detalladas por pieza
    job.budgetMode = 'detailed'
    pieceLines[0].qty = 2.5
    pieceLines[0].price = 50000 // Puerta Chapa: 125.000
    pieceLines[1].qty = 2
    pieceLines[1].price = 80000 // Puerta Pintura: 160.000
    pieceLines[2].qty = 1.5
    pieceLines[2].price = 80000 // Paragolpes Pintura: 120.000

    const detTotals = computeBudgetTotalsByMode(job, 'detailed')
    expect(detTotals.mode).toBe('detailed')
    expect(detTotals.chapaDays).toBe(2.5)
    expect(detTotals.chapaSubtotal).toBe(125000)
    expect(detTotals.pinturaPanels).toBe(3.5)
    expect(detTotals.pinturaSubtotal).toBe(280000)
    expect(detTotals.otherSubtotal).toBe(120000)
    expect(detTotals.subtotal).toBe(525000)

    // Al tener totales distintos entre Modo A (600.000) y Modo B (525.000), checkBudgetModesConsistency lo detecta sin mezclar silenciosamente
    const consistencyDiff = checkBudgetModesConsistency(job)
    expect(consistencyDiff.hasBothModesData).toBe(true)
    expect(consistencyDiff.consistent).toBe(false)

    // Si en Modo B la chapa suma también 4 días (ej. 4 días × $50.000), ambos modos coinciden y permite emitir ambas presentaciones
    pieceLines[0].qty = 4
    const consistencyMatch = checkBudgetModesConsistency(job)
    expect(consistencyMatch.hasBothModesData).toBe(true)
    expect(consistencyMatch.consistent).toBe(true)

    // Volver a Modo A conserva intactos tanto summaryBudget como pieceLines
    job.budgetMode = 'summary'
    expect(job.summaryBudget.chapaDays).toBe(4)
    expect(job.summaryBudget.pinturaPanels).toBe(3.5)
    expect(pieceLines[0].qty).toBe(4)
    expect(pieceLines[1].qty).toBe(2)
  })

  it('3. PDF, Impresión A4 y WhatsApp se adaptan a Modo A y Modo B, muestran Bicapa/Tricapa, Observaciones y el bloque de Firma del Taller emisor', async () => {
    const job = {
      id: 'pdf-wa-modes',
      budgetMode: 'summary',
      paintType: 'Tricapa',
      rec: {
        cliente: 'Diego Rodríguez',
        telefono: '11 5555 0199',
        patente: 'AF 264 PR',
        marca: 'Peugeot',
        modelo: '208',
        anio: '2022',
        seguro: 'Sancor Seguros'
      },
      inspection: {
        'Parte trasera|||Portón trasero': { status: 'danado', works: ['Chapa', 'Pintura'], note: '', photos: [] }
      },
      quote: [
        {
          id: 'rep-1',
          source: null,
          pieceKey: null,
          description: 'Insignia trasera e insumos de sellado',
          workType: 'Repuesto',
          unit: 'global',
          qty: 1,
          price: 45000
        }
      ],
      summaryBudget: {
        chapaDays: 3,
        chapaDayPrice: 55000,
        pinturaPanels: 2.5,
        pinturaPanelPrice: 90000
      },
      discount: 0,
      tax: 21,
      document: {
        date: '2026-11-16',
        validDays: 15,
        paintType: 'Tricapa',
        terms: 'Sujeto a revisión tras desarme de paragolpes.',
        observations: 'Sujeto a revisión tras desarme de paragolpes.'
      }
    }

    const shop = {
      name: 'Crash Solution',
      legal_name: 'Crash Solution Demo SRL',
      tax_id: '20-26223569-7',
      phone: '011 4855-0100',
      address: 'Av. Warnes 1450, CABA'
    }

    // 1. WhatsApp en Modo A (Resumido)
    expect(formatArQuantity(2.5)).toBe('2,5')
    expect(formatArQuantity(3)).toBe('3')
    expect(formatArQuantity(1.25)).toBe('1,25')

    const waSummary = buildBudgetWhatsappMessage(job, shop)
    expect(waSummary).toContain('*Resumen de trabajos y repuestos:*')
    expect(waSummary).toContain('*Tipo de pintura:* Tricapa')
    expect(waSummary).toContain('Trabajo de chapa (Total días) (3 días x $ 55.000,00): $ 165.000,00')
    expect(waSummary).toContain('Trabajo de pintura (Total paños) (2,5 paños x $ 90.000,00): $ 225.000,00')
    expect(waSummary).toContain('Insignia trasera e insumos de sellado: $ 45.000,00')
    expect(waSummary).toContain('Sujeto a revisión tras desarme de paragolpes.')

    // 2. PDF en Modo A (Resumido)
    const pdfSummaryBytes = await generateBudgetPdfBytes(job, shop)
    const pdfCheckA = verifyPdfBytesIntegrity(pdfSummaryBytes)
    expect(pdfCheckA.valid).toBe(true)

    // 3. Vista de impresión A4 en Modo A con firma del taller
    window.store.shop = shop
    window.active = job
    document.getElementById('terms').value = 'Sujeto a revisión tras desarme de paragolpes.'
    window.print = vi.fn()
    window.printBudget()
    const printHtmlSummary = document.getElementById('printDocument').innerHTML
    expect(printHtmlSummary).toContain('Trabajo de chapa (Total días)')
    expect(printHtmlSummary).toContain('3 días')
    expect(printHtmlSummary).toContain('Trabajo de pintura (Total paños)')
    expect(printHtmlSummary).toContain('2,5 paños')
    expect(printHtmlSummary).toContain('Tricapa')
    expect(printHtmlSummary).toContain('Sujeto a revisión tras desarme de paragolpes.')
    expect(printHtmlSummary).toContain('FIRMA Y SELLO DEL TALLER EMISOR')
    expect(printHtmlSummary).toContain('Crash Solution Central')
    expect(printHtmlSummary).toContain('Crash Solution S.R.L.')
    expect(printHtmlSummary).not.toContain('Firma del cliente')

    // 4. Cambiar a Modo B (Detallado) y verificar WhatsApp, PDF e Impresión A4
    job.budgetMode = 'detailed'
    syncBudgetFromInspection(job)
    const pieceChapa = job.quote.find(l => l.pieceName === 'Portón trasero' && l.workType === 'Chapa')
    const piecePintura = job.quote.find(l => l.pieceName === 'Portón trasero' && l.workType === 'Pintura')
    pieceChapa.qty = 3
    pieceChapa.price = 55000
    piecePintura.qty = 2.5
    piecePintura.price = 90000

    const waDetailed = buildBudgetWhatsappMessage(job, shop)
    expect(waDetailed).toContain('Portón trasero · Chapa (3 días x $ 55.000,00): $ 165.000,00')
    expect(waDetailed).toContain('Portón trasero · Pintura (2,5 paños x $ 90.000,00): $ 225.000,00')
    expect(waDetailed).toContain('*Tipo de pintura:* Tricapa')

    const pdfDetailedBytes = await generateBudgetPdfBytes(job, shop)
    expect(verifyPdfBytesIntegrity(pdfDetailedBytes).valid).toBe(true)

    window.printBudget()
    const printHtmlDetailed = document.getElementById('printDocument').innerHTML
    expect(printHtmlDetailed).toContain('Portón trasero · Chapa')
    expect(printHtmlDetailed).toContain('Portón trasero · Pintura')
    expect(printHtmlDetailed).toContain('FIRMA Y SELLO DEL TALLER EMISOR')
  })

  it('4. INTEGRACIÓN DOM REAL: Permite alternar entre Modo A y Modo B, ingresar días/paños manuales, seleccionar Bicapa/Tricapa sin alterar precios y editar Observaciones', () => {
    const html = readFileSync(resolve('Crash_Solution_Publicacion/index.html'), 'utf8')
    const dom = new JSDOM(html, {
      url: 'http://localhost:5173/',
      runScripts: 'dangerously',
      beforeParse(win) {
        win.scrollTo = () => {}
      }
    })
    const win = dom.window
    const doc = win.document

    try {
      win.newJob({
        cliente: 'Laura Martínez',
        patente: 'AC 593 HT',
        marca: 'Ford',
        modelo: 'Ranger',
        anio: '2019'
      })

      win.active.inspection['Lado izquierdo|||Puerta trasera izquierda'] = {
        status: 'danado',
        works: ['Chapa', 'Pintura'],
        note: '',
        photos: []
      }

      win.showStep('budget')

      // Por defecto inicia en Modo B (Detallado) y sin tipo de pintura seleccionado automáticamente
      expect(win.resolveBudgetMode(win.active)).toBe('detailed')
      expect(win.resolvePaintType(win.active)).toBe('')
      expect(doc.getElementById('paintType')).toBeNull()
      const bicapaBtn = doc.getElementById('paintBicapaBtn')
      const tricapaBtn = doc.getElementById('paintTricapaBtn')
      expect(bicapaBtn).not.toBeNull()
      expect(tricapaBtn).not.toBeNull()
      expect(bicapaBtn.getAttribute('aria-pressed')).toBe('false')
      expect(tricapaBtn.getAttribute('aria-pressed')).toBe('false')
      expect(doc.getElementById('paintTypeTotalRow').hidden).toBe(true)
      expect(doc.querySelectorAll('.piece-quote-group')).toHaveLength(1)

      // Cargar valores en Modo B: 2 días × $45.000 = $90.000 y 1.5 paños × $80.000 = $120.000 (Total = $210.000)
      const q0 = doc.querySelector('input[data-line="0"][data-field="qty"]')
      const p0 = doc.querySelector('input[data-line="0"][data-field="price"]')
      const q1 = doc.querySelector('input[data-line="1"][data-field="qty"]')
      const p1 = doc.querySelector('input[data-line="1"][data-field="price"]')
      q0.value = '2'; q0.dispatchEvent(new win.Event('input', { bubbles: true }))
      p0.value = '45000'; p0.dispatchEvent(new win.Event('input', { bubbles: true }))
      q1.value = '1.5'; q1.dispatchEvent(new win.Event('input', { bubbles: true }))
      p1.value = '80000'; p1.dispatchEvent(new win.Event('input', { bubbles: true }))

      expect(doc.getElementById('grandTotal').textContent).toContain('210.000')
      expect(doc.getElementById('pinturaTotalLabel').textContent).toBe('Total Pintura (1,5 paños)')

      // Cambiar a Modo A (Totalizar al final): no muestra las tarjetas individuales por pieza
      win.setBudgetMode('summary')
      expect(win.active.budgetMode).toBe('summary')
      expect(doc.querySelectorAll('.piece-quote-group')).toHaveLength(0)
      expect(doc.getElementById('summaryBudgetCard')).not.toBeNull()

      // Ingresar días y paños manuales en Modo A: 5 días × $50.000 = $250.000 y 4 paños × $85.000 = $340.000 (Total = $590.000)
      const sumChapaDays = doc.getElementById('summaryChapaDays')
      const sumChapaRate = doc.getElementById('summaryChapaPrice')
      const sumPinturaPanels = doc.getElementById('summaryPinturaPanels')
      const sumPinturaRate = doc.getElementById('summaryPinturaPrice')

      sumChapaDays.value = '5'; sumChapaDays.dispatchEvent(new win.Event('input', { bubbles: true }))
      sumChapaRate.value = '50000'; sumChapaRate.dispatchEvent(new win.Event('input', { bubbles: true }))
      sumPinturaPanels.value = '4'; sumPinturaPanels.dispatchEvent(new win.Event('input', { bubbles: true }))
      sumPinturaRate.value = '85000'; sumPinturaRate.dispatchEvent(new win.Event('input', { bubbles: true }))

      expect(doc.getElementById('summaryChapaSubtotal').textContent).toContain('250.000')
      expect(doc.getElementById('summaryPinturaSubtotal').textContent).toContain('340.000')
      expect(doc.getElementById('grandTotal').textContent).toContain('590.000')

      // Verifica que el aviso de diferencia entre modos se muestre compacto y claro
      const modeNotice = doc.getElementById('budgetModeConsistencyNotice')
      expect(modeNotice.hidden).toBe(false)
      expect(modeNotice.classList.contains('budget-mode-notice')).toBe(true)
      expect(modeNotice.textContent).toContain('Totales distintos entre modos:')
      expect(modeNotice.textContent).toContain('Resumido')
      expect(modeNotice.textContent).toContain('Detallado')

      // Seleccionar Bicapa y luego Tricapa únicamente desde los botones: persiste y no altera ningún precio
      bicapaBtn.click()
      expect(win.active.paintType).toBe('Bicapa')
      expect(bicapaBtn.getAttribute('aria-pressed')).toBe('true')
      expect(tricapaBtn.getAttribute('aria-pressed')).toBe('false')
      expect(doc.getElementById('paintTypeTotalRow').hidden).toBe(false)
      expect(doc.getElementById('paintTypeTotalValue').textContent).toBe('Bicapa')
      expect(doc.getElementById('grandTotal').textContent).toContain('590.000')

      tricapaBtn.click()
      expect(win.active.paintType).toBe('Tricapa')
      expect(bicapaBtn.getAttribute('aria-pressed')).toBe('false')
      expect(tricapaBtn.getAttribute('aria-pressed')).toBe('true')
      expect(doc.getElementById('paintTypeTotalValue').textContent).toBe('Tricapa')
      expect(doc.getElementById('grandTotal').textContent).toContain('590.000')

      // Volver a Modo B: conserva intactos los datos por pieza ($210.000) y al regresar a Modo A conserva los $590.000
      win.setBudgetMode('detailed')
      expect(doc.querySelectorAll('.piece-quote-group')).toHaveLength(1)
      expect(doc.getElementById('grandTotal').textContent).toContain('210.000')

      win.setBudgetMode('summary')
      expect(doc.getElementById('grandTotal').textContent).toContain('590.000')
    } finally {
      win.close()
    }
  })

  it('5. REGRESIÓN ENCABEZADO: Elimina definitivamente el indicador «Taller: Taller de Prueba» de la barra superior en PC y celular sin dejar espacios vacíos y conservando el selector en «Mi taller»', async () => {
    appAuthState.memberships = [
      { workshop_id: 'w1', role: 'owner', workshop: { id: 'w1', name: 'Taller de Prueba', legal_name: 'Taller de Prueba SRL' } },
      { workshop_id: 'w2', role: 'staff', workshop: { id: 'w2', name: 'Crash Solution', legal_name: 'Crash Solution SRL' } }
    ]
    appAuthState.activeWorkshopId = 'w1'

    renderHeaderNavigation()

    const headerEl = document.querySelector('.app-header')
    const headerToolsEl = headerEl.querySelector('.header-tools')
    expect(document.getElementById('saveState')).toBeNull()
    expect(headerToolsEl?.hidden).toBe(true)
    expect(headerToolsEl?.childElementCount).toBe(0)
    expect(headerEl.textContent).not.toContain('Taller: Taller de Prueba')
    expect(headerEl.textContent).not.toContain('Taller:')

    // Al cambiar de taller con switchActiveWorkshop tampoco vuelve a aparecer el indicador en el encabezado
    await switchActiveWorkshop('w2')
    expect(document.getElementById('saveState')).toBeNull()
    expect(headerToolsEl?.hidden).toBe(true)
    expect(headerToolsEl?.childElementCount).toBe(0)
    expect(headerEl.textContent).not.toContain('Taller:')
    expect(document.getElementById('profileMenuToggle')).not.toBeNull()

    // Verificar en «Mi taller» que el selector de taller sigue intacto
    await navigateAppRoute({ name: 'profile' })
    const wsSelect = document.getElementById('activeWorkshopSelect')
    expect(wsSelect).not.toBeNull()
    expect(wsSelect.value).toBe('w2')

    // Verificar en CSS que .header-tools y #saveState tienen display: none !important (sin espacio vacío en PC ni móvil)
    const stylesCss = readFileSync(resolve('Crash_Solution_Publicacion/src/styles.css'), 'utf8')
    expect(stylesCss).toContain('.app-header .header-tools, #saveState { display: none !important; }')
  })
})

