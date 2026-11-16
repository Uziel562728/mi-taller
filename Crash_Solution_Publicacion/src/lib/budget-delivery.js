import { jsPDF } from 'jspdf'
import { formatCuit } from './workshop-profile.js'
import {
  resolveBudgetMode,
  resolvePaintType,
  resolveBudgetObservations,
  buildSummaryPresentationLines,
  formatArsCurrency,
  formatArQuantity,
  getVehicleYear,
  formatIsoDateAr,
  computeExpiryIsoDate,
  computeBudgetTotals,
  describeQuoteLine,
  validateBudgetForDelivery,
  normalizeWhatsappPhone,
  buildBudgetFilename,
  buildBudgetWhatsappMessage,
  buildWhatsappShareUrl,
  openWhatsappWithBudgetText
} from './budget-messages.js'
export * from './budget-messages.js'

const toSafeNumber = v => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0)

function detectImageFormatFromDataUrl(dataUrl) {
  const str = String(dataUrl || '')
  if (str.startsWith('data:image/png')) return 'PNG'
  if (str.startsWith('data:image/jpeg') || str.startsWith('data:image/jpg')) return 'JPEG'
  if (str.startsWith('data:image/webp')) return 'WEBP'
  return null
}

/**
 * Normaliza cadenas para fuentes PDF estándar (Helvetica WinAnsiEncoding),
 * reemplazando signos matemáticos fuera de Latin-1 (ej. U+2212) y espacios NBSP.
 */
function sanitizePdfText(value) {
  return String(value ?? '')
    .replace(/[\u00A0\u202F\t]+/g, ' ')
    .replace(/\u2212/g, '-')
    .replace(/\uFFFD/g, '')
    .normalize('NFC')
}

/**
 * Verifica que los bytes correspondan a un documento PDF válido (%PDF-1.x).
 */
export function verifyPdfBytesIntegrity(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 100) {
    return { valid: false, error: 'El documento PDF es inválido o está vacío.' }
  }
  // Cabecera estándar "%PDF-" (0x25, 0x50, 0x44, 0x46, 0x2D)
  const hasPdfHeader =
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  if (!hasPdfHeader) {
    return { valid: false, error: 'El documento generado no posee cabecera PDF válida.' }
  }
  return { valid: true, byteLength: bytes.byteLength }
}

/**
 * Genera el documento PDF real (instancia jsPDF) con logo, CUIT, datos del taller,
 * cliente, vehículo, tabla de trabajos/repuestos (en modo resumido o detallado),
 * tipo de pintura, totales, vigencia, observaciones y espacio para firma del taller emisor.
 */
