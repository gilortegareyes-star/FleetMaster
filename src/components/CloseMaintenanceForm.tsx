import { X } from "lucide-react"
import { useState } from "react"
import type { CloseMaintenanceOrderPayload, MaintenanceClosingStatus, MaintenanceRecord } from "../types/maintenance"

interface CloseMaintenanceFormProps {
  entryMileage: number | null
  error: string | null
  hasFollowUpContent: boolean
  hasProgressContent: boolean
  initialClosureNotes: string | null
  isSaving: boolean
  maintenance: MaintenanceRecord
  onClose: () => void
  onSubmit: (payload: Omit<CloseMaintenanceOrderPayload, "maintenanceId">) => Promise<void>
  vehicleLabel: string
}

const statusOptions: Array<{ value: MaintenanceClosingStatus; label: string }> = [
  { value: "completed", label: "Completado" },
  { value: "partially_completed", label: "Parcialmente completado" },
  { value: "follow_up_required", label: "Requiere seguimiento" },
  { value: "not_repaired", label: "No reparado" },
]

const localNow = () => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
}

export function CloseMaintenanceForm({ entryMileage, error, hasFollowUpContent, hasProgressContent, initialClosureNotes, isSaving, maintenance, onClose, onSubmit, vehicleLabel }: CloseMaintenanceFormProps) {
  const [status, setStatus] = useState<MaintenanceClosingStatus>("completed")
  const [exitAt, setExitAt] = useState(localNow)
  const [mileage, setMileage] = useState(entryMileage === null ? "" : String(entryMileage))
  const [nextServiceMileage, setNextServiceMileage] = useState(maintenance.nextServiceMileage === null ? "" : String(maintenance.nextServiceMileage))
  const [nextServiceDate, setNextServiceDate] = useState(maintenance.nextServiceDate ?? "")
  const [closureNotes, setClosureNotes] = useState(initialClosureNotes ?? "")
  const [validationError, setValidationError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const exitMileage = Number(mileage)
    const nextMileage = nextServiceMileage.trim() ? Number(nextServiceMileage) : null

    if (!exitAt) return setValidationError("Indica la fecha y hora de salida.")
    if (!mileage.trim() || !Number.isInteger(exitMileage) || exitMileage < 0) return setValidationError("Ingresa un kilometraje de salida válido.")
    if (entryMileage !== null && exitMileage < entryMileage) return setValidationError("El kilometraje de salida no puede ser menor al kilometraje de entrada.")
    if (nextMileage !== null && (!Number.isInteger(nextMileage) || nextMileage < 0)) return setValidationError("Ingresa un próximo kilometraje válido.")
    if (!hasProgressContent && !closureNotes.trim()) return setValidationError("Agrega al menos un trabajo realizado, diagnóstico u observación de cierre antes de cerrar el mantenimiento.")
    if (status === "follow_up_required" && !hasFollowUpContent && nextMileage === null && !nextServiceDate) return setValidationError("Agrega un trabajo pendiente, recomendación o próximo servicio para indicar el seguimiento.")

    setValidationError(null)
    await onSubmit({
      status,
      exitAt: new Date(exitAt).toISOString(),
      mileage: exitMileage,
      nextServiceMileage: nextMileage,
      nextServiceDate: nextServiceDate || null,
      closureNotes: closureNotes.trim() || null,
    })
  }

  return (
    <div aria-modal="true" className="modal-backdrop close-maintenance-backdrop" role="dialog">
      <form className="vehicle-form close-maintenance-form" onSubmit={(event) => void submit(event)}>
        <header className="vehicle-form__header">
          <div><p>{maintenance.folio}</p><h2>Cerrar mantenimiento</h2></div>
          <button aria-label="Cerrar formulario" className="icon-button" onClick={onClose} type="button"><X aria-hidden="true" size={20} /></button>
        </header>
        <section className="form-section close-maintenance-form__identity"><strong>{vehicleLabel}</strong><span>{maintenance.maintenanceType}</span></section>
        {error || validationError ? <div className="form-banner">{validationError ?? error}</div> : null}
        <section className="form-section"><div className="form-grid">
          <Field label="Resultado final *"><select onChange={(event) => setStatus(event.target.value as MaintenanceClosingStatus)} value={status}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
          <Field label="Fecha y hora de salida *"><input onChange={(event) => setExitAt(event.target.value)} type="datetime-local" value={exitAt} /></Field>
          <Field label="Kilometraje de salida *"><div className="with-unit"><input inputMode="numeric" min="0" onChange={(event) => setMileage(event.target.value)} type="number" value={mileage} /><span>km</span></div></Field>
        </div></section>
        <section className="form-section"><h3>Próximo servicio</h3><div className="form-grid"><Field label="Kilometraje"><div className="with-unit"><input inputMode="numeric" min="0" onChange={(event) => setNextServiceMileage(event.target.value)} type="number" value={nextServiceMileage} /><span>km</span></div></Field><Field label="Fecha"><input onChange={(event) => setNextServiceDate(event.target.value)} type="date" value={nextServiceDate} /></Field></div></section>
        <section className="form-section"><Field label="Observación de cierre"><textarea onChange={(event) => setClosureNotes(event.target.value)} rows={4} value={closureNotes} /></Field></section>
        <footer className="vehicle-form__footer"><button className="button button--secondary" onClick={onClose} type="button">Volver</button><button className="button button--primary" disabled={isSaving} type="submit">{isSaving ? "Cerrando..." : "Cerrar mantenimiento"}</button></footer>
      </form>
    </div>
  )
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="field"><span>{label}</span>{children}</label>
}
