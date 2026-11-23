/**
 * Sistema centralizado y reutilizable de notificaciones y modales de error
 * para Crash Solution / MiTallerAPP.
 *
 * - Errores importantes -> Modal centrado accesible (#appErrorModal, role="alertdialog")
 *   con explicación clara de qué ocurrió y cómo solucionarlo, botones «Entendido» / «Cerrar»,
 *   cierre con Escape, foco controlado y sin superposición de múltiples popups.
 * - Errores de formularios -> Además del modal, resalta el campo afectado con indicación junto al campo.
 * - Operaciones exitosas -> Notificación discreta (#toast) que desaparece automáticamente.
 */

const SECTION_LABELS = {
  jobs: 'TRABAJOS Y RECEPCIÓN',
  reception: 'RECEPCIÓN DEL VEHÍCULO',
  budget: 'PRESUPUESTO',
  pdf: 'DESCARGA E IMPRESIÓN DE PDF',
  whatsapp: 'ENVÍO POR WHATSAPP',
  stock: 'STOCK / DEPÓSITO',
  profile: 'MI TALLER',
  personal_profile: 'MI PERFIL',
  settings: 'CONFIGURACIÓN',
  auth: 'AUTENTICACIÓN Y ACCESO',
  admin: 'ADMINISTRACIÓN Y PERMISOS'
}

let activeReturnFocusEl = null
let modalKeydownBound = false
let toastAutoHideTimer = null

