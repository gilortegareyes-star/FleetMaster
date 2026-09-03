import { FileUp, X } from "lucide-react"
import { useMemo, useState, type FormEvent } from "react"
import type { InsurancePolicyFormValues, InsurancePolicyPayload } from "../types/vehicleDocument"
import type { Vehicle } from "../types/vehicle"
import { formatCurrency } from "../utils/formatters"

type InsurancePolicyFormErrors = Partial<Record<keyof InsurancePolicyFormValues, string>>

interface InsurancePolicyFormProps {
  vehicle: Vehicle
  isSaving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (payload: InsurancePolicyPayload) => Promise<void>
}

const emptyValues: InsurancePolicyFormValues = {
  issuer: "",
  documentNumber: "",
  validFrom: "",
  validUntil: "",
  cost: "",
  contactName: "",
  contactPhone: "",
  notes: "",
  file: null,
}

const allowedMimeTypes = ["application/pdf", "image/jpeg", "image/png"]
const maxFileSize = 10 * 1024 * 1024

const parseNumber = (value: string) => {
  if (value.trim() === "") {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

const isDateValue = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

export function InsurancePolicyForm({
  vehicle,
  isSaving,
  error,
  onClose,
  onSubmit,
}: InsurancePolicyFormProps) {
  const [values, setValues] = useState<InsurancePolicyFormValues>(emptyValues)
  const [errors, setErrors] = useState<InsurancePolicyFormErrors>({})

  const costPreview = useMemo(() => {
    const parsed = parseNumber(values.cost)
    return parsed === null || Number.isNaN(parsed) ? "$0.00" : formatCurrency(parsed)
  }, [values.cost])

  const updateValue = (field: keyof InsurancePolicyFormValues, value: string | File | null) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const validate = () => {
    const nextErrors: InsurancePolicyFormErrors = {}
    const parsedCost = parseNumber(values.cost)

    if (!values.issuer.trim()) {
      nextErrors.issuer = "La aseguradora es obligatoria."
    }

    if (!values.documentNumber.trim()) {
      nextErrors.documentNumber = "El número de póliza es obligatorio."
    }

    if (values.validFrom && !isDateValue(values.validFrom)) {
      nextErrors.validFrom = "Usa el formato AAAA-MM-DD."
    }

    if (!values.validUntil) {
      nextErrors.validUntil = "El fin de vigencia es obligatorio."
    } else if (!isDateValue(values.validUntil)) {
      nextErrors.validUntil = "Usa el formato AAAA-MM-DD."
    }

    if (
      values.validFrom &&
      values.validUntil &&
      isDateValue(values.validFrom) &&
      isDateValue(values.validUntil) &&
      values.validFrom > values.validUntil
    ) {
      nextErrors.validFrom = "El inicio no puede ser posterior al fin de vigencia."
    }

    if (Number.isNaN(parsedCost) || (parsedCost !== null && parsedCost < 0)) {
      nextErrors.cost = "Ingresa un costo válido."
    }

    if (!values.file) {
      nextErrors.file = "Selecciona el archivo de la póliza."
    } else if (!allowedMimeTypes.includes(values.file.type)) {
      nextErrors.file = "El archivo debe ser PDF, JPG, JPEG o PNG."
    } else if (values.file.size <= 0 || values.file.size > maxFileSize) {
      nextErrors.file = "El archivo no debe superar 10 MB."
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!validate() || !values.file) {
      return
    }

    const parsedCost = parseNumber(values.cost)

    await onSubmit({
      vehicleId: vehicle.id,
      issuer: values.issuer.trim(),
      documentNumber: values.documentNumber.trim(),
      validFrom: values.validFrom || null,
      validUntil: values.validUntil,
      cost: parsedCost,
      contactName: values.contactName.trim() || null,
      contactPhone: values.contactPhone.trim() || null,
      notes: values.notes.trim() || null,
      file: values.file,
    })
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="vehicle-form insurance-policy-form" onSubmit={handleSubmit}>
        <header className="vehicle-form__header">
          <div>
            <p>Póliza de seguro</p>
            <h2>Subir póliza</h2>
            <span>{vehicle.internalCode}</span>
          </div>
          <button aria-label="Cerrar formulario" className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        {error ? <div className="form-banner">{error}</div> : null}

        <section className="form-section">
          <h3>Datos de la póliza</h3>
          <div className="form-grid">
            <label className="field">
              <span>Aseguradora *</span>
              <input
                onChange={(event) => updateValue("issuer", event.target.value)}
                value={values.issuer}
              />
              {errors.issuer ? <em>{errors.issuer}</em> : null}
            </label>

            <label className="field">
              <span>Número de póliza *</span>
              <input
                onChange={(event) => updateValue("documentNumber", event.target.value)}
                value={values.documentNumber}
              />
              {errors.documentNumber ? <em>{errors.documentNumber}</em> : null}
            </label>

            <label className="field">
              <span>Inicio de vigencia</span>
              <input
                inputMode="numeric"
                onChange={(event) => updateValue("validFrom", event.target.value)}
                placeholder="AAAA-MM-DD"
                value={values.validFrom}
              />
              {errors.validFrom ? <em>{errors.validFrom}</em> : null}
            </label>

            <label className="field">
              <span>Fin de vigencia *</span>
              <input
                inputMode="numeric"
                onChange={(event) => updateValue("validUntil", event.target.value)}
                placeholder="AAAA-MM-DD"
                value={values.validUntil}
              />
              {errors.validUntil ? <em>{errors.validUntil}</em> : null}
            </label>

            <label className="field">
              <span>Costo de la póliza</span>
              <input
                inputMode="decimal"
                min="0"
                onChange={(event) => updateValue("cost", event.target.value)}
                step="0.01"
                type="number"
                value={values.cost}
              />
              <small>{costPreview}</small>
              {errors.cost ? <em>{errors.cost}</em> : null}
            </label>

            <label className="field">
              <span>Agente / contacto</span>
              <input
                onChange={(event) => updateValue("contactName", event.target.value)}
                value={values.contactName}
              />
            </label>

            <label className="field">
              <span>Teléfono</span>
              <input
                onChange={(event) => updateValue("contactPhone", event.target.value)}
                value={values.contactPhone}
              />
            </label>
          </div>
        </section>

        <section className="form-section">
          <h3>Archivo</h3>
          <label className="file-dropzone">
            <FileUp aria-hidden="true" size={24} />
            <span>Archivo de póliza *</span>
            <strong>{values.file ? values.file.name : "Selecciona PDF, JPG, JPEG o PNG"}</strong>
            <small>Máximo 10 MB</small>
            <input
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={(event) => updateValue("file", event.target.files?.[0] ?? null)}
              type="file"
            />
          </label>
          {errors.file ? <em className="file-error">{errors.file}</em> : null}
        </section>

        <section className="form-section">
          <h3>Notas</h3>
          <div className="form-grid form-grid--single">
            <label className="field">
              <span>Notas</span>
              <textarea
                onChange={(event) => updateValue("notes", event.target.value)}
                value={values.notes}
              />
            </label>
          </div>
        </section>

        <footer className="vehicle-form__footer">
          <button className="button button--secondary" onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="button button--primary" disabled={isSaving} type="submit">
            {isSaving ? "Guardando..." : "Guardar póliza"}
          </button>
        </footer>
      </form>
    </div>
  )
}