export function createBudgetJsPdfDocument(job = {}, shop = {}, options = {}) {
  const check = validateBudgetForDelivery(job, options)
  if (!check.valid) {
    throw new Error(check.error)
  }

  const mode = resolveBudgetMode(job, options?.mode || null)
  const paintType = resolvePaintType(job)
  const observationsText = resolveBudgetObservations(job)

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = 210
  const pageHeight = 297
  const margin = 15
  const contentWidth = pageWidth - margin * 2
  let y = margin

  const shopName = sanitizePdfText(shop?.name || 'Crash Solution').trim() || 'Crash Solution'
  const legalName = sanitizePdfText(shop?.legal_name || '').trim()
  const cuit = shop?.tax_id ? formatCuit(shop.tax_id) : ''
  const quoteRef = String(job?.number || '').startsWith('LOCAL-')
    ? `Referencia ${String(job?.id || '').slice(0, 8).toUpperCase()}`
    : sanitizePdfText(job?.number || 'OT-0001')
  const d = job?.document || {}
  const issueDate = formatIsoDateAr(d.date)
  const validUntil = formatIsoDateAr(computeExpiryIsoDate(d))

  // 1. Encabezado del taller + Logo (si está disponible como Data URL PNG/JPEG/WEBP)
  let textStartX = margin
  const logoFormat = detectImageFormatFromDataUrl(shop?.logo_url)
  if (logoFormat && shop?.logo_url) {
    try {
      doc.addImage(shop.logo_url, logoFormat, margin, y, 22, 22)
      textStartX = margin + 26
    } catch {
      textStartX = margin
    }
  }

  doc.setTextColor(19, 44, 67)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.text(shopName.toUpperCase(), textStartX, y + 6)

  let leftY = y + 11
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(65, 84, 104)

  if (legalName) {
    doc.text(`Razón social: ${legalName}`, textStartX, leftY)
    leftY += 4.5
  }
  if (cuit) {
    doc.setFont('helvetica', 'bold')
    doc.text(`CUIT: ${cuit}`, textStartX, leftY)
    doc.setFont('helvetica', 'normal')
    leftY += 4.5
  }
  if (shop?.address) {
    doc.text(sanitizePdfText(shop.address), textStartX, leftY)
    leftY += 4.5
  }
  const phonesLine = [
    shop?.phone ? `Tel: ${sanitizePdfText(shop.phone)}` : '',
    shop?.whatsapp ? `WhatsApp: ${sanitizePdfText(shop.whatsapp)}` : ''
  ]
    .filter(Boolean)
    .join(' · ')
  if (phonesLine) {
    doc.text(phonesLine, textStartX, leftY)
    leftY += 4.5
  }
  if (shop?.email) {
    doc.text(`Email: ${sanitizePdfText(shop.email)}`, textStartX, leftY)
    leftY += 4.5
  }

  // Bloque derecho del encabezado (Metadatos del presupuesto)
  const rightX = pageWidth - margin
  doc.setTextColor(19, 44, 67)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('PRESUPUESTO', rightX, y + 6, { align: 'right' })

  doc.setFontSize(9.5)
  doc.text(quoteRef, rightX, y + 11.5, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.8)
  doc.setTextColor(85, 102, 120)
  doc.text(`Fecha de emisión: ${issueDate}`, rightX, y + 16.5, { align: 'right' })
  doc.text(`Válido hasta: ${validUntil}`, rightX, y + 21, { align: 'right' })
  if (job?.status) {
    doc.text(`Estado: ${sanitizePdfText(job.status)}`, rightX, y + 25.5, { align: 'right' })
  }

  y = Math.max(leftY, y + 28) + 3
  doc.setDrawColor(19, 44, 67)
  doc.setLineWidth(0.7)
  doc.line(margin, y, pageWidth - margin, y)
  y += 6

  // 2. Bloques de Cliente y Vehículo
  const boxHeight = 31
  const colWidth = (contentWidth - 6) / 2

  doc.setFillColor(244, 247, 251)
  doc.setDrawColor(225, 231, 237)
  doc.setLineWidth(0.3)
  doc.roundedRect(margin, y, colWidth, boxHeight, 2, 2, 'FD')
  doc.roundedRect(margin + colWidth + 6, y, colWidth, boxHeight, 2, 2, 'FD')

  // Datos del Cliente
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(113, 130, 149)
  doc.text('CLIENTE', margin + 4, y + 5.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(19, 44, 67)
  doc.text(sanitizePdfText(job?.rec?.cliente || 'Sin especificar').slice(0, 48), margin + 4, y + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.8)
  doc.setTextColor(65, 84, 104)
  let clientY = y + 16
  if (job?.rec?.telefono) {
    doc.text(`WhatsApp / Tel: ${sanitizePdfText(job.rec.telefono)}`, margin + 4, clientY)
    clientY += 4.8
  }
  const clientAddress = [job?.rec?.direccion, job?.rec?.localidad]
    .map(v => sanitizePdfText(v).trim())
    .filter(Boolean)
    .join(', ')
  if (clientAddress) {
    doc.text(clientAddress.slice(0, 52), margin + 4, clientY)
  }

  // Datos del Vehículo (Marca y modelo, Año, Patente, Kilometraje, Motivo)
  const vehX = margin + colWidth + 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(113, 130, 149)
  doc.text('VEHÍCULO', vehX, y + 5.5)

  const plateText = sanitizePdfText(job?.rec?.patente || '').trim().toUpperCase()
  const yearText = sanitizePdfText(getVehicleYear(job?.rec))
  const makeModelOnly = [job?.rec?.marca, job?.rec?.modelo]
    .map(v => sanitizePdfText(v || '').trim())
    .filter(Boolean)
    .join(' ')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.2)
  doc.setTextColor(19, 44, 67)
  const primaryVehicleLine = [
    makeModelOnly || 'Vehículo',
    yearText ? `(${yearText})` : '',
    plateText ? `· ${plateText}` : ''
  ]
    .filter(Boolean)
    .join(' ')
  doc.text(primaryVehicleLine.slice(0, 52), vehX, y + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.8)
  doc.setTextColor(65, 84, 104)
  let vehY = y + 16

  const plateAndYearLine = [
    plateText ? `Patente: ${plateText}` : '',
    yearText ? `Año: ${yearText}` : '',
    paintType ? `Pintura: ${sanitizePdfText(paintType)}` : ''
  ]
    .filter(Boolean)
    .join(' · ')
  if (plateAndYearLine) {
    doc.text(plateAndYearLine, vehX, vehY)
    vehY += 4.6
  }
  if (job?.rec?.km) {
    doc.text(`Kilometraje: ${sanitizePdfText(job.rec.km).trim()} km`, vehX, vehY)
    vehY += 4.6
  }
  if (job?.rec?.motivo) {
    doc.text(`Ingreso: ${sanitizePdfText(job.rec.motivo).slice(0, 48)}`, vehX, vehY)
  }

  y += boxHeight + 7

  // 3. Tabla de Trabajos y Repuestos (adaptada al modo elegido: resumido o detallado por ítem)
  const firstColHeader = mode === 'summary' ? 'CONCEPTO / TRABAJO' : 'PIEZA / INTERVENCIÓN'
  const renderTableHeader = currentY => {
    doc.setFillColor(237, 243, 253)
    doc.setDrawColor(217, 225, 233)
    doc.rect(margin, currentY, contentWidth, 8, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(40, 70, 110)
    doc.text(firstColHeader, margin + 3, currentY + 5.3)
    doc.text('CANT. / UNID.', margin + 112, currentY + 5.3, { align: 'right' })
    doc.text('PRECIO UNIT.', margin + 145, currentY + 5.3, { align: 'right' })
    doc.text('SUBTOTAL', pageWidth - margin - 3, currentY + 5.3, { align: 'right' })
    return currentY + 8
  }

  y = renderTableHeader(y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.2)
  doc.setTextColor(29, 51, 72)

  const tableRows =
    mode === 'summary'
      ? buildSummaryPresentationLines(job)
      : (job.quote || []).map(line => ({ rawLine: line, ...describeQuoteLine(line) }))

  for (const row of tableRows) {
    const descText = sanitizePdfText(row.displayDescription || row.description || '')
    const descLines = doc.splitTextToSize(descText, 88)
    const rowHeight = Math.max(8, descLines.length * 4.6 + 3.4)

    if (y + rowHeight > pageHeight - 55) {
      doc.addPage()
      y = margin
      y = renderTableHeader(y)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.2)
      doc.setTextColor(29, 51, 72)
    }

    const qtyDisplay =
      row.isSummaryLine || row.isInspectionPiece || row.rawLine?.unit || row.rawLine?.workType
        ? sanitizePdfText(`${formatArQuantity(row.qty)} ${row.unit}`)
        : sanitizePdfText(formatArQuantity(row.qty))

    doc.text(descLines, margin + 3, y + 5.2)
    doc.text(qtyDisplay, margin + 112, y + 5.2, { align: 'right' })
    doc.text(formatArsCurrency(row.price), margin + 145, y + 5.2, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.text(formatArsCurrency(row.subtotal), pageWidth - margin - 3, y + 5.2, { align: 'right' })
    doc.setFont('helvetica', 'normal')

    doc.setDrawColor(225, 231, 237)
    doc.setLineWidth(0.2)
    doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight)
    y += rowHeight
  }

  y += 5

  // 4. Cuadro de Totales (con resumen separado de Chapa y Pintura además del total general)
  const t = computeBudgetTotals(job, { mode })
  const extraSummaryRows =
    (paintType ? 1 : 0) +
    (t.chapaCount > 0 || t.chapaSubtotal > 0 ? 1 : 0) +
    (t.pinturaCount > 0 || t.pinturaSubtotal > 0 ? 1 : 0) +
    (t.otherSubtotal > 0 && (t.chapaCount > 0 || t.pinturaCount > 0) ? 1 : 0)
  if (y + 38 + extraSummaryRows * 6 > pageHeight - 25) {
    doc.addPage()
    y = margin
  }

  const totalsBoxWidth = 92
  const totalsBoxX = pageWidth - margin - totalsBoxWidth
  let totalsY = y

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.2)
  doc.setTextColor(65, 84, 104)

  if (paintType) {
    doc.setFont('helvetica', 'normal')
    doc.text('Tipo de pintura:', totalsBoxX, totalsY + 5)
    doc.setFont('helvetica', 'bold')
    doc.text(sanitizePdfText(paintType), pageWidth - margin, totalsY + 5, { align: 'right' })
    totalsY += 6
  }

  if (t.chapaCount > 0 || t.chapaSubtotal > 0) {
    doc.setFont('helvetica', 'normal')
    doc.text(sanitizePdfText(`Resumen Chapa (${formatArQuantity(t.chapaDays)} días):`), totalsBoxX, totalsY + 5)
    doc.setFont('helvetica', 'bold')
    doc.text(formatArsCurrency(t.chapaSubtotal), pageWidth - margin, totalsY + 5, { align: 'right' })
    totalsY += 6
  }

  if (t.pinturaCount > 0 || t.pinturaSubtotal > 0) {
    doc.setFont('helvetica', 'normal')
    doc.text(sanitizePdfText(`Resumen Pintura (${formatArQuantity(t.pinturaPanels)} paños):`), totalsBoxX, totalsY + 5)
    doc.setFont('helvetica', 'bold')
    doc.text(formatArsCurrency(t.pinturaSubtotal), pageWidth - margin, totalsY + 5, { align: 'right' })
    totalsY += 6
  }

  if (t.otherSubtotal > 0 && (t.chapaCount > 0 || t.pinturaCount > 0)) {
    doc.setFont('helvetica', 'normal')
    doc.text('Otros trabajos / repuestos:', totalsBoxX, totalsY + 5)
    doc.setFont('helvetica', 'bold')
    doc.text(formatArsCurrency(t.otherSubtotal), pageWidth - margin, totalsY + 5, { align: 'right' })
    totalsY += 6
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.text('Subtotal:', totalsBoxX, totalsY + 5)
  doc.setFont('helvetica', 'bold')
  doc.text(formatArsCurrency(t.subtotal), pageWidth - margin, totalsY + 5, { align: 'right' })
  totalsY += 6

  if (t.discount > 0) {
    doc.setFont('helvetica', 'normal')
    doc.text(`Descuento (${t.discountPct}%):`, totalsBoxX, totalsY + 5)
    doc.setFont('helvetica', 'bold')
    doc.text(`- ${formatArsCurrency(t.discount)}`, pageWidth - margin, totalsY + 5, { align: 'right' })
    totalsY += 6
  }

  if (t.tax > 0) {
    doc.setFont('helvetica', 'normal')
    doc.text(`Impuestos (${t.taxPct}%):`, totalsBoxX, totalsY + 5)
    doc.setFont('helvetica', 'bold')
    doc.text(formatArsCurrency(t.tax), pageWidth - margin, totalsY + 5, { align: 'right' })
    totalsY += 6
  }

  doc.setDrawColor(19, 44, 67)
  doc.setLineWidth(0.5)
  doc.line(totalsBoxX, totalsY + 2, pageWidth - margin, totalsY + 2)
  totalsY += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12.5)
  doc.setTextColor(19, 44, 67)
  doc.text('TOTAL:', totalsBoxX, totalsY)
  doc.text(formatArsCurrency(t.total), pageWidth - margin, totalsY, { align: 'right' })

  y = totalsY + 8

  // 5. Condiciones y Observaciones generales
  if (observationsText || paintType) {
    const combinedObs = [
      paintType ? `Sistema de pintura del vehículo: ${paintType}.` : '',
      observationsText
    ]
      .filter(Boolean)
      .join('\n')
    const termsLines = doc.splitTextToSize(sanitizePdfText(combinedObs).trim(), contentWidth - 6)
    const termsHeight = termsLines.length * 4.5 + 10
    if (y + termsHeight > pageHeight - 52) {
      doc.addPage()
      y = margin
    }
    doc.setFillColor(250, 251, 253)
    doc.setDrawColor(225, 231, 237)
    doc.roundedRect(margin, y, contentWidth, termsHeight, 2, 2, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(75, 101, 128)
    doc.text('CONDICIONES Y OBSERVACIONES', margin + 3, y + 5.2)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.8)
    doc.setTextColor(45, 65, 85)
    doc.text(termsLines, margin + 3, y + 10)
    y += termsHeight + 5
  }

  // 6. Espacio para firma del taller emisor (permite firma manual o sello cuando no existe firma digital; no exige firma del cliente ni inventa firmas ficticias)
  const sigBoxHeight = 26
  const sigBoxWidth = 82
  const sigBoxX = pageWidth - margin - sigBoxWidth
  if (y + sigBoxHeight > pageHeight - 22) {
    doc.addPage()
    y = margin + 6
  }
  const sigFormat = detectImageFormatFromDataUrl(shop?.signature_url)
  if (sigFormat && shop?.signature_url) {
    try {
      doc.addImage(shop.signature_url, sigFormat, sigBoxX + 18, y, 46, 13)
    } catch {
      // Mantiene el espacio en blanco para firma manual
    }
  }
  const sigLineY = y + 15
  doc.setDrawColor(120, 136, 154)
  doc.setLineWidth(0.35)
  doc.line(sigBoxX, sigLineY, pageWidth - margin, sigLineY)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.2)
  doc.setTextColor(19, 44, 67)
  doc.text('FIRMA Y SELLO DEL TALLER EMISOR', sigBoxX + sigBoxWidth / 2, sigLineY + 4.2, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.8)
  doc.setTextColor(85, 102, 120)
  const sigWorkshopLine = [shopName, legalName, cuit ? `CUIT ${cuit}` : ''].filter(Boolean).join(' · ')
  doc.text(sigWorkshopLine.slice(0, 62), sigBoxX + sigBoxWidth / 2, sigLineY + 8.2, { align: 'center' })
  y = sigLineY + 12

  // 7. Pie de página institucional
  const footerY = pageHeight - 13
  doc.setDrawColor(225, 231, 237)
  doc.setLineWidth(0.2)
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.8)
  doc.setTextColor(113, 130, 149)
  const footerSummary = [
    shopName,
    legalName,
    cuit ? `CUIT ${cuit}` : '',
    shop?.address ? sanitizePdfText(shop.address) : '',
    shop?.phone ? `Tel: ${sanitizePdfText(shop.phone)}` : '',
    shop?.whatsapp ? `WhatsApp: ${sanitizePdfText(shop.whatsapp)}` : '',
    shop?.email ? sanitizePdfText(shop.email) : ''
  ]
    .filter(Boolean)
    .join(' · ')
  doc.text(footerSummary.slice(0, 135), margin, footerY)
  doc.text(
    'Presupuesto estimativo sujeto al alcance indicado. Este documento no es una factura.',
    margin,
    footerY + 4
  )

  return doc
}