export function inferErrorDetails(rawMessage = '', section = '') {
  const msg = String(rawMessage || 'Ocurrió un inconveniente al procesar la solicitud.').trim()
  const lower = msg.toLowerCase()
  const secKey = String(section || '').toLowerCase()
  const sectionLabel = SECTION_LABELS[secKey] || 'ATENCIÓN'

  let title = 'Revisá la información ingresada'
  let solution = 'Verificá los datos resaltados en pantalla y volvé a intentarlo.'

  if (lower.includes('cliente') && lower.includes('patente')) {
    title = 'Faltan datos obligatorios en Recepción'
    solution = 'Completá el nombre del cliente y la patente del vehículo en el Paso 1 (Recepción) para poder avanzar.'
  } else if (lower.includes('nombre del cliente')) {
    title = 'Falta el nombre del cliente'
    solution = 'Ingresá el nombre y apellido o razón social del cliente en el Paso 1 (Recepción).'
  } else if (lower.includes('patente')) {
    title = 'Falta la patente del vehículo'
    solution = 'Ingresá el dominio o patente del vehículo en el Paso 1 (Recepción).'
  } else if (lower.includes('renglón') || (lower.includes('descripción') && lower.includes('cantidad'))) {
    title = 'Presupuesto incompleto'
    solution = 'Agregá al menos un trabajo o repuesto al presupuesto y completá su descripción y una cantidad mayor a 0.'
  } else if (lower.includes('precio $ 0') || lower.includes('sin precio')) {
    title = 'Entrega de presupuesto cancelada'
    solution = 'Completá el precio unitario de cada trabajo o confirmá el cuadro de diálogo si deseás entregarlo sin precio.'
  } else if (secKey === 'pdf' || lower.includes('pdf')) {
    title = 'No se pudo generar o entregar el PDF'
    solution = 'Verificá que el presupuesto tenga cliente, patente y trabajos válidos e intentá nuevamente. También podés usar «Imprimir A4».'
  } else if (secKey === 'whatsapp' || lower.includes('whatsapp')) {
    title = 'No se pudo abrir WhatsApp'
    solution = 'Verificá el número de teléfono del cliente o utilizá el enlace directo de WhatsApp en pantalla.'
  } else if (lower.includes('pesos enteros') || lower.includes('centavos') || lower.includes('decimales')) {
    title = 'Precio de compra con decimales no permitido'
    solution = 'Ingresá el precio de compra únicamente en pesos enteros, sin centavos, puntos ni comas (por ejemplo: 30000).'
  } else if (lower.includes('precio de compra') && lower.includes('negativo')) {
    title = 'Precio de compra inválido'
    solution = 'Ingresá un monto entero en pesos mayor o igual a $ 0.'
  } else if (lower.includes('supera el stock disponible')) {
    title = 'Stock insuficiente para el descuento'
    solution = 'Ingresá una cantidad de salida menor o igual al stock disponible actual del producto.'
  } else if (lower.includes('motivo u observación del movimiento')) {
    title = 'Falta el motivo del movimiento de stock'
    solution = 'Escribí una breve observación de al menos 3 caracteres (ej. "Compra a proveedor" o "Consumo en OT").'
  } else if (lower.includes('nombre del producto')) {
    title = 'Falta el nombre del producto'
    solution = 'Escribí un nombre descriptivo de al menos 2 caracteres para identificar el repuesto o insumo.'
  } else if (lower.includes('compatibilidad') || lower.includes('rango de años')) {
    title = 'Datos de compatibilidad vehicular incompletos'
    solution = 'Indicá la marca del vehículo y asegurate de que el año inicial y final estén entre 1900 y 2100.'
  } else if (secKey === 'auth' || lower.includes('contraseña') || lower.includes('credenciales') || lower.includes('sesión') || lower.includes('iniciar sesión')) {
    title = 'Problema de acceso o autenticación'
    solution = 'Verificá tu correo electrónico y tu contraseña (mínimo 8 caracteres). Si olvidaste tu clave, usá «¿Olvidaste tu contraseña?».'
  } else if (lower.includes('permiso') || lower.includes('propietario') || lower.includes('administrador') || secKey === 'admin') {
    title = 'Acción restringida o dato de administración inválido'
    solution = 'Verificá los datos del usuario/taller o solicitá permisos de Propietario o Administrador en el taller activo.'
  } else if (secKey === 'profile' || lower.includes('logo') || lower.includes('nombre comercial')) {
    title = 'No se pudieron guardar los datos del taller'
    solution = 'Verificá que el Nombre comercial esté completo y que el logo sea una imagen PNG, JPEG o WEBP menor a 2 MB.'
  } else if (secKey === 'settings' && (lower.includes('correo') || lower.includes('email'))) {
    title = 'No se pudo actualizar el correo electrónico'
    solution =
      'Verificá que el correo tenga un formato válido, que sea distinto al actual y que no pertenezca a otra cuenta. Si el enlace venció, solicitá un nuevo cambio desde Configuración.'
  } else if (secKey === 'settings' || lower.includes('parámetro') || lower.includes('configuración')) {
    title = 'Parámetro de configuración inválido'
    solution = 'Revisá los valores numéricos ingresados en Configuración y volvé a guardar.'
  }

  return {
    sectionLabel,
    title,
    message: msg,
    solution
  }
}

