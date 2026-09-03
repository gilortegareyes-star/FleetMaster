import { X } from "lucide-react"
import { useMemo, useState } from "react"
import {
  maintenanceTypes,
  type MaintenanceFormValues,
  type MaintenancePayload,
  type MaintenanceRecord,
} from "../types/maintenance"
import type { Vehicle } from "../types/vehicle"
import { formatCurrency } from "../utils/formatters"

type MaintenanceFormErrors = Partial<Record<keyof MaintenanceFormValues, string>>

interface MaintenanceFormProps {
  mode: "create" | "edit"
  vehicle: Vehicle
  maintenance?: MaintenanceRecord
  isSaving: boolean
  error: string | null
  structuredTotal?: number | null
  onClose: () => void
  onSubmit: (payload: MaintenancePayload) => Promise<void>
}

const emptyValues: MaintenanceFormValues = {
  serviceDate: "",
  mileage: "",
  maintenanceType: "",
  description: "",
  provider: "",
  totalCost: "",
  nextServiceMileage: "",
  nextServiceDate: "",
  notes: "",
}

const valuesFromMaintenance = (maintenance?: MaintenanceRecord): MaintenanceFormValues => {
  if (!maintenance) {
    return {
      ...emptyValues,
      serviceDate: new Date().toISOString().slice(0, 10),
    }
  }

  return {
    serviceDate: maintenance.serviceDate,
    mileage: maintenance.mileage === null ? "" : String(maintenance.mileage),
    maintenanceType: maintenance.maintenanceType,
    description: maintenance.description ?? "",
    provider: maintenance.provider ?? "",
    totalCost: maintenance.totalCost === null ? "" : String(maintenance.totalCost),
    nextServiceMileage: maintenance.nextServiceMileage === null ? "" : String(maintenance.nextServiceMileage),
    nextServiceDate: maintenance.nextServiceDate ?? "",
    notes: maintenance.notes ?? "",
  }
}

