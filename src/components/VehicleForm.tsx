import { X } from "lucide-react"
import { useMemo, useState } from "react"
import { fuelTypes, vehicleStatuses, type Vehicle, type VehicleFormValues, type VehiclePayload } from "../types/vehicle"
import { formatCurrency } from "../utils/formatters"

type VehicleFormErrors = Partial<Record<keyof VehicleFormValues, string>>

interface VehicleFormProps {
  mode: "create" | "edit"
  vehicle?: Vehicle
  vehicles: Vehicle[]
  isSaving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (payload: VehiclePayload) => Promise<void>
}

const currentYear = new Date().getFullYear()
const minVehicleYear = 1950
const maxVehicleYear = currentYear + 1

const emptyValues: VehicleFormValues = {
  internalCode: "",
  brand: "",
  model: "",
  version: "",
  year: "",
  vin: "",
  licensePlate: "",
  engineNumber: "",
  color: "",
  fuelType: "",
  tankCapacityLiters: "",
  acquisitionDate: "",
  acquisitionPrice: "",
  currentMileage: "",
  status: "Activo",
}

const valuesFromVehicle = (vehicle?: Vehicle): VehicleFormValues => {
  if (!vehicle) {
    return emptyValues
  }

  return {
    internalCode: vehicle.internalCode,
    brand: vehicle.brand,
    model: vehicle.model,
    version: vehicle.version ?? "",
    year: String(vehicle.year),
    vin: vehicle.vin,
    licensePlate: vehicle.licensePlate ?? "",
    engineNumber: vehicle.engineNumber ?? "",
    color: vehicle.color ?? "",
    fuelType: vehicle.fuelType,
    tankCapacityLiters: vehicle.tankCapacityLiters === null ? "" : String(vehicle.tankCapacityLiters),
    acquisitionDate: vehicle.acquisitionDate ?? "",
    acquisitionPrice: vehicle.acquisitionPrice === null ? "" : String(vehicle.acquisitionPrice),
    currentMileage: String(vehicle.currentMileage),
    status: vehicle.status,
  }
}

const normalize = (value: string) => value.trim().toLowerCase()

