import { Plus, Search, Trash2, X } from "lucide-react"
import { useMemo, useState } from "react"
import { CloseMaintenanceForm } from "./CloseMaintenanceForm"
import { createMaintenanceWorkCatalogItem, getActiveMaintenanceWorkCatalog } from "../services/maintenanceWorkCatalog"
import type { MaintenanceWorkCatalogItem } from "../types/maintenanceWorkCatalog"
import type { CloseMaintenanceOrderPayload, MaintenanceRecord } from "../types/maintenance"
import type {
  MaintenanceReport,
  MaintenanceReportFormValues,
  MaintenanceReportPayload,
  ReceptionConditions,
} from "../types/maintenanceReport"
import type { MaintenanceWorkItem, MaintenanceWorkItemDraft } from "../types/maintenanceWorkItem"
import type { MaintenancePart, MaintenancePartDraft } from "../types/maintenancePart"
import type { MaintenanceCostItem, MaintenanceCostItemDraft, MaintenanceCostKind } from "../types/maintenanceCostItem"
import { calculateCostItemsTotal, calculateMaintenanceCostTotal, calculatePartSubtotal, calculatePartsTotal, parseCostValue } from "../utils/maintenanceCosts"
import { formatCurrency } from "../utils/formatters"

type MaintenanceReportFormErrors = Partial<Record<keyof MaintenanceReportFormValues, string>> & {
  workItems?: string
  parts?: string
  costItems?: string
}

interface MaintenanceReportFormProps {
  maintenance: MaintenanceRecord
  report: MaintenanceReport | null
  isSaving: boolean
  error: string | null
  workItems: MaintenanceWorkItem[]
  parts: MaintenancePart[]
  costItems: MaintenanceCostItem[]
  onClose: () => void
  onSubmit: (
    payload: MaintenanceReportPayload,
    workItems: MaintenanceWorkItemDraft[],
    parts: MaintenancePartDraft[],
    costItems: MaintenanceCostItemDraft[],
  ) => Promise<void>
  onCloseMaintenance?: (
    payload: MaintenanceReportPayload,
    workItems: MaintenanceWorkItemDraft[],
    parts: MaintenancePartDraft[],
    costItems: MaintenanceCostItemDraft[],
    closure: Omit<CloseMaintenanceOrderPayload, "maintenanceId">,
  ) => Promise<void>
  vehicleLabel: string
}

const emptyValues: MaintenanceReportFormValues = {
  entryAt: "",
  exitAt: "",
  entryMileage: "",
  reason: "",
  fuelLevelPercent: "",
  warningLights: "",
  visibleDamage: "",
  receptionObservations: "",
  diagnosis: "",
  recommendations: "",
  pendingWork: "",
  closedBy: "",
  closureNotes: "",
}

const toDateTimeInput = (value: string | null) => {
  if (!value) {
    return ""
  }

  const date = new Date(value)
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return offsetDate.toISOString().slice(0, 16)
}

const valuesFromReport = (report: MaintenanceReport | null): MaintenanceReportFormValues => {
  if (!report) {
    return emptyValues
  }

  return {
    entryAt: toDateTimeInput(report.entryAt),
    exitAt: toDateTimeInput(report.exitAt),
    entryMileage: report.entryMileage === null ? "" : String(report.entryMileage),
    reason: report.reason ?? "",
    fuelLevelPercent:
      report.receptionConditions?.fuelLevelPercent === null || report.receptionConditions?.fuelLevelPercent === undefined
        ? ""
        : String(report.receptionConditions.fuelLevelPercent),
    warningLights: report.receptionConditions?.warningLights ?? "",
    visibleDamage: report.receptionConditions?.visibleDamage ?? "",
    receptionObservations: report.receptionConditions?.observations ?? "",
    diagnosis: report.diagnosis ?? "",
    recommendations: report.recommendations ?? "",
    pendingWork: report.pendingWork ?? "",
    closedBy: report.closedBy ?? "",
    closureNotes: report.closureNotes ?? "",
  }
}

const draftsFromWorkItems = (workItems: MaintenanceWorkItem[]): MaintenanceWorkItemDraft[] =>
  workItems.map((item) => ({
    id: item.id,
    catalogItemId: item.catalogItemId,
    description: item.description,
    notes: item.notes ?? "",
  }))

