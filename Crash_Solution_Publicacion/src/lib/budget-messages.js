import { formatCuit } from './workshop-profile.js'
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
} from './piece-budget.js'

export {
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
}

const toSafeNumber = v => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0)
const toBounded = (v, min, max) => Math.min(max, Math.max(min, toSafeNumber(v)))

export function formatArsCurrency(value) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2
  })
    .format(toSafeNumber(value))
    .replace(/[\u00A0\u202F]/g, ' ')
}

export function getVehicleYear(rec = {}) {
  if (!rec || typeof rec !== 'object') return ''
  const raw = rec.anio ?? rec['año'] ?? rec.year ?? ''
  return String(raw).trim()
}

export function formatIsoDateAr(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ''))) return 'Sin fecha'
  return String(isoDate).split('-').reverse().join('/')
}

export function computeExpiryIsoDate(doc = {}) {
  const rawDate = doc?.date || new Date().toISOString().slice(0, 10)
  const dt = new Date(`${rawDate}T12:00:00Z`)
  if (!Number.isFinite(dt.getTime())) return ''
  dt.setUTCDate(dt.getUTCDate() + toBounded(doc?.validDays ?? 15, 1, 365))
  return dt.toISOString().slice(0, 10)
}

/**
 * Mantiene exactamente la misma fórmula de cálculo de presupuestos que `totals(j)` en index.html,
 * incorporando el modo elegido (Modo A: 'summary' / Totalizar al final, o Modo B: 'detailed' / por ítem).
 */
export function computeBudgetTotals(job = {}, options = {}) {
  return computeBudgetTotalsByMode(job, options?.mode || null)
}

export function validateBudgetForDelivery(job, options = {}) {
  if (!job || typeof job !== 'object') {
    return { valid: false, error: 'No hay un trabajo activo seleccionado.' }
  }
  const cliente = String(job?.rec?.cliente || '').trim()
  const patente = String(job?.rec?.patente || '').trim()
  if (!cliente || !patente) {
    return { valid: false, error: 'Completá el nombre del cliente y la patente antes de compartir el presupuesto.' }
  }

  const mode = resolveBudgetMode(job, options?.mode || null)

  if (options?.requireConsistentTotals) {
    const consistency = checkBudgetModesConsistency(job)
    if (consistency.bothPopulated && !consistency.consistent) {
      return {
        valid: false,
        error: `Los importes cargados en Modo Resumido (${formatArsCurrency(consistency.summaryTotal)}) y Modo Detallado (${formatArsCurrency(consistency.detailedTotal)}) no coinciden. Verificá los montos antes de generar ambas presentaciones.`
      }
    }
  }

  if (mode === 'summary') {
    const sb = normalizeSummaryBudget(job?.summaryBudget)
    const manualLines = (Array.isArray(job?.quote) ? job.quote : []).filter(
      q => !describeQuoteLine(q).isInspectionPiece
    )
    const hasChapa = sb.chapaDays > 0
    const hasPintura = sb.pinturaPanels > 0
    const hasManual = manualLines.length > 0

    if (!hasChapa && !hasPintura && !hasManual) {
      return {
        valid: false,
        error: 'En el modo resumido, ingresá la cantidad de días de chapa, paños de pintura o agregá al menos un repuesto o trabajo.'
      }
    }
    if (manualLines.some(q => !String(q?.description || '').trim() || !toSafeNumber(q?.qty))) {
      return {
        valid: false,
        error: 'Completá la descripción y una cantidad mayor a 0 en cada repuesto u otro trabajo.'
      }
    }
    return { valid: true, mode: 'summary' }
  }

  const quoteLines = Array.isArray(job?.quote) ? job.quote : []
  if (!quoteLines.length || quoteLines.some(q => !String(q?.description || '').trim() || !toSafeNumber(q?.qty))) {
    return {
      valid: false,
      error: 'Agregá al menos un trabajo o repuesto y completá su descripción y cantidad.'
    }
  }
  return { valid: true, mode: 'detailed' }
}

/**
 * Normaliza un número telefónico para enlaces wa.me (formato internacional sin + ni símbolos).
 * Si recibe un número móvil argentino de 10 dígitos (ej. 11 5555 1234), antepone 549.
 */
