const SETTINGS_STORAGE_PREFIX = 'mitaller_workshop_settings_v1:'

export const DEFAULT_WORKSHOP_SETTINGS = Object.freeze({
  defaultValidDays: 15,
  defaultTaxPct: 0,
  defaultTerms: '',
  defaultVehicleType: 'sedan',
  autoExpandDamageDetails: true
})

const VALID_VEHICLE_TYPES = ['sedan', 'coupe', 'pickup', 'van']

/**
 * Registro extensible de grupos y definiciones de parámetros.
 * Permite incorporar nuevos parámetros operativos en el futuro sin rehacer la estructura.
 */
export const SETTINGS_PARAMETER_GROUPS = [
  {
    id: 'budget_defaults',
    title: 'Parámetros predeterminados de presupuestos',
    description: 'Valores iniciales aplicados automáticamente al crear un nuevo trabajo o presupuesto.',
    parameters: [
      {
        key: 'defaultValidDays',
        label: 'Vigencia predeterminada (días)',
        type: 'number',
        min: 1,
        max: 365,
        defaultValue: 15
      },
      {
        key: 'defaultTaxPct',
        label: 'Impuesto / IVA predeterminado (%)',
        type: 'number',
        min: 0,
        max: 100,
        step: 0.01,
        defaultValue: 0
      },
      {
        key: 'defaultTerms',
        label: 'Condiciones y observaciones predeterminadas',
        type: 'textarea',
        maxLength: 500,
        defaultValue: ''
      }
    ]
  },
  {
    id: 'workflow',
    title: 'Preferencias operativas de recepción e inspección',
    description: 'Ajustes de flujo de trabajo diario en el taller.',
    parameters: [
      {
        key: 'defaultVehicleType',
        label: 'Tipo de vehículo inicial en recepción',
        type: 'select',
        options: [
          { value: 'sedan', label: 'Sedán 4 puertas' },
          { value: 'coupe', label: 'Coupé 2 puertas' },
          { value: 'pickup', label: 'Camioneta con caja' },
          { value: 'van', label: 'Van 3 filas' }
        ],
        defaultValue: 'sedan'
      },
      {
        key: 'autoExpandDamageDetails',
        label: 'Desplegar detalles automáticamente al marcar daño en una pieza',
        type: 'boolean',
        defaultValue: true
      }
    ]
  }
]

const customParameters = new Map()

export function registerSettingParameter(groupId, parameterDefinition) {
  if (!groupId || !parameterDefinition?.key) {
    throw new Error('Definición de parámetro inválida.')
  }
  const normalizedGroupId = groupId === 'budget' ? 'budget_defaults' : groupId
  let group = SETTINGS_PARAMETER_GROUPS.find(g => g.id === normalizedGroupId)
  if (!group) {
    group = {
      id: normalizedGroupId,
      title: parameterDefinition.groupTitle || normalizedGroupId,
      description: parameterDefinition.groupDescription || '',
      parameters: []
    }
    SETTINGS_PARAMETER_GROUPS.push(group)
  }
  const existingIdx = group.parameters.findIndex(p => p.key === parameterDefinition.key)
  if (existingIdx >= 0) group.parameters[existingIdx] = { ...parameterDefinition }
  else group.parameters.push({ ...parameterDefinition })
  customParameters.set(parameterDefinition.key, { ...parameterDefinition, groupId: normalizedGroupId })
  return { registered: true, parameter: { ...parameterDefinition } }
}

export function getSettingsSchema() {
  return SETTINGS_PARAMETER_GROUPS.map(group => ({
    ...group,
    parameters: group.parameters.map(param => ({ ...param }))
  }))
}

function getStorageKey(workshopId) {
  return `${SETTINGS_STORAGE_PREFIX}${workshopId ? String(workshopId) : 'global'}`
}

export function validateWorkshopSettings(input = {}) {
  const validDaysNum = Number(input.defaultValidDays ?? DEFAULT_WORKSHOP_SETTINGS.defaultValidDays)
  if (!Number.isFinite(validDaysNum) || validDaysNum < 1 || validDaysNum > 365) {
    return {
      valid: false,
      error: 'La vigencia predeterminada debe estar entre 1 y 365 días.'
    }
  }

  const taxPctNum = Number(input.defaultTaxPct ?? DEFAULT_WORKSHOP_SETTINGS.defaultTaxPct)
  if (!Number.isFinite(taxPctNum) || taxPctNum < 0 || taxPctNum > 100) {
    return {
      valid: false,
      error: 'El porcentaje de impuesto predeterminado debe estar entre 0% y 100%.'
    }
  }

  const defaultTerms = String(input.defaultTerms ?? DEFAULT_WORKSHOP_SETTINGS.defaultTerms).trim()
  if (defaultTerms.length > 500) {
    return {
      valid: false,
      error: 'Las condiciones predeterminadas no pueden superar los 500 caracteres.'
    }
  }

  const defaultVehicleType = String(
    input.defaultVehicleType || DEFAULT_WORKSHOP_SETTINGS.defaultVehicleType
  ).trim()
  if (!VALID_VEHICLE_TYPES.includes(defaultVehicleType)) {
    return {
      valid: false,
      error: 'Seleccioná un tipo de vehículo predeterminado válido.'
    }
  }

  const autoExpandDamageDetails =
    input.autoExpandDamageDetails === undefined
      ? DEFAULT_WORKSHOP_SETTINGS.autoExpandDamageDetails
      : Boolean(input.autoExpandDamageDetails)

  const extraValues = {}
  for (const [key, def] of customParameters.entries()) {
    if (input[key] !== undefined) {
      extraValues[key] = input[key]
    } else if (def.defaultValue !== undefined) {
      extraValues[key] = def.defaultValue
    }
  }

  return {
    valid: true,
    values: {
      defaultValidDays: Math.round(validDaysNum),
      defaultTaxPct: Math.round(taxPctNum * 100) / 100,
      defaultTerms,
      defaultVehicleType,
      autoExpandDamageDetails,
      ...extraValues
    }
  }
}

export function getWorkshopSettings(workshopId = null, storage = globalThis.localStorage) {
  const defaults = {
    ...DEFAULT_WORKSHOP_SETTINGS,
    ...Object.fromEntries([...customParameters.entries()].map(([k, v]) => [k, v.defaultValue]))
  }
  if (!storage || typeof storage.getItem !== 'function') return defaults
  try {
    const raw = storage.getItem(getStorageKey(workshopId))
    if (!raw) return defaults
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return defaults
    const check = validateWorkshopSettings({ ...defaults, ...parsed })
    return check.valid ? check.values : defaults
  } catch {
    return defaults
  }
}

export function saveWorkshopSettings(workshopId = null, input = {}, storage = globalThis.localStorage) {
  const current = getWorkshopSettings(workshopId, storage)
  const check = validateWorkshopSettings({ ...current, ...input })
  if (!check.valid) {
    return { valid: false, error: check.error }
  }
  if (storage && typeof storage.setItem === 'function') {
    storage.setItem(getStorageKey(workshopId), JSON.stringify(check.values))
  }
  return { valid: true, values: check.values, ...check.values }
}
