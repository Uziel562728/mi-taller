/**
 * DEV-35: Presupuesto por pieza e intervención generado desde la inspección.
 *
 * - La inspección determina qué intervenciones requiere cada pieza (Chapa, Pintura, Reparar/Reacondicionar, Reemplazar).
 * - En el paso Presupuesto se cargan las cantidades (días de chapa, paños de pintura, unidades) y tarifas unitarias.
 * - No crea cantidades ni tarifas predeterminadas ficticias.
 * - Calcula subtotales por intervención, subtotales por pieza y totales separados de Chapa y Pintura.
 */

const toSafeNumber = v => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0)
const toBounded = (v, min, max) => Math.min(max, Math.max(min, toSafeNumber(v)))

const defaultUid = () =>
  globalThis.crypto?.randomUUID?.() || `q-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

export const VALID_BUDGET_MODES = Object.freeze(['detailed', 'summary'])
export const VALID_PAINT_TYPES = Object.freeze(['Bicapa', 'Tricapa'])

/**
 * Formatea una cantidad numérica en formato argentino (coma decimal, ej. 2,5)
 * sin alterar la precisión ni el tipo numérico utilizado en los cálculos.
 */
export function formatArQuantity(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  const rounded = Math.round(Math.max(0, n) * 100) / 100
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(rounded)
}

/**
 * Resuelve el modo de presupuesto individual del trabajo ('detailed' | 'summary').
 * No modifica presupuestos históricos: si no tienen modo explícito, usa 'detailed'.
 */
export function resolveBudgetMode(job = {}, modeOverride = null) {
  const candidate = String(modeOverride || job?.budgetMode || job?.document?.budgetMode || '')
    .trim()
    .toLowerCase()
  if (candidate === 'summary' || candidate === 'resumido' || candidate === 'a') {
    return 'summary'
  }
  return 'detailed'
}

/**
 * Normaliza los valores manuales del Modo A (Totalizar al final).
 */
export function normalizeSummaryBudget(raw = {}) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const chapaDays = Math.round(toSafeNumber(src.chapaDays) * 100) / 100
  const chapaDayPrice = toSafeNumber(src.chapaDayPrice ?? src.chapaDayRate)
  const pinturaPanels = Math.round(toSafeNumber(src.pinturaPanels) * 100) / 100
  const pinturaPanelPrice = toSafeNumber(src.pinturaPanelPrice ?? src.pinturaPanelRate)
  return {
    chapaDays,
    chapaDayPrice,
    chapaDayRate: chapaDayPrice,
    chapaSubtotal: chapaDays * chapaDayPrice,
    pinturaPanels,
    pinturaPanelPrice,
    pinturaPanelRate: pinturaPanelPrice,
    pinturaSubtotal: pinturaPanels * pinturaPanelPrice
  }
}

/**
 * Normaliza el tipo de pintura del vehículo ('Bicapa' | 'Tricapa' | '').
 * Nunca selecciona un valor automáticamente ni altera tarifas.
 */
export function normalizePaintType(raw) {
  const clean = String(raw ?? '').trim().toLowerCase()
  if (clean === 'bicapa') return 'Bicapa'
  if (clean === 'tricapa') return 'Tricapa'
  return ''
}

export function resolvePaintType(job = {}) {
  return normalizePaintType(job?.paintType ?? job?.document?.paintType ?? '')
}

export function resolveBudgetObservations(job = {}) {
  const obs = job?.document?.terms ?? job?.document?.observations ?? job?.observations ?? ''
  return String(obs || '').trim()
}

/**
 * Normaliza el nombre de una intervención marcada en la inspección.
 */
export function normalizeWorkIntervention(rawWork) {
  const clean = String(rawWork || '').trim()
  const lower = clean.toLowerCase()

  if (lower === 'chapa') {
    return {
      workType: 'Chapa',
      workLabel: 'Chapa',
      unit: 'días',
      qtyLabel: 'Días de chapa',
      priceLabel: 'Precio por día',
      qtyPlaceholder: 'Ej. 2',
      pricePlaceholder: 'Tarifa por día',
      step: '0.5'
    }
  }

  if (lower === 'pintura') {
    return {
      workType: 'Pintura',
      workLabel: 'Pintura',
      unit: 'paños',
      qtyLabel: 'Paños de pintura',
      priceLabel: 'Precio por paño',
      qtyPlaceholder: 'Ej. 1,5',
      pricePlaceholder: 'Tarifa por paño',
      step: '0.5'
    }
  }

  if (lower === 'reponer' || lower === 'reemplazar' || lower === 'reemplazo') {
    return {
      workType: 'Reemplazar',
      workLabel: 'Reemplazar',
      unit: 'un.',
      qtyLabel: 'Cantidad (reemplazo)',
      priceLabel: 'Precio por reemplazo',
      qtyPlaceholder: 'Cant.',
      pricePlaceholder: 'Precio unitario',
      step: '1'
    }
  }

  if (lower === 'reacondicionar' || lower === 'reparar' || lower === 'reparación' || lower === 'reparacion') {
    const label = lower === 'reparar' ? 'Reparar' : 'Reacondicionar'
    return {
      workType: 'Reparar',
      workLabel: label,
      unit: 'un.',
      qtyLabel: `Cantidad (${label.toLowerCase()})`,
      priceLabel: `Precio por ${label.toLowerCase()}`,
      qtyPlaceholder: 'Cant.',
      pricePlaceholder: 'Precio unitario',
      step: '1'
    }
  }

  return {
    workType: clean || 'Trabajo',
    workLabel: clean || 'Trabajo',
    unit: 'un.',
    qtyLabel: 'Cantidad',
    priceLabel: 'Precio por unidad',
    qtyPlaceholder: 'Cant.',
    pricePlaceholder: 'Precio unitario',
    step: '0.5'
  }
}

/**
 * Extrae metadatos normalizados de cualquier renglón del presupuesto (nuevo o histórico).
 */
export function describeQuoteLine(line = {}) {
  const rawSource = line?.source ? String(line.source) : null
  const source = rawSource && rawSource !== 'manual' && rawSource !== 'inspection' ? rawSource : null
  const pieceKey = line?.pieceKey ? String(line.pieceKey) : source
  const hasSeparator = Boolean(pieceKey && pieceKey.includes('|||'))
  const zoneName = line?.zoneName || line?.area || (hasSeparator ? pieceKey.split('|||')[0] : '')
  const pieceName =
    line?.pieceName ||
    line?.piece ||
    (hasSeparator ? pieceKey.split('|||')[1] : '') ||
    (pieceKey && !hasSeparator ? pieceKey : '')

  const rawDesc = String(line?.description || line?.desc || '').trim()
  let inferredWorkType = line?.workType ? String(line.workType).trim() : ''

  if (!inferredWorkType && pieceKey) {
    const suffix = rawDesc.includes('·') ? rawDesc.split('·').slice(1).join('·').trim() : rawDesc
    const lowerSuffix = suffix.toLowerCase()
    const hasChapa = /\bchapa\b/i.test(lowerSuffix)
    const hasPintura = /\bpintura\b/i.test(lowerSuffix)
    if (hasChapa && !hasPintura) inferredWorkType = 'Chapa'
    else if (hasPintura && !hasChapa) inferredWorkType = 'Pintura'
    else if (/\b(reemplazar|reponer|reemplazo)\b/i.test(lowerSuffix)) inferredWorkType = 'Reemplazar'
    else if (/\b(reparar|reacondicionar)\b/i.test(lowerSuffix)) {
      inferredWorkType = /\breparar\b/i.test(lowerSuffix) ? 'Reparar' : 'Reacondicionar'
    }
  }

  const meta = inferredWorkType ? normalizeWorkIntervention(line?.workLabel || inferredWorkType) : null
  const workType = meta ? meta.workType : ''
  const workLabel = line?.workLabel || (meta ? meta.workLabel : '')
  const unit = line?.unit || (meta ? meta.unit : 'un.')
  const qtyLabel = meta ? meta.qtyLabel : 'Cantidad'
  const priceLabel = meta ? meta.priceLabel : 'Precio por unidad'
  const qty = toSafeNumber(line?.qty)
  const price = toSafeNumber(line?.price)
  const subtotal = qty * price

  const displayDescription =
    pieceName && workLabel
      ? `${pieceName} · ${workLabel}`
      : rawDesc || (pieceName ? pieceName : 'Trabajo o repuesto')

  const qtyFormatted = formatArQuantity(qty)
  const qtyWithUnit = unit ? `${qtyFormatted} ${unit}` : qtyFormatted

  return {
    isInspectionPiece: Boolean(pieceKey && workType),
    pieceKey: pieceKey || null,
    zoneName,
    pieceName,
    workType,
    workLabel,
    unit,
    qtyLabel,
    priceLabel,
    qtyPlaceholder: meta?.qtyPlaceholder || 'Cant.',
    pricePlaceholder: meta?.pricePlaceholder || 'Precio unitario',
    step: meta?.step || '0.1',
    qty,
    qtyFormatted,
    price,
    subtotal,
    displayDescription,
    qtyWithUnit
  }
}

/**
 * Sincroniza `job.quote` a partir de las piezas marcadas como dañadas en `job.inspection`.
 * - Crea una entrada editable por cada intervención seleccionada en cada pieza (Chapa, Pintura, Reparar/Reacondicionar, Reemplazar).
 * - NO asigna cantidades ni tarifas predeterminadas ficticias (inicia en 0 para que el usuario las complete).
 * - Conserva las cantidades y tarifas ya cargadas al volver a la inspección y regresar al presupuesto.
 * - Evita duplicar líneas automáticas y mantiene intactos los trabajos/repuestos manuales e históricos.
 */
export function syncBudgetFromInspection(job, uidFn = defaultUid) {
  if (!job || typeof job !== 'object') return { added: 0, updated: false }
  if (!Array.isArray(job.quote)) job.quote = []
  if (!job.pieceQuotes || typeof job.pieceQuotes !== 'object' || Array.isArray(job.pieceQuotes)) {
    job.pieceQuotes = {}
  }

  const inspection = job.inspection && typeof job.inspection === 'object' ? job.inspection : {}

  // 1. Resguardar en job.pieceQuotes cualquier valor actual de líneas vinculadas a piezas
  for (const q of job.quote) {
    if (!q || typeof q !== 'object') continue
    const info = describeQuoteLine(q)
    if (info.pieceKey && info.workType) {
      const sKey = q.sourceKey || `${info.pieceKey}::${info.workType}`
      q.sourceKey = sKey
      q.pieceKey = info.pieceKey
      q.pieceName = info.pieceName
      q.zoneName = info.zoneName
      q.workType = info.workType
      q.workLabel = info.workLabel
      q.unit = info.unit
      job.pieceQuotes[sKey] = {
        qty: toSafeNumber(q.qty),
        price: toSafeNumber(q.price),
        unit: info.unit,
        workType: info.workType,
        workLabel: info.workLabel,
        pieceKey: info.pieceKey,
        pieceName: info.pieceName,
        zoneName: info.zoneName,
        description: info.displayDescription
      }
    }
  }

  // 2. Identificar piezas dañadas y sus intervenciones activas en la inspección
  const damagedEntries = Object.entries(inspection).filter(([, v]) => v && v.status === 'danado')
  const desiredSourceKeys = new Set()
  const preservedLegacySources = new Set()
  let added = 0
  let updated = false

  // Mapa rápido de líneas actuales por sourceKey
  const existingBySourceKey = new Map()
  for (const q of job.quote) {
    if (q?.sourceKey) {
      existingBySourceKey.set(q.sourceKey, q)
    }
  }

  const nextInspectionLinesByPiece = new Map()

  for (const [pieceKey, v] of damagedEntries) {
    const hasSep = pieceKey.includes('|||')
    const zoneName = hasSep ? pieceKey.split('|||')[0] : ''
    const pieceName = hasSep ? pieceKey.split('|||')[1] : pieceKey
    const rawWorks = (Array.isArray(v.works) ? v.works : []).filter(
      w => typeof w === 'string' && w.trim() && !['A cotizar', 'Cotizar'].includes(w.trim())
    )

    // Verificar si existe una línea histórica combinada ya valorizada (ej. "Puerta · Chapa y pintura" con precio > 0)
    const legacyLinesForPiece = job.quote.filter(
      q => q && q.source === pieceKey && !q.workType && !existingBySourceKey.has(q.sourceKey)
    )
    const hasSplitLinesForPiece = job.quote.some(
      q => q && (q.pieceKey === pieceKey || q.source === pieceKey) && Boolean(q.workType)
    )

    if (!hasSplitLinesForPiece && legacyLinesForPiece.length > 0) {
      const pricedLegacy = legacyLinesForPiece.filter(q => toSafeNumber(q.price) > 0)
      if (rawWorks.length === 1 && legacyLinesForPiece.length === 1) {
        // Convertir en el lugar la línea de 1 sola intervención conservando su cantidad y precio
        const meta = normalizeWorkIntervention(rawWorks[0])
        const sKey = `${pieceKey}::${meta.workType}`
        const line = legacyLinesForPiece[0]
        line.source = pieceKey
        line.pieceKey = pieceKey
        line.zoneName = zoneName
        line.pieceName = pieceName
        line.workType = meta.workType
        line.workLabel = meta.workLabel
        line.unit = meta.unit
        line.sourceKey = sKey
        line.description = `${pieceName} · ${meta.workLabel}`
        existingBySourceKey.set(sKey, line)
        updated = true
      } else if (pricedLegacy.length > 0 && rawWorks.length > 1) {
        // Trabajo histórico combinado ya cotizado: conservar sin duplicar cargos
        preservedLegacySources.add(pieceKey)
        continue
      }
    }

    // Deduplicar intervenciones por workType manteniendo el orden de selección
    const seenWorkTypes = new Set()
    const pieceLines = []

    for (const rawWork of rawWorks) {
      const meta = normalizeWorkIntervention(rawWork)
      if (seenWorkTypes.has(meta.workType)) continue
      seenWorkTypes.add(meta.workType)

      const sKey = `${pieceKey}::${meta.workType}`
      desiredSourceKeys.add(sKey)

      let line = existingBySourceKey.get(sKey)
      if (line) {
        line.source = pieceKey
        line.pieceKey = pieceKey
        line.zoneName = zoneName
        line.pieceName = pieceName
        line.workType = meta.workType
        line.workLabel = meta.workLabel
        line.unit = meta.unit
        line.description = `${pieceName} · ${meta.workLabel}`
        job.pieceQuotes[sKey] = {
          qty: toSafeNumber(line.qty),
          price: toSafeNumber(line.price),
          unit: meta.unit,
          workType: meta.workType,
          workLabel: meta.workLabel,
          pieceKey,
          pieceName,
          zoneName,
          description: line.description
        }
      } else {
        const saved = job.pieceQuotes[sKey]
        const restoredQty = saved ? toSafeNumber(saved.qty) : 0
        const restoredPrice = saved ? toSafeNumber(saved.price) : 0
        line = {
          id: uidFn(),
          source: pieceKey,
          sourceKey: sKey,
          pieceKey,
          zoneName,
          pieceName,
          workType: meta.workType,
          workLabel: meta.workLabel,
          unit: meta.unit,
          description: `${pieceName} · ${meta.workLabel}`,
          qty: restoredQty,
          price: restoredPrice
        }
        job.pieceQuotes[sKey] = {
          qty: restoredQty,
          price: restoredPrice,
          unit: meta.unit,
          workType: meta.workType,
          workLabel: meta.workLabel,
          pieceKey,
          pieceName,
          zoneName,
          description: line.description
        }
        existingBySourceKey.set(sKey, line)
        added += 1
        updated = true
      }

      pieceLines.push(line)
    }

    if (pieceLines.length > 0) {
      nextInspectionLinesByPiece.set(pieceKey, pieceLines)
    }
  }

  // 3. Reconstruir job.quote en orden:
  //    - Conservar líneas históricas combinadas protegidas
  //    - Colocar las líneas de cada pieza dañada (en su orden de aparición) sin duplicados ni líneas automáticas obsoletas
  //    - Conservar todas las líneas manuales (source === null / undefined)
  const manualOrProtectedLines = []
  const placedPieces = new Set()
  const finalQuote = []

  for (const q of job.quote) {
    if (!q || typeof q !== 'object') continue
    if ((!q.source || q.source === 'manual') && !q.pieceKey) {
      manualOrProtectedLines.push(q)
      continue
    }
    const pKey = q.pieceKey || q.source
    if (preservedLegacySources.has(pKey) && !q.workType) {
      finalQuote.push(q)
      continue
    }
    if (nextInspectionLinesByPiece.has(pKey) && !placedPieces.has(pKey)) {
      placedPieces.add(pKey)
      finalQuote.push(...nextInspectionLinesByPiece.get(pKey))
    } else if (!nextInspectionLinesByPiece.has(pKey)) {
      updated = true
    }
  }

  for (const [pKey, lines] of nextInspectionLinesByPiece.entries()) {
    if (!placedPieces.has(pKey)) {
      placedPieces.add(pKey)
      finalQuote.push(...lines)
    }
  }

  finalQuote.push(...manualOrProtectedLines)

  if (
    finalQuote.length !== job.quote.length ||
    finalQuote.some((item, idx) => item !== job.quote[idx])
  ) {
    updated = true
  }

  job.quote = finalQuote
  return { added, updated }
}

/**
 * Calcula los totales detallados del presupuesto:
 * - Subtotal y cantidad total de días de Chapa
 * - Subtotal y cantidad total de paños de Pintura
 * - Subtotal de otros trabajos / repuestos
 * - Subtotales agrupados por pieza
 * - Subtotal general, descuento, neto, impuestos y total final
 */
export function computeDetailedBudgetTotals(job = {}) {
  const quoteLines = Array.isArray(job?.quote) ? job.quote : []
  let subtotal = 0
  let chapaSubtotal = 0
  let chapaDays = 0
  let chapaCount = 0
  let pinturaSubtotal = 0
  let pinturaPanels = 0
  let pinturaCount = 0
  let otherSubtotal = 0
  const pieceSubtotals = {}

  for (const rawLine of quoteLines) {
    const info = describeQuoteLine(rawLine)
    const lineTotal = info.subtotal
    subtotal += lineTotal

    if (info.workType === 'Chapa') {
      chapaSubtotal += lineTotal
      chapaDays += info.qty
      chapaCount += 1
    } else if (info.workType === 'Pintura') {
      pinturaSubtotal += lineTotal
      pinturaPanels += info.qty
      pinturaCount += 1
    } else {
      otherSubtotal += lineTotal
    }

    if (info.pieceKey) {
      if (!pieceSubtotals[info.pieceKey]) {
        pieceSubtotals[info.pieceKey] = {
          pieceKey: info.pieceKey,
          pieceName: info.pieceName || info.pieceKey,
          zoneName: info.zoneName || '',
          subtotal: 0,
          chapaSubtotal: 0,
          pinturaSubtotal: 0,
          otherSubtotal: 0,
          items: []
        }
      }
      const group = pieceSubtotals[info.pieceKey]
      group.subtotal += lineTotal
      if (info.workType === 'Chapa') group.chapaSubtotal += lineTotal
      else if (info.workType === 'Pintura') group.pinturaSubtotal += lineTotal
      else group.otherSubtotal += lineTotal
      group.items.push(info)
    }
  }

  const discountPct = toBounded(job?.discount ?? job?.discountPct, 0, 100)
  const taxPct = toBounded(job?.tax ?? job?.taxPct, 0, 100)
  const discount = (subtotal * discountPct) / 100
  const net = subtotal - discount
  const tax = (net * taxPct) / 100
  const total = net + tax

  return {
    mode: 'detailed',
    subtotal,
    chapaSubtotal,
    chapaDays: Math.round(chapaDays * 100) / 100,
    chapaCount,
    pinturaSubtotal,
    pinturaPanels: Math.round(pinturaPanels * 100) / 100,
    pinturaCount,
    otherSubtotal,
    pieceSubtotals,
    discount,
    discountAmount: discount,
    discountPct,
    net,
    tax,
    taxAmount: tax,
    taxPct,
    total,
    grandTotal: total
  }
}

/**
 * Calcula los totales en Modo A — Totalizar al final (para compañías de seguros / presentación resumida).
 * - Usa exclusivamente las cantidades y precios manuales de `job.summaryBudget` para Chapa y Pintura.
 * - Suma como repuestos y otros trabajos las líneas manuales (`!isInspectionPiece`).
 * - Conserva intactos `job.pieceQuotes` y las líneas por pieza de `job.quote` sin duplicar cargos.
 */
export function computeSummaryBudgetTotals(job = {}) {
  const sb = normalizeSummaryBudget(job?.summaryBudget)
  const quoteLines = Array.isArray(job?.quote) ? job.quote : []

  let otherSubtotal = 0
  const manualItems = []
  for (const rawLine of quoteLines) {
    if (!rawLine || typeof rawLine !== 'object') continue
    const info = describeQuoteLine(rawLine)
    if (!info.isInspectionPiece) {
      otherSubtotal += info.subtotal
      manualItems.push(info)
    }
  }

  const chapaSubtotal = sb.chapaSubtotal
  const pinturaSubtotal = sb.pinturaSubtotal
  const subtotal = chapaSubtotal + pinturaSubtotal + otherSubtotal

  const discountPct = toBounded(job?.discount ?? job?.discountPct, 0, 100)
  const taxPct = toBounded(job?.tax ?? job?.taxPct, 0, 100)
  const discount = (subtotal * discountPct) / 100
  const net = subtotal - discount
  const tax = (net * taxPct) / 100
  const total = net + tax

  return {
    mode: 'summary',
    subtotal,
    chapaSubtotal,
    chapaDays: sb.chapaDays,
    chapaDayPrice: sb.chapaDayPrice,
    chapaCount: sb.chapaDays > 0 || sb.chapaSubtotal > 0 ? 1 : 0,
    pinturaSubtotal,
    pinturaPanels: sb.pinturaPanels,
    pinturaPanelPrice: sb.pinturaPanelPrice,
    pinturaCount: sb.pinturaPanels > 0 || sb.pinturaSubtotal > 0 ? 1 : 0,
    otherSubtotal,
    manualItems,
    pieceSubtotals: {},
    discount,
    discountAmount: discount,
    discountPct,
    net,
    tax,
    taxAmount: tax,
    taxPct,
    total,
    grandTotal: total
  }
}

/**
 * Construye los renglones resumidos para mostrar en PDF / Impresión A4 / WhatsApp cuando el presupuesto está en Modo A.
 * Nunca inventa distribución por pieza cuando solo se cargaron cantidades generales.
 */
export function buildSummaryPresentationLines(job = {}) {
  const sb = normalizeSummaryBudget(job?.summaryBudget)
  const lines = []

  if (sb.chapaDays > 0 || sb.chapaSubtotal > 0) {
    const qtyFormatted = formatArQuantity(sb.chapaDays)
    lines.push({
      id: 'summary-chapa',
      isSummaryLine: true,
      workType: 'Chapa',
      workLabel: 'Chapa',
      description: 'Trabajo de chapa (Total días)',
      displayDescription: 'Trabajo de chapa (Total días)',
      qty: sb.chapaDays,
      qtyFormatted,
      unit: 'días',
      qtyWithUnit: `${qtyFormatted} días`,
      price: sb.chapaDayPrice,
      subtotal: sb.chapaSubtotal
    })
  }

  if (sb.pinturaPanels > 0 || sb.pinturaSubtotal > 0) {
    const qtyFormatted = formatArQuantity(sb.pinturaPanels)
    lines.push({
      id: 'summary-pintura',
      isSummaryLine: true,
      workType: 'Pintura',
      workLabel: 'Pintura',
      description: 'Trabajo de pintura (Total paños)',
      displayDescription: 'Trabajo de pintura (Total paños)',
      qty: sb.pinturaPanels,
      qtyFormatted,
      unit: 'paños',
      qtyWithUnit: `${qtyFormatted} paños`,
      price: sb.pinturaPanelPrice,
      subtotal: sb.pinturaSubtotal
    })
  }

  const quoteLines = Array.isArray(job?.quote) ? job.quote : []
  for (const rawLine of quoteLines) {
    if (!rawLine || typeof rawLine !== 'object') continue
    const info = describeQuoteLine(rawLine)
    if (!info.isInspectionPiece && (String(rawLine.description || '').trim() || info.subtotal > 0)) {
      lines.push({
        ...info,
        id: rawLine.id || 'manual-line',
        isSummaryLine: false,
        description: String(rawLine.description || '').trim() || info.displayDescription,
        displayDescription: String(rawLine.description || '').trim() || info.displayDescription,
        qtyFormatted: info.qtyFormatted,
        qtyWithUnit: rawLine.unit ? `${info.qtyFormatted} ${rawLine.unit}` : info.qtyFormatted
      })
    }
  }

  return lines
}

/**
 * Calcula los totales según el modo elegido en el presupuesto ('detailed' | 'summary') o un modo explícito.
 */
export function computeBudgetTotalsByMode(job = {}, modeOverride = null) {
  const mode = resolveBudgetMode(job, modeOverride)
  if (mode === 'summary') {
    return computeSummaryBudgetTotals(job)
  }
  return computeDetailedBudgetTotals(job)
}

/**
 * Verifica si un trabajo posee datos tanto en Modo A (resumido) como en Modo B (detallado)
 * y comprueba si sus totales coinciden o difieren, evitando mezclar totales distintos silenciosamente.
 */
export function checkBudgetModesConsistency(job = {}) {
  const sb = normalizeSummaryBudget(job?.summaryBudget)
  const quoteLines = Array.isArray(job?.quote) ? job.quote : []
  const pieceLines = quoteLines.filter(q => describeQuoteLine(q).isInspectionPiece)

  const hasSummaryChapaOrPintura = sb.chapaDays > 0 || sb.pinturaPanels > 0 || sb.chapaSubtotal > 0 || sb.pinturaSubtotal > 0
  const hasDetailedPieces = pieceLines.some(q => toSafeNumber(q?.qty) > 0 || toSafeNumber(q?.price) > 0)

  const summaryTotals = computeSummaryBudgetTotals(job)
  const detailedTotals = computeDetailedBudgetTotals(job)

  const bothPopulated = Boolean(hasSummaryChapaOrPintura && hasDetailedPieces)
  const difference = Math.round(Math.abs(summaryTotals.total - detailedTotals.total) * 100) / 100
  const consistent = !bothPopulated || difference < 0.01

  return {
    hasSummaryData: hasSummaryChapaOrPintura || summaryTotals.otherSubtotal > 0,
    hasSummaryChapaOrPintura,
    hasDetailedData: hasDetailedPieces || detailedTotals.otherSubtotal > 0,
    hasDetailedPieces,
    bothPopulated,
    hasBothModesData: bothPopulated,
    consistent,
    summaryTotal: summaryTotals.total,
    detailedTotal: detailedTotals.total,
    difference
  }
}