export function generateBudgetPdfBytes(job = {}, shop = {}, options = {}) {
  const doc = createBudgetJsPdfDocument(job, shop, options)
  const arrayBuffer = doc.output('arraybuffer')
  const bytes = new Uint8Array(arrayBuffer)
  const integrity = verifyPdfBytesIntegrity(bytes)
  if (!integrity.valid) {
    throw new Error(integrity.error || 'No se pudo verificar la integridad del documento PDF generado.')
  }
  return bytes
}

export function generateBudgetPdfBlob(job = {}, shop = {}, options = {}) {
  const bytes = generateBudgetPdfBytes(job, shop, options)
  return new Blob([bytes], { type: 'application/pdf' })
}

export function generateBudgetPdfFile(job = {}, shop = {}, options = {}) {
  const blob = generateBudgetPdfBlob(job, shop, options)
  const filename = buildBudgetFilename(job)
  return new File([blob], filename, { type: 'application/pdf' })
}

/**
 * Descarga de forma confiable el presupuesto PDF en Chrome (escritorio y móvil) y Android PWA.
 * Conserva el enlace en el DOM durante la activación del gestor de descargas del sistema
 * y difiere la revocación del ObjectURL para evitar descargas truncadas o canceladas en Android.
 */
export function downloadBudgetPdf(job = {}, shop = {}, docObj = globalThis.document, options = {}) {
  const blob = generateBudgetPdfBlob(job, shop, options)
  const filename = buildBudgetFilename(job)

  if (!blob || blob.size <= 0) {
    throw new Error('El archivo PDF generado está vacío. Revisá los datos del presupuesto.')
  }

  let triggered = false
  if (docObj?.createElement && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const url = URL.createObjectURL(blob)
    const anchor = docObj.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.rel = 'noopener'
    anchor.target = '_self'
    if (anchor.style) {
      anchor.style.display = 'none'
    }
    const container = docObj.body || docObj.documentElement
    container?.appendChild?.(anchor)
    anchor.click()
    triggered = true

    const removeTimer = setTimeout(() => {
      try {
        anchor.remove?.()
      } catch {
        // Ignorar si el nodo ya fue removido
      }
    }, 300)
    removeTimer?.unref?.()

    const revokeTimer = setTimeout(() => {
      try {
        URL.revokeObjectURL?.(url)
      } catch {
        // Ignorar error al revocar URL
      }
    }, 30000)
    revokeTimer?.unref?.()
  }

  return {
    downloaded: true,
    triggered,
    sentConfirmed: false,
    filename,
    size: blob.size,
    byteLength: blob.size,
    userMessage: `PDF generado y descargado correctamente ("${filename}").`
  }
}