const draftsFromParts = (parts: MaintenancePart[]): MaintenancePartDraft[] =>
  parts.map((part) => ({
    id: part.id,
    description: part.description,
    quantity: String(part.quantity),
    unit: part.unit ?? "",
    unitCost: String(part.unitCost),
  }))

const draftsFromCostItems = (costItems: MaintenanceCostItem[]): MaintenanceCostItemDraft[] =>
  costItems.map((item) => ({
    id: item.id,
    kind: item.kind,
    description: item.description,
    amount: String(item.amount),
  }))

const parseNumber = (value: string) => {
  if (!value.trim()) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

const toIsoDateTime = (value: string) => (value ? new Date(value).toISOString() : null)

export function MaintenanceReportForm({
  maintenance,
  report,
  isSaving,
  error,
  workItems,
  parts,
  costItems,
  onClose,
  onCloseMaintenance,
  onSubmit,
  vehicleLabel,
}: MaintenanceReportFormProps) {
  const [values, setValues] = useState<MaintenanceReportFormValues>(() => valuesFromReport(report))
  const [workItemDrafts, setWorkItemDrafts] = useState<MaintenanceWorkItemDraft[]>(() => draftsFromWorkItems(workItems))
  const [partDrafts, setPartDrafts] = useState<MaintenancePartDraft[]>(() => draftsFromParts(parts))
  const [costItemDrafts, setCostItemDrafts] = useState<MaintenanceCostItemDraft[]>(() => draftsFromCostItems(costItems))
  const [errors, setErrors] = useState<MaintenanceReportFormErrors>({})
  const [isSelectorOpen, setIsSelectorOpen] = useState(false)
  const [catalog, setCatalog] = useState<MaintenanceWorkCatalogItem[]>([])
  const [catalogQuery, setCatalogQuery] = useState("")
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>([])
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [isCloseFormOpen, setIsCloseFormOpen] = useState(false)
  const isOpenOrder = maintenance.status === "open"
  const title = isOpenOrder ? "Guardar avances" : report ? "Editar informe" : "Completar informe"

  const updateValue = (field: keyof MaintenanceReportFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const updateWorkItem = (index: number, field: "description" | "notes", value: string) => {
    setWorkItemDrafts((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)))
    setErrors((current) => ({ ...current, workItems: undefined }))
  }

  const openWorkSelector = async () => {
    setCatalogError(null)
    try {
      setCatalog(await getActiveMaintenanceWorkCatalog())
      setCatalogQuery("")
      setSelectedCatalogIds([])
      setIsSelectorOpen(true)
    } catch (catalogLoadError) {
      setCatalogError(catalogLoadError instanceof Error ? catalogLoadError.message : "No se pudo cargar el catálogo.")
    }
  }

  const addSelectedCatalogItems = () => {
    const existingIds = new Set(workItemDrafts.flatMap((item) => (item.catalogItemId ? [item.catalogItemId] : [])))
    const additions = catalog.filter((item) => selectedCatalogIds.includes(item.id) && !existingIds.has(item.id))
    setWorkItemDrafts((current) => [...current, ...additions.map((item) => ({ description: item.name, notes: "", catalogItemId: item.id }))])
    setIsSelectorOpen(false)
  }

  const createCatalogItem = async () => {
    const name = catalogQuery.trim()
    if (!name) return
    try {
      const created = await createMaintenanceWorkCatalogItem(name)
      setCatalog((current) => [...current, created])
      setSelectedCatalogIds([created.id])
      setCatalogQuery("")
    } catch (catalogCreateError) {
      setCatalogError(catalogCreateError instanceof Error ? catalogCreateError.message : "No se pudo crear el trabajo.")
    }
  }

  const normalizedQuery = catalogQuery.trim().toLocaleLowerCase("es-MX")
  const filteredCatalog = catalog.filter((item) => item.name.toLocaleLowerCase("es-MX").includes(normalizedQuery))
  const exactCatalogMatch = catalog.some((item) => item.name.trim().toLocaleLowerCase("es-MX") === normalizedQuery)

  const updatePart = (index: number, field: "description" | "quantity" | "unit" | "unitCost", value: string) => {
    setPartDrafts((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)))
    setErrors((current) => ({ ...current, parts: undefined }))
  }

  const updateCostItem = (index: number, field: "kind" | "description" | "amount", value: string) => {
    setCostItemDrafts((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: field === "kind" ? (value as MaintenanceCostKind) : value } : item,
      ),
    )
    setErrors((current) => ({ ...current, costItems: undefined }))
  }

  const costSummary = useMemo(
    () => ({
      parts: calculatePartsTotal(partDrafts),
      labor: calculateCostItemsTotal(costItemDrafts, "labor"),
      other: calculateCostItemsTotal(costItemDrafts, "other"),
      total: calculateMaintenanceCostTotal(partDrafts, costItemDrafts),
    }),
    [partDrafts, costItemDrafts],
  )

  const validate = () => {
    const nextErrors: MaintenanceReportFormErrors = {}
    const entryMileage = parseNumber(values.entryMileage)
    const fuelLevelPercent = parseNumber(values.fuelLevelPercent)

    if (entryMileage !== null && (Number.isNaN(entryMileage) || entryMileage < 0 || !Number.isInteger(entryMileage))) {
      nextErrors.entryMileage = "Ingresa un kilometraje de entrada válido."
    } else if (entryMileage !== null && maintenance.mileage !== null && entryMileage > maintenance.mileage) {
      nextErrors.entryMileage = "El kilometraje de entrada no puede ser mayor al kilometraje de salida."
    }

    if (fuelLevelPercent !== null && (Number.isNaN(fuelLevelPercent) || fuelLevelPercent < 0 || fuelLevelPercent > 100)) {
      nextErrors.fuelLevelPercent = "Ingresa un nivel entre 0 y 100%."
    }

    if (values.entryAt && values.exitAt && new Date(values.exitAt) < new Date(values.entryAt)) {
      nextErrors.exitAt = "La salida no puede ser anterior al ingreso."
    }

    if (workItemDrafts.some((item) => !item.description.trim())) {
      nextErrors.workItems = "Cada trabajo agregado debe tener una descripción."
    }

    if (
      partDrafts.some((part) => {
        const quantity = parseCostValue(part.quantity)
        const unitCost = parseCostValue(part.unitCost)
        return !part.description.trim() || quantity === null || Number.isNaN(quantity) || quantity <= 0 || unitCost === null || Number.isNaN(unitCost) || unitCost < 0
      })
    ) {
      nextErrors.parts = "Cada refacción requiere descripción, cantidad mayor a 0 y costo unitario válido."
    }

    if (
      costItemDrafts.some((item) => {
        const amount = parseCostValue(item.amount)
        return !item.description.trim() || amount === null || Number.isNaN(amount) || amount < 0
      })
    ) {
      nextErrors.costItems = "Cada cargo requiere descripción e importe mayor o igual a 0."
    }

    setErrors(nextErrors)
    return nextErrors
  }

  const buildPayload = () => {
    const fuelLevelPercent = parseNumber(values.fuelLevelPercent)
    const receptionConditions: ReceptionConditions = {
      fuelLevelPercent,
      warningLights: values.warningLights.trim() || null,
      visibleDamage: values.visibleDamage.trim() || null,
      observations: values.receptionObservations.trim() || null,
    }
    const hasReceptionConditions = Object.values(receptionConditions).some((value) => value !== null)

    return {
      maintenanceId: maintenance.id,
      entryAt: toIsoDateTime(values.entryAt),
      exitAt: toIsoDateTime(values.exitAt),
      entryMileage: parseNumber(values.entryMileage),
      reason: values.reason.trim() || null,
      receptionConditions: hasReceptionConditions ? receptionConditions : null,
      diagnosis: values.diagnosis.trim() || null,
      recommendations: values.recommendations.trim() || null,
      pendingWork: values.pendingWork.trim() || null,
      closedBy: values.closedBy.trim() || null,
      closureNotes: values.closureNotes.trim() || null,
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validate()

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    await onSubmit(buildPayload(), workItemDrafts, partDrafts, costItemDrafts)
  }

  const handleCloseMaintenance = async (closure: Omit<CloseMaintenanceOrderPayload, "maintenanceId">) => {
    const nextErrors = validate()
    if (Object.keys(nextErrors).length > 0 || !onCloseMaintenance) return

    await onCloseMaintenance(buildPayload(), workItemDrafts, partDrafts, costItemDrafts, closure)
  }

  return (
    <div aria-modal="true" className="modal-backdrop" role="dialog">
      <form className="vehicle-form" onSubmit={handleSubmit}>
        <header className="vehicle-form__header">
          <div>
            <p>{maintenance.folio}</p>
            <h2>{title}</h2>
          </div>
          <button aria-label="Cerrar formulario" className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        {error ? <div className="form-banner">{error}</div> : null}

        <section className="form-section">
          <h3>Ingreso</h3>
          <div className="form-grid">
            <Field label="Fecha y hora de ingreso">
              <input onChange={(event) => updateValue("entryAt", event.target.value)} type="datetime-local" value={values.entryAt} />
            </Field>
            <Field error={errors.entryMileage} label="Kilometraje de entrada">
              <div className="with-unit">
                <input
                  inputMode="numeric"
                  onChange={(event) => updateValue("entryMileage", event.target.value)}
                  value={values.entryMileage}
                />
                <span>km</span>
              </div>
            </Field>
            <Field label="Motivo de ingreso">
              <textarea
                onChange={(event) => updateValue("reason", event.target.value)}
                placeholder="Describe por qué ingresó la unidad"
                rows={3}
                value={values.reason}
              />
            </Field>
          </div>
        </section>

        <section className="form-section">
          <h3>Condiciones de recepción</h3>
          <div className="form-grid">
            <Field error={errors.fuelLevelPercent} label="Nivel de combustible">
              <div className="with-unit">
                <input
                  inputMode="numeric"
                  max="100"
                  min="0"
                  onChange={(event) => updateValue("fuelLevelPercent", event.target.value)}
                  value={values.fuelLevelPercent}
                />
                <span>%</span>
              </div>
            </Field>
            <Field label="Testigos encendidos">
              <input
                onChange={(event) => updateValue("warningLights", event.target.value)}
                placeholder="Check engine"
                value={values.warningLights}
              />
            </Field>
            <Field label="Daños visibles">
              <textarea
                onChange={(event) => updateValue("visibleDamage", event.target.value)}
                placeholder="Describe daños observados"
                rows={3}
                value={values.visibleDamage}
              />
            </Field>
            <Field label="Observaciones de recepción">
              <textarea
                onChange={(event) => updateValue("receptionObservations", event.target.value)}
                placeholder="Observaciones al recibir la unidad"
                rows={3}
                value={values.receptionObservations}
              />
            </Field>
          </div>
        </section>

        <section className="form-section">
          <h3>Diagnóstico</h3>
          <div className="form-grid form-grid--single">
            <Field label="Diagnóstico">
              <textarea onChange={(event) => updateValue("diagnosis", event.target.value)} rows={4} value={values.diagnosis} />
            </Field>
          </div>
        </section>

        <section className="form-section">
          <h3>Trabajos realizados</h3>
          <p className="maintenance-work-items__helper">Agrega el desglose de trabajos realizados en este mantenimiento.</p>
          {errors.workItems ? <div className="maintenance-work-items__error">{errors.workItems}</div> : null}
          <div className="maintenance-work-items__editor">
            {workItemDrafts.map((item, index) => (
              <div className="maintenance-work-item__row" key={item.id ?? `new-${index}`}>
                <Field label={`Trabajo ${index + 1}`}>
                  <input
                    onChange={(event) => updateWorkItem(index, "description", event.target.value)}
                    placeholder="Describe el trabajo realizado"
                    value={item.description}
                  />
                </Field>
                <Field label="Notas opcionales">
                  <input
                    onChange={(event) => updateWorkItem(index, "notes", event.target.value)}
                    placeholder="Observación breve"
                    value={item.notes}
                  />
                </Field>
                <button
                  aria-label={`Eliminar trabajo ${index + 1}`}
                  className="icon-button maintenance-work-item__remove"
                  onClick={() => setWorkItemDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  title="Eliminar trabajo"
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={17} />
                </button>
              </div>
            ))}
            <button className="button button--secondary maintenance-work-items__add" onClick={() => void openWorkSelector()} type="button">
              <Plus aria-hidden="true" size={17} />
              Agregar trabajos
            </button>
          </div>
        </section>

        <section className="form-section">
          <h3>Refacciones y materiales</h3>
          <p className="maintenance-work-items__helper">Registra lo utilizado en el mantenimiento. El subtotal se calcula automáticamente.</p>
          {errors.parts ? <div className="maintenance-work-items__error">{errors.parts}</div> : null}
          <div className="maintenance-economic-editor">
            {partDrafts.map((part, index) => {
              const quantity = parseCostValue(part.quantity)
              const unitCost = parseCostValue(part.unitCost)
              const subtotal = calculatePartSubtotal(quantity ?? Number.NaN, unitCost ?? Number.NaN)

              return (
                <div className="maintenance-part__row" key={part.id ?? `new-part-${index}`}>
                  <Field label={`Refacción o material ${index + 1}`}>
                    <input onChange={(event) => updatePart(index, "description", event.target.value)} placeholder="Aceite 5W-30" value={part.description} />
                  </Field>
                  <Field label="Cantidad">
                    <input inputMode="decimal" min="0" onChange={(event) => updatePart(index, "quantity", event.target.value)} placeholder="1" step="0.001" type="number" value={part.quantity} />
                  </Field>
                  <Field label="Unidad">
                    <input onChange={(event) => updatePart(index, "unit", event.target.value)} placeholder="pza" value={part.unit} />
                  </Field>
                  <Field label="Costo unitario">
                    <input inputMode="decimal" min="0" onChange={(event) => updatePart(index, "unitCost", event.target.value)} placeholder="0.00" step="0.01" type="number" value={part.unitCost} />
                  </Field>
                  <div className="maintenance-economic__subtotal">
                    <span>Subtotal</span>
                    <strong>{formatCurrency(subtotal)}</strong>
                  </div>
                  <button aria-label={`Eliminar refacción ${index + 1}`} className="icon-button maintenance-work-item__remove" onClick={() => setPartDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))} title="Eliminar refacción" type="button">
                    <Trash2 aria-hidden="true" size={17} />
                  </button>
                </div>
              )
            })}
            <button className="button button--secondary maintenance-work-items__add" onClick={() => setPartDrafts((current) => [...current, { description: "", quantity: "1", unit: "", unitCost: "0" }])} type="button">
              <Plus aria-hidden="true" size={17} />
              Agregar refacción/material
            </button>
          </div>
        </section>

        <section className="form-section">
          <h3>Mano de obra y otros cargos</h3>
          {errors.costItems ? <div className="maintenance-work-items__error">{errors.costItems}</div> : null}
          <div className="maintenance-economic-editor">
            {costItemDrafts.map((item, index) => (
              <div className="maintenance-cost-item__row" key={item.id ?? `new-cost-${index}`}>
                <Field label="Tipo">
                  <select onChange={(event) => updateCostItem(index, "kind", event.target.value)} value={item.kind}>
                    <option value="labor">Mano de obra</option>
                    <option value="other">Otro</option>
                  </select>
                </Field>
                <Field label="Descripción">
                  <input onChange={(event) => updateCostItem(index, "description", event.target.value)} placeholder="Servicio preventivo" value={item.description} />
                </Field>
                <Field label="Importe">
                  <input inputMode="decimal" min="0" onChange={(event) => updateCostItem(index, "amount", event.target.value)} placeholder="0.00" step="0.01" type="number" value={item.amount} />
                </Field>
                <button aria-label={`Eliminar cargo ${index + 1}`} className="icon-button maintenance-work-item__remove" onClick={() => setCostItemDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))} title="Eliminar cargo" type="button">
                  <Trash2 aria-hidden="true" size={17} />
                </button>
              </div>
            ))}
            <button className="button button--secondary maintenance-work-items__add" onClick={() => setCostItemDrafts((current) => [...current, { kind: "labor", description: "", amount: "0" }])} type="button">
              <Plus aria-hidden="true" size={17} />
              Agregar cargo
            </button>
          </div>
        </section>

        <section className="form-section maintenance-cost-summary">
          <h3>Resumen de costos</h3>
          <dl>
            <div><dt>Refacciones / materiales</dt><dd>{formatCurrency(costSummary.parts)}</dd></div>
            <div><dt>Mano de obra</dt><dd>{formatCurrency(costSummary.labor)}</dd></div>
            <div><dt>Otros cargos</dt><dd>{formatCurrency(costSummary.other)}</dd></div>
            <div className="maintenance-cost-summary__total"><dt>Total</dt><dd>{formatCurrency(costSummary.total)}</dd></div>
          </dl>
        </section>

        <section className="form-section">
          <h3>Recomendaciones</h3>
          <div className="form-grid form-grid--single">
            <Field label="Recomendaciones">
              <textarea onChange={(event) => updateValue("recommendations", event.target.value)} rows={3} value={values.recommendations} />
            </Field>
            <Field label="Trabajos pendientes">
              <textarea onChange={(event) => updateValue("pendingWork", event.target.value)} rows={3} value={values.pendingWork} />
            </Field>
          </div>
        </section>

        {!isOpenOrder ? <section className="form-section">
          <h3>Cierre</h3>
          <div className="form-grid">
            <Field error={errors.exitAt} label="Fecha y hora de salida">
              <input onChange={(event) => updateValue("exitAt", event.target.value)} type="datetime-local" value={values.exitAt} />
            </Field>
            <Field label="Responsable de cierre">
              <input onChange={(event) => updateValue("closedBy", event.target.value)} value={values.closedBy} />
            </Field>
            <Field label="Observaciones de cierre">
              <textarea onChange={(event) => updateValue("closureNotes", event.target.value)} rows={3} value={values.closureNotes} />
            </Field>
          </div>
        </section> : null}

        <footer className="vehicle-form__footer">
          <button className="button button--secondary" onClick={onClose} type="button">
            Cancelar
          </button>
          {isOpenOrder ? <button className="button button--secondary" onClick={() => setIsCloseFormOpen(true)} type="button">Cerrar mantenimiento</button> : null}
          <button className="button button--primary" disabled={isSaving} type="submit">
            {isSaving ? "Guardando..." : isOpenOrder ? "Guardar avances" : "Guardar informe"}
          </button>
        </footer>
      </form>

      {isSelectorOpen ? (
        <div aria-modal="true" className="maintenance-work-selector" role="dialog">
          <header><div><p>Catálogo</p><h2>Agregar trabajos realizados</h2></div><button aria-label="Cerrar selector" className="icon-button" onClick={() => setIsSelectorOpen(false)} type="button"><X aria-hidden="true" size={20} /></button></header>
          <label className="maintenance-work-selector__search"><Search aria-hidden="true" size={18} /><input autoFocus onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Buscar trabajo..." value={catalogQuery} /></label>
          {catalogError ? <div className="form-banner">{catalogError}</div> : null}
          <p className="maintenance-work-selector__label">Trabajos frecuentes</p>
          <div className="maintenance-work-selector__list">
            {filteredCatalog.map((item) => {
              const alreadyAdded = workItemDrafts.some((draft) => draft.catalogItemId === item.id)
              return <label className={alreadyAdded ? "is-added" : ""} key={item.id}><input checked={alreadyAdded || selectedCatalogIds.includes(item.id)} disabled={alreadyAdded} onChange={(event) => setSelectedCatalogIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} type="checkbox" /><span>{item.name}</span>{alreadyAdded ? <small>Ya agregado</small> : null}</label>
            })}
          </div>
          {normalizedQuery && filteredCatalog.length === 0 && !exactCatalogMatch ? <button className="button button--secondary maintenance-work-selector__create" onClick={() => void createCatalogItem()} type="button"><Plus aria-hidden="true" size={17} />Crear &quot;{catalogQuery.trim()}&quot;</button> : null}
          <footer><button className="button button--secondary" onClick={() => setIsSelectorOpen(false)} type="button">Cancelar</button><button className="button button--primary" disabled={selectedCatalogIds.length === 0} onClick={addSelectedCatalogItems} type="button">Agregar seleccionados</button></footer>
        </div>
      ) : null}

      {isCloseFormOpen ? (
        <CloseMaintenanceForm
          entryMileage={parseNumber(values.entryMileage)}
          error={error}
          hasFollowUpContent={Boolean(values.pendingWork.trim() || values.recommendations.trim())}
          hasProgressContent={Boolean(values.diagnosis.trim() || workItemDrafts.some((item) => item.description.trim()))}
          initialClosureNotes={values.closureNotes}
          isSaving={isSaving}
          maintenance={maintenance}
          onClose={() => setIsCloseFormOpen(false)}
          onSubmit={handleCloseMaintenance}
          vehicleLabel={vehicleLabel}
        />
      ) : null}
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