function resolveElement(target) {
  if (!target || typeof document === 'undefined') return null
  if (typeof target === 'string') {
    try {
      return document.querySelector(target)
    } catch {
      return document.getElementById(target.replace(/^#/, ''))
    }
  }
  if (target && typeof target === 'object' && target.nodeType === 1) {
    return target
  }
  return null
}

function detectOffendingFields(rawMessage = '', section = '') {
  if (typeof document === 'undefined') return []
  const lower = String(rawMessage || '').toLowerCase()
  const secKey = String(section || '').toLowerCase()
  const fields = []

  if (secKey === 'reception' || (lower.includes('cliente') && lower.includes('patente'))) {
    const cli = document.querySelector('[data-rec="cliente"]')
    const pat = document.querySelector('[data-rec="patente"]')
    if (cli && !String(cli.value || '').trim()) fields.push({ el: cli, hint: 'Completá el nombre del cliente.' })
    if (pat && !String(pat.value || '').trim()) fields.push({ el: pat, hint: 'Completá la patente del vehículo.' })
    return fields
  }
  if (lower.includes('nombre del cliente')) {
    const cli = document.querySelector('[data-rec="cliente"]')
    if (cli) fields.push({ el: cli, hint: 'Completá el nombre del cliente.' })
    return fields
  }
  if (lower.includes('patente del vehículo') || (secKey === 'reception' && lower.includes('patente'))) {
    const pat = document.querySelector('[data-rec="patente"]')
    if (pat) fields.push({ el: pat, hint: 'Completá la patente del vehículo.' })
    return fields
  }
  if (secKey === 'budget' || lower.includes('renglón') || (lower.includes('descripción') && lower.includes('cantidad'))) {
    const emptyDesc = Array.from(document.querySelectorAll('#quoteLines input[data-field="description"]')).find(
      el => !String(el.value || '').trim()
    )
    if (emptyDesc) fields.push({ el: emptyDesc, hint: 'Ingresá la descripción del trabajo o repuesto.' })
    const invalidQty = Array.from(document.querySelectorAll('#quoteLines input[data-field="qty"]')).find(
      el => !(Number(el.value) > 0)
    )
    if (invalidQty) fields.push({ el: invalidQty, hint: 'Ingresá una cantidad mayor a 0.' })
    return fields
  }
  if (secKey === 'stock') {
    if (lower.includes('precio de compra') || lower.includes('pesos enteros') || lower.includes('centavos') || lower.includes('decimales')) {
      const priceEl = document.getElementById('stPurchasePrice')
      if (priceEl) fields.push({ el: priceEl, hint: 'Usá únicamente pesos enteros (sin decimales ni negativos).' })
    } else if (lower.includes('nombre del producto')) {
      const nameEl = document.getElementById('stName')
      if (nameEl) fields.push({ el: nameEl, hint: 'Ingresá el nombre del producto (mín. 2 caracteres).' })
    } else if (lower.includes('stock mínimo')) {
      const minEl = document.getElementById('stMinQty')
      if (minEl) fields.push({ el: minEl, hint: 'El stock mínimo no puede ser negativo.' })
    } else if (lower.includes('cantidad inicial') || lower.includes('cantidad actual')) {
      const initEl = document.getElementById('stInitialQty')
      if (initEl) fields.push({ el: initEl, hint: 'La cantidad no puede ser negativa.' })
    } else if (lower.includes('supera el stock disponible') || lower.includes('cantidad del movimiento')) {
      const movQty = document.getElementById('movQuantity')
      if (movQty) fields.push({ el: movQty, hint: 'Revisá la cantidad del movimiento.' })
    } else if (lower.includes('motivo')) {
      const movReason = document.getElementById('movReason')
      if (movReason) fields.push({ el: movReason, hint: 'Indicá el motivo del movimiento (mín. 3 caracteres).' })
    } else if (lower.includes('marca del vehículo')) {
      const makeEl = document.querySelector('[data-c-make]')
      if (makeEl) fields.push({ el: makeEl, hint: 'Indicá la marca del vehículo.' })
    }
    return fields
  }
  if (secKey === 'profile') {
    if (lower.includes('nombre comercial')) {
      const profName = document.getElementById('profName')
      if (profName) fields.push({ el: profName, hint: 'El nombre comercial del taller es obligatorio.' })
    } else if (lower.includes('cuit')) {
      const profTax = document.getElementById('profTaxId')
      if (profTax) fields.push({ el: profTax, hint: 'Verificá el formato del CUIT (11 dígitos).' })
    }
    return fields
  }
  if (secKey === 'personal_profile') {
    const pName = document.getElementById('personalName')
    if (pName) fields.push({ el: pName, hint: 'Revisá tu nombre completo.' })
    return fields
  }
  if (secKey === 'settings') {
    if (lower.includes('correo') || lower.includes('email')) {
      const emailEl = document.getElementById('settingsNewEmail')
      if (emailEl) fields.push({ el: emailEl, hint: 'Ingresá un correo electrónico válido y disponible.' })
    } else if (lower.includes('coinciden')) {
      const confEl = document.getElementById('settingsConfirmPassword') || document.getElementById('settingsNewPassword')
      if (confEl) fields.push({ el: confEl, hint: 'Las contraseñas deben coincidir.' })
    } else if (lower.includes('contraseña')) {
      const passEl = document.getElementById('settingsNewPassword')
      if (passEl) fields.push({ el: passEl, hint: 'Revisá la nueva contraseña (mínimo 8 caracteres).' })
    } else if (lower.includes('validez')) {
      const validEl = document.getElementById('setting_defaultValidDays')
      if (validEl) fields.push({ el: validEl, hint: 'Ingresá un valor entre 1 y 365 días.' })
    } else if (lower.includes('impuesto') || lower.includes('iva')) {
      const taxEl = document.getElementById('setting_defaultTaxPct')
      if (taxEl) fields.push({ el: taxEl, hint: 'Ingresá un porcentaje entre 0 y 100.' })
    } else if (lower.includes('umbral') || lower.includes('stock')) {
      const lowEl = document.getElementById('setting_lowStockDefaultThreshold')
      if (lowEl) fields.push({ el: lowEl, hint: 'Ingresá un umbral entre 0 y 1000.' })
    }
    return fields
  }
  if (secKey === 'auth') {
    const emailEl =
      document.getElementById('loginEmail') ||
      document.getElementById('regEmail') ||
      document.getElementById('resetEmail') ||
      document.getElementById('authEmail')
    const passEl =
      document.getElementById('loginPassword') ||
      document.getElementById('regPassword') ||
      document.getElementById('newPasswordInput') ||
      document.getElementById('authPassword')
    const confirmEl = document.getElementById('regConfirm') || document.getElementById('confirmNewPasswordInput')
    const nameEl = document.getElementById('regName')
    if (lower.includes('nombre') && nameEl) {
      fields.push({ el: nameEl, hint: 'Ingresá tu nombre y apellido.' })
    } else if (lower.includes('coinciden') && confirmEl) {
      fields.push({ el: confirmEl, hint: 'Las contraseñas deben coincidir.' })
    } else if ((lower.includes('contraseña') || lower.includes('credenciales')) && passEl) {
      fields.push({ el: passEl, hint: 'Revisá la contraseña ingresada.' })
    } else if (emailEl) {
      fields.push({ el: emailEl, hint: 'Verificá tu correo electrónico.' })
    }
    return fields
  }
  if (secKey === 'admin') {
    if (lower.includes('nombre comercial')) {
      const newWs = document.getElementById('newWsName')
      if (newWs) fields.push({ el: newWs, hint: 'Ingresá el nombre comercial del taller.' })
    } else if (lower.includes('código') || lower.includes('uuid')) {
      const uuidEl = document.getElementById('assignUserUuid')
      if (uuidEl) fields.push({ el: uuidEl, hint: 'Ingresá un código de usuario válido.' })
    } else if (lower.includes('correo')) {
      const invEmail = document.getElementById('invEmail')
      if (invEmail) fields.push({ el: invEmail, hint: 'Ingresá un correo electrónico válido.' })
    }
  }
  return fields
}

/**
 * Resalta un campo de formulario con error y coloca una indicación clara junto al campo.
 * Se limpia automáticamente cuando el usuario edita el campo, sin abrir popups al escribir.
 */
export function markFieldError(fieldOrSelector, hintMessage = '') {
  const el = resolveElement(fieldOrSelector)
  if (!el) return null

  el.classList.add('input-field-error')
  el.setAttribute('aria-invalid', 'true')

  const container = el.closest('label') || el.parentElement
  if (container && hintMessage) {
    let hintEl = container.querySelector('[data-field-error-hint="true"]')
    if (!hintEl) {
      hintEl = document.createElement('small')
      hintEl.className = 'field-error-hint'
      hintEl.setAttribute('data-field-error-hint', 'true')
      container.appendChild(hintEl)
    }
    hintEl.textContent = String(hintMessage)
  }

  if (!el.__fieldErrorAutoClearBound) {
    el.__fieldErrorAutoClearBound = true
    const clearThisField = () => {
      el.classList.remove('input-field-error')
      el.removeAttribute('aria-invalid')
      const parent = el.closest('label') || el.parentElement
      parent?.querySelector('[data-field-error-hint="true"]')?.remove()
    }
    el.addEventListener('input', clearThisField)
    el.addEventListener('change', clearThisField)
  }

  return el
}

export function clearFieldErrors(root = typeof document !== 'undefined' ? document : null) {
  if (!root || typeof root.querySelectorAll !== 'function') return
  root.querySelectorAll('.input-field-error, [aria-invalid="true"]').forEach(el => {
    el.classList.remove('input-field-error')
    el.removeAttribute('aria-invalid')
  })
  root.querySelectorAll('[data-field-error-hint="true"]').forEach(hint => hint.remove())
}

function getModalHostContainer() {
  if (typeof document === 'undefined') return null
  const openDialog = document.querySelector('dialog[open]')
  return openDialog || document.body
}

function ensureErrorModalElement() {
  if (typeof document === 'undefined' || !document.body) return null
  let backdrop = document.getElementById('appErrorModal')
  if (!backdrop) {
    backdrop = document.createElement('div')
    backdrop.id = 'appErrorModal'
    backdrop.className = 'app-error-modal-backdrop'
    backdrop.hidden = true
    backdrop.innerHTML = `
      <div
        id="appErrorModalDialog"
        class="app-error-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="appErrorModalTitle"
        aria-describedby="appErrorModalDesc"
        tabindex="-1"
      >
        <div class="app-error-modal-header">
          <div class="app-error-modal-icon" aria-hidden="true">!</div>
          <div class="app-error-modal-headings">
            <span class="eyebrow" id="appErrorModalSection">ATENCIÓN</span>
            <h2 id="appErrorModalTitle">Revisá los datos ingresados</h2>
          </div>
          <button type="button" class="app-error-modal-x" id="appErrorModalDismissBtn" aria-label="Cerrar">×</button>
        </div>
        <div class="app-error-modal-body" id="appErrorModalDesc">
          <p class="app-error-modal-message" id="appErrorModalMessage"></p>
          <div class="app-error-modal-solution" id="appErrorModalSolutionBox">
            <strong>Cómo solucionarlo:</strong>
            <span id="appErrorModalSolution"></span>
          </div>
        </div>
        <div class="app-error-modal-footer">
          <button type="button" class="button secondary" id="appErrorModalSecondaryCloseBtn">Cerrar</button>
          <button type="button" class="button primary" id="appErrorModalCloseBtn">Entendido</button>
        </div>
      </div>
    `
    document.body.appendChild(backdrop)

    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) {
        closeErrorModal({ restoreFocus: true })
      }
    })
    backdrop.querySelector('#appErrorModalCloseBtn')?.addEventListener('click', () => {
      closeErrorModal({ restoreFocus: true })
    })
    backdrop.querySelector('#appErrorModalSecondaryCloseBtn')?.addEventListener('click', () => {
      closeErrorModal({ restoreFocus: true })
    })
    backdrop.querySelector('#appErrorModalDismissBtn')?.addEventListener('click', () => {
      closeErrorModal({ restoreFocus: true })
    })
  }

  const targetHost = getModalHostContainer()
  if (targetHost && backdrop.parentElement !== targetHost) {
    targetHost.appendChild(backdrop)
  }

  if (!modalKeydownBound && typeof document !== 'undefined') {
    modalKeydownBound = true
    document.addEventListener(
      'keydown',
      e => {
        const modal = document.getElementById('appErrorModal')
        if (!modal || modal.hidden) return

        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation?.()
          closeErrorModal({ restoreFocus: true })
          return
        }

        if (e.key === 'Tab') {
          const focusables = Array.from(
            modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')
          )
          if (!focusables.length) return
          const first = focusables[0]
          const last = focusables[focusables.length - 1]
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault()
            last.focus()
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      },
      true
    )
  }

  return backdrop
}