/**
 * Permite compartir el archivo PDF real mediante Web Share API en dispositivos compatibles
 * (celulares Android/iOS y navegadores de escritorio compatibles).
 * Si el navegador no soporta compartir archivos directamente, descarga el PDF y abre WhatsApp
 * indicando claramente cómo adjuntarlo, sin afirmar jamás que fue enviado automáticamente.
 */
export async function shareBudgetPdf(
  job = {},
  shop = {},
  { navigatorObj = globalThis.navigator, windowObj = globalThis.window, documentObj = globalThis.document } = {}
) {
  const pdfFile = generateBudgetPdfFile(job, shop)
  const shopName = String(shop?.name || 'Crash Solution').trim()
  const plate = String(job?.rec?.patente || '').toUpperCase()
  const shareTitle = `Presupuesto ${plate} · ${shopName}`
  const shareText = `Presupuesto ${plate} preparado por ${shopName}.`

  if (
    navigatorObj &&
    typeof navigatorObj.canShare === 'function' &&
    typeof navigatorObj.share === 'function'
  ) {
    let canShareFiles = false
    try {
      canShareFiles = Boolean(navigatorObj.canShare({ files: [pdfFile] }))
    } catch {
      canShareFiles = false
    }

    if (canShareFiles) {
      try {
        await navigatorObj.share({
          files: [pdfFile],
          title: shareTitle,
          text: shareText
        })
        return {
          mode: 'web-share-file',
          filename: pdfFile.name,
          sentConfirmed: false,
          userMessage: `Menú de compartir completado para "${pdfFile.name}". Verificá la entrega en la aplicación elegida.`
        }
      } catch (err) {
        if (err?.name === 'AbortError') {
          return {
            mode: 'cancelled',
            filename: pdfFile.name,
            sentConfirmed: false,
            userMessage: 'Se canceló el menú para compartir el PDF.'
          }
        }
        throw new Error(
          `No se pudo compartir el archivo PDF "${pdfFile.name}" directamente desde este navegador. Usá «Descargar / Imprimir» para guardar el PDF y adjuntalo manualmente.`
        )
      }
    }
  }

  // Fallback para escritorio o navegadores sin soporte de Web Share API para archivos:
  // descarga el PDF real y abre WhatsApp con el resumen preparado para que el taller adjunte el archivo descargado.
  downloadBudgetPdf(job, shop, documentObj)
  const waUrl = buildWhatsappShareUrl(job, shop)
  if (windowObj?.open) {
    windowObj.open(waUrl, '_blank', 'noopener,noreferrer')
  }

  return {
    mode: 'download-and-whatsapp',
    filename: pdfFile.name,
    sentConfirmed: false,
    url: waUrl,
    userMessage: `Se descargó "${pdfFile.name}" y se abrió WhatsApp. Adjuntá el PDF descargado y confirmá el envío en WhatsApp.`
  }
}
