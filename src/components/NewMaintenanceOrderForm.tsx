import { X } from "lucide-react"
import { useState } from "react"
import { maintenanceTypes, type MaintenanceType, type OpenMaintenanceOrderPayload } from "../types/maintenance"
import type { Vehicle } from "../types/vehicle"

interface NewMaintenanceOrderFormProps {
  error: string | null
  isSaving: boolean
  onClose: () => void
  onSubmit: (payload: OpenMaintenanceOrderPayload) => Promise<void>
  vehicle: Vehicle
}

const quickReasons = ["Servicio programado", "Falla reportada", "Inspección", "Reparación", "Garantía", "Otro"] as const

const localNow = () => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")

  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  }
}

export function NewMaintenanceOrderForm({ error, isSaving, onClose, onSubmit, vehicle }: NewMaintenanceOrderFormProps) {
  const now = localNow()
  const [maintenanceType, setMaintenanceType] = useState<MaintenanceType | "">("")
  const [entryDate, setEntryDate] = useState(now.date)
  const [entryTime, setEntryTime] = useState(now.time)
  const [entryMileage, setEntryMileage] = useState(String(vehicle.currentMileage))
  const [reason, setReason] = useState<(typeof quickReasons)[number] | "">("")
  const [otherReason, setOtherReason] = useState("")
  const [provider, setProvider] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})

  const vehicleName = [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(" ")

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    const mileage = Number(entryMileage)

    if (!maintenanceType) nextErrors.maintenanceType = "Selecciona el tipo de mantenimiento."
    if (!entryDate || !entryTime) nextErrors.entryAt = "Indica fecha y hora de ingreso."
    if (!entryMileage.trim() || !Number.isInteger(mileage) || mileage < 0) nextErrors.entryMileage = "Ingresa un kilometraje válido."
    if (reason === "Otro" && !otherReason.trim()) nextErrors.reason = "Describe el motivo de ingreso."

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0 || !maintenanceType) return

    await onSubmit({
      vehicleId: vehicle.id,
      serviceDate: entryDate,
      maintenanceType,
      provider: provider.trim() || null,
      entryAt: new Date(`${entryDate}T${entryTime}`).toISOString(),
      entryMileage: mileage,
      reason: reason === "Otro" ? otherReason.trim() : reason || null,
    })
  }

  return (
    <div aria-modal="true" className="modal-backdrop" role="dialog">
      <form className="vehicle-form new-maintenance-order" onSubmit={(event) => void submit(event)}>
        <header className="vehicle-form__header">
          <div>
            <p>Abrir orden</p>
            <h2>Orden de mantenimiento</h2>
          </div>
          <button aria-label="Cerrar formulario" className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        {error ? <div className="form-banner">{error}</div> : null}

        <section className="form-section new-maintenance-order__vehicle">
          <strong>{vehicle.internalCode}</strong>
          <span>{vehicleName} · {vehicle.year}</span>
          <small>{vehicle.licensePlate ?? "Sin placas"}</small>
        </section>

        <section className="form-section">
          <div className="form-grid">
            <Field error={errors.maintenanceType} label="Tipo de mantenimiento *">
              <select onChange={(event) => setMaintenanceType(event.target.value as MaintenanceType)} value={maintenanceType}>
                <option value="">Selecciona una opción</option>
                {maintenanceTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </Field>
            <Field error={errors.entryMileage} label="Kilometraje de entrada *">
              <div className="with-unit"><input inputMode="numeric" min="0" onChange={(event) => setEntryMileage(event.target.value)} type="number" value={entryMileage} /><span>km</span></div>
            </Field>
            <Field error={errors.entryAt} label="Fecha de ingreso *">
              <input onChange={(event) => setEntryDate(event.target.value)} type="date" value={entryDate} />
            </Field>
            <Field label="Hora de ingreso *">
              <input onChange={(event) => setEntryTime(event.target.value)} type="time" value={entryTime} />
            </Field>
          </div>
        </section>

        <section className="form-section">
          <h3>Motivo de ingreso</h3>
          <div className="quick-reasons">
            {quickReasons.map((item) => <button className={reason === item ? "quick-reason quick-reason--selected" : "quick-reason"} key={item} onClick={() => setReason(item)} type="button">{item}</button>)}
          </div>
          {reason === "Otro" ? <Field error={errors.reason} label="Describe el motivo"><input autoFocus onChange={(event) => setOtherReason(event.target.value)} value={otherReason} /></Field> : null}
        </section>

        <section className="form-section form-section--compact">
          <Field label="Taller / proveedor"><input onChange={(event) => setProvider(event.target.value)} placeholder="Opcional" value={provider} /></Field>
        </section>

        <footer className="vehicle-form__footer">
          <button className="button button--secondary" onClick={onClose} type="button">Cancelar</button>
          <button className="button button--primary" disabled={isSaving} type="submit">{isSaving ? "Abriendo..." : "Abrir orden"}</button>
        </footer>
      </form>
    </div>
  )
}

function Field({ children, error, label }: { children: React.ReactNode; error?: string; label: string }) {
  return <label className="field"><span>{label}</span>{children}{error ? <em>{error}</em> : null}</label>
}