const parseNumber = (value: string) => {
  if (value.trim() === "") {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function MaintenanceForm({
  mode,
  vehicle,
  maintenance,
  isSaving,
  error,
  structuredTotal = null,
  onClose,
  onSubmit,
}: MaintenanceFormProps) {
  const [values, setValues] = useState<MaintenanceFormValues>(() => valuesFromMaintenance(maintenance))
  const [errors, setErrors] = useState<MaintenanceFormErrors>({})

  const hasStructuredCosts = structuredTotal !== null
  const costPreview = useMemo(() => {
    if (hasStructuredCosts) {
      return formatCurrency(structuredTotal)
    }

    const parsed = parseNumber(values.totalCost)
    return parsed === null || Number.isNaN(parsed) ? "$0.00" : formatCurrency(parsed)
  }, [hasStructuredCosts, structuredTotal, values.totalCost])

  const title = mode === "create" ? "Registrar mantenimiento" : "Editar mantenimiento"

  const updateValue = (field: keyof MaintenanceFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const validate = () => {
    const nextErrors: MaintenanceFormErrors = {}
    const mileage = parseNumber(values.mileage)
    const totalCost = parseNumber(values.totalCost)
    const nextMileage = parseNumber(values.nextServiceMileage)

    if (!values.serviceDate) {
      nextErrors.serviceDate = "La fecha del servicio es obligatoria."
    }

    if (!values.mileage.trim()) {
      nextErrors.mileage = "El kilometraje del servicio es obligatorio."
    } else if (mileage === null || Number.isNaN(mileage) || mileage < 0 || !Number.isInteger(mileage)) {
      nextErrors.mileage = "Ingresa un kilometraje mayor o igual a 0."
    }

    if (!values.maintenanceType) {
      nextErrors.maintenanceType = "Selecciona el tipo de mantenimiento."
    }

    if (!values.description.trim()) {
      nextErrors.description = "Describe el trabajo realizado."
    }

    if (totalCost !== null && (Number.isNaN(totalCost) || totalCost < 0)) {
      nextErrors.totalCost = "El costo debe ser mayor o igual a 0."
    }

    if (nextMileage !== null) {
      if (Number.isNaN(nextMileage) || nextMileage < 0 || !Number.isInteger(nextMileage)) {
        nextErrors.nextServiceMileage = "Ingresa un kilometraje mayor o igual a 0."
      } else if (mileage !== null && !Number.isNaN(mileage) && nextMileage <= mileage) {
        nextErrors.nextServiceMileage = "Debe ser mayor al kilometraje del servicio."
      }
    }

    setErrors(nextErrors)
    return nextErrors
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validate()

    if (Object.keys(nextErrors).length > 0 || !values.maintenanceType) {
      return
    }

    const payload: MaintenancePayload = {
      vehicleId: vehicle.id,
      serviceDate: values.serviceDate,
      mileage: Number(values.mileage),
      maintenanceType: values.maintenanceType,
      description: values.description,
      provider: values.provider.trim() || null,
      totalCost: hasStructuredCosts ? structuredTotal : parseNumber(values.totalCost),
      nextServiceMileage: parseNumber(values.nextServiceMileage),
      nextServiceDate: values.nextServiceDate || null,
      notes: values.notes.trim() || null,
    }

    await onSubmit(payload)
  }

  return (
    <div aria-modal="true" className="modal-backdrop" role="dialog">
      <form className="vehicle-form" onSubmit={handleSubmit}>
        <header className="vehicle-form__header">
          <div>
            <p>{vehicle.internalCode}</p>
            <h2>{title}</h2>
          </div>
          <button aria-label="Cerrar formulario" className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        {error ? <div className="form-banner">{error}</div> : null}

        <section className="form-section">
          <h3>Servicio</h3>
          <div className="form-grid">
            <Field error={errors.serviceDate} label="Fecha del servicio *">
              <input
                onChange={(event) => updateValue("serviceDate", event.target.value)}
                type="date"
                value={values.serviceDate}
              />
            </Field>
            <Field error={errors.mileage} label="Kilometraje del servicio *">
              <div className="with-unit">
                <input
                  inputMode="numeric"
                  onChange={(event) => updateValue("mileage", event.target.value)}
                  placeholder="82650"
                  value={values.mileage}
                />
                <span>km</span>
              </div>
            </Field>
            <Field error={errors.maintenanceType} label="Tipo de mantenimiento *">
              <select
                onChange={(event) => updateValue("maintenanceType", event.target.value)}
                value={values.maintenanceType}
              >
                <option value="">Seleccionar</option>
                {maintenanceTypes.map((maintenanceType) => (
                  <option key={maintenanceType} value={maintenanceType}>
                    {maintenanceType}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Taller / proveedor">
              <input
                onChange={(event) => updateValue("provider", event.target.value)}
                placeholder="Taller central"
                value={values.provider}
              />
            </Field>
          </div>
        </section>

        <section className="form-section">
          <h3>Trabajo realizado</h3>
          <div className="form-grid form-grid--single">
            <Field error={errors.description} label="Descripción / trabajo realizado *">
              <textarea
                onChange={(event) => updateValue("description", event.target.value)}
                placeholder="Describe el servicio realizado"
                rows={4}
                value={values.description}
              />
            </Field>
          </div>
        </section>

        <section className="form-section">
          <h3>Costo y próximo servicio</h3>
          <div className="form-grid">
            <Field error={errors.totalCost} label="Costo total">
              <input
                aria-describedby={hasStructuredCosts ? "structured-total-help" : undefined}
                disabled={hasStructuredCosts}
                inputMode="decimal"
                onChange={(event) => updateValue("totalCost", event.target.value)}
                placeholder="3500"
                value={values.totalCost}
              />
              <small>{costPreview}</small>
              {hasStructuredCosts ? <small id="structured-total-help">El costo total se calcula desde el informe de mantenimiento.</small> : null}
            </Field>
            <Field error={errors.nextServiceMileage} label="Próximo servicio por kilometraje">
              <div className="with-unit">
                <input
                  inputMode="numeric"
                  onChange={(event) => updateValue("nextServiceMileage", event.target.value)}
                  placeholder="90000"
                  value={values.nextServiceMileage}
                />
                <span>km</span>
              </div>
            </Field>
            <Field label="Próximo servicio por fecha">
              <input
                onChange={(event) => updateValue("nextServiceDate", event.target.value)}
                type="date"
                value={values.nextServiceDate}
              />
            </Field>
          </div>
        </section>

        <section className="form-section">
          <h3>Notas</h3>
          <div className="form-grid form-grid--single">
            <Field label="Notas">
              <textarea
                onChange={(event) => updateValue("notes", event.target.value)}
                placeholder="Observaciones internas"
                rows={3}
                value={values.notes}
              />
            </Field>
          </div>
        </section>

        <footer className="vehicle-form__footer">
          <button className="button button--secondary" onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="button button--primary" disabled={isSaving} type="submit">
            {isSaving ? "Guardando..." : "Guardar mantenimiento"}
          </button>
        </footer>
      </form>
    </div>
  )
}

function Field({
  children,
  error,
  label,
}: {
  children: React.ReactNode
  error?: string
  label: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? <em>{error}</em> : null}
    </label>
  )
}