const parseNumber = (value: string) => {
  if (value.trim() === "") {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function VehicleForm({
  mode,
  vehicle,
  vehicles,
  isSaving,
  error,
  onClose,
  onSubmit,
}: VehicleFormProps) {
  const [values, setValues] = useState<VehicleFormValues>(() => valuesFromVehicle(vehicle))
  const [errors, setErrors] = useState<VehicleFormErrors>({})

  const acquisitionPricePreview = useMemo(() => {
    const parsed = parseNumber(values.acquisitionPrice)
    return parsed === null || Number.isNaN(parsed) ? "$0.00" : formatCurrency(parsed)
  }, [values.acquisitionPrice])

  const title = mode === "create" ? "Nueva unidad" : `Editar ${vehicle?.internalCode ?? "unidad"}`

  const updateValue = (field: keyof VehicleFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const validate = () => {
    const nextErrors: VehicleFormErrors = {}
    const year = Number(values.year)
    const currentMileage = parseNumber(values.currentMileage)
    const tankCapacity = parseNumber(values.tankCapacityLiters)
    const acquisitionPrice = parseNumber(values.acquisitionPrice)
    const duplicateCode = vehicles.some(
      (item) => item.id !== vehicle?.id && normalize(item.internalCode) === normalize(values.internalCode),
    )
    const duplicateVin = vehicles.some((item) => item.id !== vehicle?.id && normalize(item.vin) === normalize(values.vin))

    if (!values.internalCode.trim()) {
      nextErrors.internalCode = "El código interno es obligatorio."
    } else if (duplicateCode) {
      nextErrors.internalCode = "Ya existe una unidad con este código interno."
    }

    if (!values.brand.trim()) {
      nextErrors.brand = "La marca es obligatoria."
    }

    if (!values.model.trim()) {
      nextErrors.model = "El modelo es obligatorio."
    }

    if (!values.year.trim()) {
      nextErrors.year = "El año es obligatorio."
    } else if (!Number.isInteger(year) || year < minVehicleYear || year > maxVehicleYear) {
      nextErrors.year = `Usa un año entre ${minVehicleYear} y ${maxVehicleYear}.`
    }

    if (!values.vin.trim()) {
      nextErrors.vin = "El VIN es obligatorio."
    } else if (duplicateVin) {
      nextErrors.vin = "Ya existe una unidad con este VIN."
    }

    if (!values.fuelType) {
      nextErrors.fuelType = "Selecciona el tipo de combustible."
    }

    if (!values.currentMileage.trim()) {
      nextErrors.currentMileage = "El kilometraje es obligatorio."
    } else if (currentMileage === null || Number.isNaN(currentMileage) || currentMileage < 0) {
      nextErrors.currentMileage = "Ingresa un kilometraje mayor o igual a 0."
    }

    if (tankCapacity !== null && (Number.isNaN(tankCapacity) || tankCapacity < 0)) {
      nextErrors.tankCapacityLiters = "La capacidad debe ser mayor o igual a 0."
    }

    if (acquisitionPrice !== null && (Number.isNaN(acquisitionPrice) || acquisitionPrice < 0)) {
      nextErrors.acquisitionPrice = "El precio debe ser mayor o igual a 0."
    }

    if (!values.status) {
      nextErrors.status = "Selecciona el estatus."
    }

    setErrors(nextErrors)
    return nextErrors
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validate()

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    if (!values.fuelType || !values.status) {
      return
    }

    const payload: VehiclePayload = {
      internalCode: values.internalCode,
      brand: values.brand,
      model: values.model,
      version: values.version.trim() || null,
      year: Number(values.year),
      vin: values.vin,
      licensePlate: values.licensePlate.trim() || null,
      engineNumber: values.engineNumber.trim() || null,
      color: values.color.trim() || null,
      fuelType: values.fuelType,
      tankCapacityLiters: parseNumber(values.tankCapacityLiters),
      acquisitionDate: values.acquisitionDate || null,
      acquisitionPrice: parseNumber(values.acquisitionPrice),
      currentMileage: Number(values.currentMileage),
      status: values.status,
    }

    await onSubmit(payload)
  }

  return (
    <div aria-modal="true" className="modal-backdrop" role="dialog">
      <form className="vehicle-form" onSubmit={handleSubmit}>
        <header className="vehicle-form__header">
          <div>
            <p>Unidades</p>
            <h2>{title}</h2>
          </div>
          <button aria-label="Cerrar formulario" className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        {error ? <div className="form-banner">{error}</div> : null}

        <section className="form-section">
          <h3>Identificacion</h3>
          <div className="form-grid">
            <Field error={errors.internalCode} label="Código interno *">
              <input
                autoFocus
                onChange={(event) => updateValue("internalCode", event.target.value)}
                placeholder="G1"
                value={values.internalCode}
              />
            </Field>
            <Field error={errors.brand} label="Marca *">
              <input onChange={(event) => updateValue("brand", event.target.value)} placeholder="Mazda" value={values.brand} />
            </Field>
            <Field error={errors.model} label="Modelo *">
              <input onChange={(event) => updateValue("model", event.target.value)} placeholder="3" value={values.model} />
            </Field>
            <Field label="Version">
              <input
                onChange={(event) => updateValue("version", event.target.value)}
                placeholder="Signature"
                value={values.version}
              />
            </Field>
            <Field error={errors.year} label="Año *">
              <input
                inputMode="numeric"
                onChange={(event) => updateValue("year", event.target.value)}
                placeholder="2021"
                value={values.year}
              />
            </Field>
            <Field error={errors.vin} label="VIN / Número de serie *">
              <input onChange={(event) => updateValue("vin", event.target.value)} value={values.vin} />
            </Field>
            <Field label="Placas">
              <input
                onChange={(event) => updateValue("licensePlate", event.target.value)}
                placeholder="ABC-123-A"
                value={values.licensePlate}
              />
            </Field>
            <Field label="Número de motor">
              <input onChange={(event) => updateValue("engineNumber", event.target.value)} value={values.engineNumber} />
            </Field>
            <Field label="Color">
              <input onChange={(event) => updateValue("color", event.target.value)} placeholder="Gris" value={values.color} />
            </Field>
          </div>
        </section>

        <section className="form-section">
          <h3>Características</h3>
          <div className="form-grid">
            <Field error={errors.fuelType} label="Tipo de combustible *">
              <select onChange={(event) => updateValue("fuelType", event.target.value)} value={values.fuelType}>
                <option value="">Seleccionar</option>
                {fuelTypes.map((fuelType) => (
                  <option key={fuelType} value={fuelType}>
                    {fuelType}
                  </option>
                ))}
              </select>
            </Field>
            <Field error={errors.tankCapacityLiters} label="Capacidad de tanque">
              <div className="with-unit">
                <input
                  inputMode="decimal"
                  onChange={(event) => updateValue("tankCapacityLiters", event.target.value)}
                  placeholder="51"
                  value={values.tankCapacityLiters}
                />
                <span>Litros</span>
              </div>
            </Field>
          </div>
        </section>

        <section className="form-section">
          <h3>Adquisición</h3>
          <div className="form-grid">
            <Field label="Fecha de adquisición">
              <input
                onChange={(event) => updateValue("acquisitionDate", event.target.value)}
                type="date"
                value={values.acquisitionDate}
              />
            </Field>
            <Field error={errors.acquisitionPrice} label="Precio de adquisición">
              <input
                inputMode="decimal"
                onChange={(event) => updateValue("acquisitionPrice", event.target.value)}
                placeholder="450000"
                value={values.acquisitionPrice}
              />
              <small>{acquisitionPricePreview}</small>
            </Field>
          </div>
        </section>

        <section className="form-section">
          <h3>Operación</h3>
          <div className="form-grid">
            <Field error={errors.currentMileage} label="Kilometraje actual *">
              <div className="with-unit">
                <input
                  inputMode="numeric"
                  onChange={(event) => updateValue("currentMileage", event.target.value)}
                  placeholder="70250"
                  value={values.currentMileage}
                />
                <span>km</span>
              </div>
            </Field>
            <Field error={errors.status} label="Estatus *">
              <select onChange={(event) => updateValue("status", event.target.value)} value={values.status}>
                <option value="">Seleccionar</option>
                {vehicleStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <footer className="vehicle-form__footer">
          <button className="button button--secondary" onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="button button--primary" disabled={isSaving} type="submit">
            {isSaving ? "Guardando..." : "Guardar unidad"}
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