export function isErrorModalOpen() {
  if (typeof document === 'undefined') return false
  const modal = document.getElementById('appErrorModal')
  return Boolean(modal && !modal.hidden)
}

export function showErrorModal(options = {}) {
  if (typeof document === 'undefined' || !document.body) return null
  const normalized =
    typeof options === 'string'
      ? { message: options }
      : options && typeof options === 'object'
        ? options
        : { message: String(options || '') }

  const rawMessage = String(normalized.message || '').trim()
  if (!rawMessage) return null

  const details = inferErrorDetails(rawMessage, normalized.section)
  const title = normalized.title || details.title
  const solution = normalized.solution !== undefined ? normalized.solution : details.solution
  const sectionLabel = normalized.sectionLabel || details.sectionLabel

  let primaryFieldEl = null
  if (normalized.field) {
    primaryFieldEl = markFieldError(normalized.field, normalized.fieldHint || rawMessage)
  } else {
    const autoFields = detectOffendingFields(rawMessage, normalized.section)
    for (const item of autoFields) {
      const marked = markFieldError(item.el, item.hint)
      if (!primaryFieldEl && marked) primaryFieldEl = marked
    }
  }

  const modal = ensureErrorModalElement()
  if (!modal) return null

  const wasAlreadyOpen = !modal.hidden
  const candidateFocus = resolveElement(normalized.returnFocusEl) || primaryFieldEl
  if (candidateFocus) {
    activeReturnFocusEl = candidateFocus
  } else if (!wasAlreadyOpen && document.activeElement && !modal.contains(document.activeElement)) {
    activeReturnFocusEl = document.activeElement
  }

  const sectionEl = modal.querySelector('#appErrorModalSection')
  const titleEl = modal.querySelector('#appErrorModalTitle')
  const msgEl = modal.querySelector('#appErrorModalMessage')
  const solBoxEl = modal.querySelector('#appErrorModalSolutionBox')
  const solEl = modal.querySelector('#appErrorModalSolution')

  if (sectionEl) sectionEl.textContent = sectionLabel
  if (titleEl) titleEl.textContent = title
  if (msgEl) msgEl.textContent = rawMessage
  if (solBoxEl && solEl) {
    if (solution) {
      solEl.textContent = solution
      solBoxEl.hidden = false
    } else {
      solEl.textContent = ''
      solBoxEl.hidden = true
    }
  }

  modal.hidden = false
  modal.setAttribute('data-open', 'true')
  modal.setAttribute('data-section', String(normalized.section || 'general'))

  const primaryBtn = modal.querySelector('#appErrorModalCloseBtn')
  primaryBtn?.focus?.()

  return modal
}