export function normalizeWhatsappPhone(rawPhone) {
  const digits = String(rawPhone || '').replace(/\D+/g, '')
  if (!digits || digits.length < 8) return ''
  if (digits.startsWith('549') && digits.length >= 12) return digits
  if (digits.startsWith('54') && digits.length === 12) return `549${digits.slice(2)}`
  if (digits.startsWith('0')) {
    const stripped = digits.replace(/^0+/, '')
    if (stripped.length === 10) return `549${stripped}`
    return stripped
  }
  if (digits.length === 10) {
    return `549${digits}`
  }
  return digits
}

export function buildBudgetFilename(job = {}) {
  const cleanPlate = String(job?.rec?.patente || 'VEHICULO')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '_')
  const datePart = /^\d{4}-\d{2}-\d{2}$/.test(job?.document?.date || '')
    ? job.document.date
    : new Date().toISOString().slice(0, 10)
  return `Presupuesto_${cleanPlate}_${datePart}.pdf`
}

/**
 * Construye el mensaje profesional de texto para WhatsApp (Opción A)
 * sin exponer enlaces públicos a presupuestos privados.
 * Se adapta al modo elegido (Modo A resumido o Modo B detallado por pieza) e incluye el tipo de pintura cuando corresponde.
 */
export function buildBudgetWhatsappMessage(job = {}, shop = {}, options = {}) {
  const shopName = String(shop?.name || 'Crash Solution').trim()
  const legalName = String(shop?.legal_name || '').trim()
  const cuit = shop?.tax_id ? formatCuit(shop.tax_id) : ''
  const contactParts = [
    shop?.phone ? `Tel: ${String(shop.phone).trim()}` : '',
    shop?.whatsapp ? `WhatsApp: ${String(shop.whatsapp).trim()}` : '',
    shop?.address ? String(shop.address).trim() : '',
    shop?.email ? String(shop.email).trim() : ''
  ].filter(Boolean)

  const quoteRef = String(job?.number || '').startsWith('LOCAL-')
    ? `Ref. ${String(job?.id || '').slice(0, 8).toUpperCase()}`
    : String(job?.number || 'S/N').trim()

  const yearStr = getVehicleYear(job?.rec)
  const plateStr = String(job?.rec?.patente || '').trim().toUpperCase()
  const makeModelStr = [job?.rec?.marca, job?.rec?.modelo]
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .join(' ')

  const vehicleLabel = [
    makeModelStr,
    yearStr,
    plateStr ? `(${plateStr})` : ''
  ]
    .filter(Boolean)
    .join(' ')

  const mode = resolveBudgetMode(job, options?.mode || null)
  const t = computeBudgetTotals(job, { mode })
  const paintType = resolvePaintType(job)
  const doc = job?.document || {}
  const issueDate = formatIsoDateAr(doc.date)
  const validUntil = formatIsoDateAr(computeExpiryIsoDate(doc))
  const observationsText = resolveBudgetObservations(job)

  const linesText =
    mode === 'summary'
      ? buildSummaryPresentationLines(job)
          .map(item => {
            if (item.isSummaryLine) {
              return `- ${item.displayDescription} (${formatArQuantity(item.qty)} ${item.unit} x ${formatArsCurrency(item.price)}): ${formatArsCurrency(item.subtotal)}`
            }
            const qtyLabel = item.qty !== 1 ? ` (${formatArQuantity(item.qty)} x ${formatArsCurrency(item.price)})` : ''
            return `- ${item.displayDescription}${qtyLabel}: ${formatArsCurrency(item.subtotal)}`
          })
          .join('\n')
      : (job?.quote || [])
          .map(q => {
            const info = describeQuoteLine(q)
            if (info.isInspectionPiece || q?.unit || q?.workType) {
              return `- ${info.displayDescription} (${formatArQuantity(info.qty)} ${info.unit} x ${formatArsCurrency(info.price)}): ${formatArsCurrency(info.subtotal)}`
            }
            const qty = toSafeNumber(q.qty)
            const unitPrice = toSafeNumber(q.price)
            const lineTotal = qty * unitPrice
            const desc = String(q.description || '').replace(/\s+/g, ' ').trim()
            const qtyLabel = qty !== 1 ? ` (${formatArQuantity(qty)} x ${formatArsCurrency(unitPrice)})` : ''
            return `- ${desc}${qtyLabel}: ${formatArsCurrency(lineTotal)}`
          })
          .join('\n')

  const headerLines = [`*${shopName} - Presupuesto ${quoteRef}*`]
  if (legalName || cuit) {
    headerLines.push([legalName, cuit ? `CUIT ${cuit}` : ''].filter(Boolean).join(' | '))
  }
  if (contactParts.length) {
    headerLines.push(contactParts.join(' | '))
  }

  const clientBlock = [
    `*Cliente:* ${String(job?.rec?.cliente || 'Sin especificar').replace(/\s+/g, ' ').trim()}`,
    `*Vehículo:* ${vehicleLabel || 'Sin especificar'}`,
    yearStr ? `*Año:* ${yearStr}` : '',
    plateStr ? `*Patente:* ${plateStr}` : '',
    job?.rec?.km ? `*Kilometraje:* ${String(job.rec.km).trim()} km` : '',
    paintType ? `*Tipo de pintura:* ${paintType}` : ''
  ].filter(Boolean)

  const detailHeading =
    mode === 'summary' ? '*Resumen de trabajos y repuestos:*' : '*Detalle de trabajos y repuestos:*'

  const sections = [
    headerLines.join('\n'),
    clientBlock.join('\n'),
    `${detailHeading}\n${linesText}`
  ]

  const totalsLines = []
  if (t.chapaCount > 0 || t.chapaSubtotal > 0) {
    totalsLines.push(`Resumen Chapa (${formatArQuantity(t.chapaDays)} días): ${formatArsCurrency(t.chapaSubtotal)}`)
  }
  if (t.pinturaCount > 0 || t.pinturaSubtotal > 0) {
    totalsLines.push(`Resumen Pintura (${formatArQuantity(t.pinturaPanels)} paños): ${formatArsCurrency(t.pinturaSubtotal)}`)
  }
  if (t.otherSubtotal > 0 && (t.chapaCount > 0 || t.pinturaCount > 0)) {
    totalsLines.push(`Otros trabajos / repuestos: ${formatArsCurrency(t.otherSubtotal)}`)
  }
  if (t.discount > 0 || t.tax > 0 || t.chapaCount > 0 || t.pinturaCount > 0) {
    totalsLines.push(`Subtotal: ${formatArsCurrency(t.subtotal)}`)
  }
  if (t.discount > 0) {
    totalsLines.push(`Descuento (${t.discountPct}%): - ${formatArsCurrency(t.discount)}`)
  }
  if (t.tax > 0) {
    totalsLines.push(`Impuestos (${t.taxPct}%): + ${formatArsCurrency(t.tax)}`)
  }
  totalsLines.push(`*TOTAL PRESUPUESTADO: ${formatArsCurrency(t.total)}*`)
  sections.push(totalsLines.join('\n'))

  const metaLines = [`Fecha: ${issueDate} | Válido hasta: ${validUntil}`]
  if (paintType) {
    metaLines.push(`Sistema de pintura del vehículo: ${paintType}`)
  }
  if (observationsText) {
    const cleanTerms = String(observationsText)
      .split(/\r?\n/)
      .map(line => line.replace(/[\t\u00A0\u202F]+/g, ' ').replace(/ {2,}/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
    metaLines.push(`*Observaciones / Condiciones:*\n${cleanTerms}`)
  }
  metaLines.push('_Presupuesto estimativo sujeto al alcance indicado. No válido como factura._')
  sections.push(metaLines.join('\n'))

  return sections
    .join('\n\n')
    .replace(/[\t\u00A0\u202F]+/g, ' ')
    .replace(/\uFFFD/g, '')
    .normalize('NFC')
}

export function buildWhatsappShareUrl(job = {}, shop = {}, options = {}) {
  const text = buildBudgetWhatsappMessage(job, shop, options)
  const phone = normalizeWhatsappPhone(job?.rec?.telefono)
  const baseUrl = phone ? `https://wa.me/${phone}` : 'https://wa.me/'
  return `${baseUrl}?text=${encodeURIComponent(text)}`
}

/**
 * Abre WhatsApp con el mensaje preparado.
 * NUNCA afirma que el mensaje ya fue enviado si solamente se abrió WhatsApp.
 */
export function openWhatsappWithBudgetText(job = {}, shop = {}, windowObj = globalThis.window, options = {}) {
  const check = validateBudgetForDelivery(job, options)
  if (!check.valid) {
    throw new Error(check.error)
  }
  const url = buildWhatsappShareUrl(job, shop, options)
  if (windowObj?.open) {
    windowObj.open(url, '_blank', 'noopener,noreferrer')
  }
  return {
    opened: true,
    sentConfirmed: false,
    url,
    userMessage: 'Se abrió WhatsApp con el presupuesto preparado. Confirmá el envío desde la aplicación.'
  }
}