export function closeErrorModal({ restoreFocus = true } = {}) {
  if (typeof document === 'undefined') return
  const modal = document.getElementById('appErrorModal')
  if (!modal) return
  const wasOpen = !modal.hidden
  modal.hidden = true
  modal.removeAttribute('data-open')

  if (modal.parentElement && modal.parentElement !== document.body && document.body) {
    document.body.appendChild(modal)
  }

  const focusTarget = activeReturnFocusEl
  activeReturnFocusEl = null

  if (wasOpen && restoreFocus && focusTarget && focusTarget.isConnected && typeof focusTarget.focus === 'function') {
    const hiddenAncestor = focusTarget.closest?.('[hidden]')
    if (!hiddenAncestor) {
      try {
        focusTarget.focus()
      } catch {}
    }
  }
}

export function showSuccessToast(message, durationMs = 3500) {
  if (typeof document === 'undefined') return
  const text = String(message || '').trim()
  if (!text) return
  let toastEl = document.getElementById('toast')
  if (!toastEl && document.body) {
    toastEl = document.createElement('div')
    toastEl.id = 'toast'
    toastEl.className = 'toast'
    document.body.appendChild(toastEl)
  }
  if (!toastEl) return
  toastEl.textContent = text
  toastEl.hidden = false
  clearTimeout(toastAutoHideTimer)
  toastAutoHideTimer = setTimeout(() => {
    toastEl.hidden = true
  }, durationMs)
}

export function clearAllTransientErrors() {
  closeErrorModal({ restoreFocus: false })
  clearFieldErrors()
}
