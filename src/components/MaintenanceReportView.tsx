import { AlertCircle, ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Circle, CircleDashed, Edit3, FileText, MinusCircle, Plus, Search, X } from "lucide-react"
import { useEffect, useState } from "react"
import { MaintenanceReportForm } from "./MaintenanceReportForm"
import { getMaintenanceReport, saveMaintenanceReport } from "../services/maintenanceReports"
import { createMaintenanceWorkItem, getMaintenanceWorkItems, syncMaintenanceWorkItems, updateMaintenanceWorkItemResult } from "../services/maintenanceWorkItems"
import { getActiveMaintenanceWorkCatalog } from "../services/maintenanceWorkCatalog"
import { getMaintenanceParts, syncMaintenanceParts } from "../services/maintenanceParts"
import { getMaintenanceCostItems, syncMaintenanceCostItems } from "../services/maintenanceCostItems"
import { closeMaintenanceOrder, updateMaintenanceTotalCost } from "../services/maintenance"
import type { CloseMaintenanceOrderPayload, MaintenanceRecord } from "../types/maintenance"
import type { MaintenanceReport, MaintenanceReportPayload, ReceptionConditions } from "../types/maintenanceReport"
import type { MaintenanceWorkCatalogItem } from "../types/maintenanceWorkCatalog"
import type { MaintenanceWorkItem, MaintenanceWorkItemDraft, MaintenanceWorkResult } from "../types/maintenanceWorkItem"
import type { MaintenancePart, MaintenancePartDraft } from "../types/maintenancePart"
import type { MaintenanceCostItem, MaintenanceCostItemDraft } from "../types/maintenanceCostItem"
import type { Vehicle } from "../types/vehicle"
import { formatCurrency, formatDate, formatMileage } from "../utils/formatters"
import { calculateCostItemsTotal, calculateMaintenanceCostTotal, calculatePartSubtotal, calculatePartsTotal } from "../utils/maintenanceCosts"

interface MaintenanceReportViewProps {
  vehicle: Vehicle
  maintenance: MaintenanceRecord
  onBack: () => void
  onMaintenanceChanged: (maintenance: MaintenanceRecord) => void
}

const hasText = (value: string | null): value is string => typeof value === "string" && value.trim().length > 0

const maintenanceStatusLabels = {
  open: "Abierto",
  completed: "Completado",
  partially_completed: "Completado parcialmente",
  follow_up_required: "Requiere seguimiento",
  not_repaired: "No reparado",
  cancelled: "Cancelado",
} as const

const workResultOptions: Array<{ value: MaintenanceWorkResult | null; label: string }> = [
  { value: null, label: "Sin resultado" },
  { value: "completed", label: "Realizado" },
  { value: "partially_completed", label: "Parcialmente realizado" },
  { value: "follow_up_required", label: "Requiere seguimiento" },
  { value: "not_completed", label: "No realizado" },
]

const workResultMeta: Record<string, { label: string; tone: string; Icon: typeof Circle }> = {
  completed: { label: "Realizado", tone: "completed", Icon: CheckCircle2 },
  partially_completed: { label: "Parcialmente realizado", tone: "partial", Icon: MinusCircle },
  follow_up_required: { label: "Requiere seguimiento", tone: "follow-up", Icon: AlertCircle },
  not_completed: { label: "No realizado", tone: "not-completed", Icon: Circle },
}

function ReportField({ label, value }: { label: string; value: string }) {
  return (
    <div className="maintenance-report__field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ReportSection({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section className="maintenance-report__section" id={id}>
      <h3>{title}</h3>
      {children}
    </section>
  )
}

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))

const hasReceptionConditions = (conditions: ReceptionConditions | null) => {
  if (!conditions) {
    return false
  }

  return (
    (conditions.fuelLevelPercent !== null && conditions.fuelLevelPercent !== undefined) ||
    hasText(conditions.warningLights ?? null) ||
    hasText(conditions.visibleDamage ?? null) ||
    hasText(conditions.observations ?? null)
  )
}

export function MaintenanceReportView({ vehicle, maintenance, onBack, onMaintenanceChanged }: MaintenanceReportViewProps) {
  const [report, setReport] = useState<MaintenanceReport | null>(null)
  const [workItems, setWorkItems] = useState<MaintenanceWorkItem[]>([])
  const [parts, setParts] = useState<MaintenancePart[]>([])
  const [costItems, setCostItems] = useState<MaintenanceCostItem[]>([])
  const [totalCost, setTotalCost] = useState(maintenance.totalCost)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [workActionError, setWorkActionError] = useState<string | null>(null)
  const [isWorkModalOpen, setIsWorkModalOpen] = useState(false)
  const [workCatalog, setWorkCatalog] = useState<MaintenanceWorkCatalogItem[]>([])
  const [workCatalogQuery, setWorkCatalogQuery] = useState("")
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<Set<string>>(new Set())
  const [isManualWorkMode, setIsManualWorkMode] = useState(false)
  const [manualWorkDescription, setManualWorkDescription] = useState("")
  const [workNotes, setWorkNotes] = useState<Record<string, string>>({})
  const [workDraftResults, setWorkDraftResults] = useState<Record<string, MaintenanceWorkResult | null>>({})
  const [expandedWorkId, setExpandedWorkId] = useState<string | null>(null)
  const [savingWorkId, setSavingWorkId] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true

    const loadReport = async () => {
      setIsLoading(true)
      setLoadError(null)

      try {
        const [item, maintenanceWorkItems, maintenanceParts, maintenanceCostItems] = await Promise.all([
          getMaintenanceReport(maintenance.id),
          getMaintenanceWorkItems(maintenance.id),
          getMaintenanceParts(maintenance.id),
          getMaintenanceCostItems(maintenance.id),
        ])
        if (isActive) {
          setReport(item)
          setWorkItems(maintenanceWorkItems)
          setWorkNotes(Object.fromEntries(maintenanceWorkItems.map((workItem) => [workItem.id, workItem.notes ?? ""])))
          setWorkDraftResults(Object.fromEntries(maintenanceWorkItems.map((workItem) => [workItem.id, workItem.result])))
          setExpandedWorkId(null)
          setParts(maintenanceParts)
          setCostItems(maintenanceCostItems)
          setTotalCost(maintenance.totalCost)
        }
      } catch (error) {
        if (isActive) {
          setReport(null)
          setWorkItems([])
          setParts([])
          setCostItems([])
          setLoadError(error instanceof Error ? error.message : "No se pudo cargar el informe.")
        }
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    void loadReport()

    return () => {
      isActive = false
    }
  }, [maintenance.id])

  const filteredWorkCatalog = workCatalog.filter((item) =>
    item.name.toLocaleLowerCase("es-MX").includes(workCatalogQuery.trim().toLocaleLowerCase("es-MX")),
  )
  const existingCatalogIds = new Set(workItems.flatMap((item) => item.catalogItemId ? [item.catalogItemId] : []))

  const openWorkModal = async () => {
    setWorkActionError(null)
    try {
      setWorkCatalog(await getActiveMaintenanceWorkCatalog())
      setWorkCatalogQuery("")
      setSelectedCatalogIds(new Set())
      setIsManualWorkMode(false)
      setManualWorkDescription("")
      setIsWorkModalOpen(true)
    } catch (error) {
      setWorkActionError(error instanceof Error ? error.message : "No se pudo cargar el catálogo de trabajos.")
    }
  }

  const toggleCatalogItem = (catalogItemId: string) => {
    if (existingCatalogIds.has(catalogItemId)) return
    setSelectedCatalogIds((current) => {
      const next = new Set(current)
      if (next.has(catalogItemId)) next.delete(catalogItemId)
      else next.add(catalogItemId)
      return next
    })
  }

  const addWorkItems = async () => {
    if (isManualWorkMode) {
      const description = manualWorkDescription.trim()
      if (!description) {
        setWorkActionError("Escribe una descripción para el trabajo personalizado.")
        return
      }
      setSavingWorkId("new")
      setWorkActionError(null)
      try {
        const created = await createMaintenanceWorkItem(maintenance.id, {
          description,
          notes: null,
          sortOrder: workItems.length,
          catalogItemId: null,
        })
      setWorkItems((current) => [...current, created])
      setWorkNotes((current) => ({ ...current, [created.id]: "" }))
      setWorkDraftResults((current) => ({ ...current, [created.id]: null }))
        setIsWorkModalOpen(false)
      } catch (error) {
        setWorkActionError(error instanceof Error ? error.message : "No se pudo agregar el trabajo.")
      } finally {
        setSavingWorkId(null)
      }
      return
    }

    const catalogItems = workCatalog.filter((item) => selectedCatalogIds.has(item.id) && !existingCatalogIds.has(item.id))
    if (catalogItems.length === 0) return

    setSavingWorkId("new")
    setWorkActionError(null)
    let createdCount = 0
    try {
      for (const [index, catalogItem] of catalogItems.entries()) {
        await createMaintenanceWorkItem(maintenance.id, {
          description: catalogItem.name,
          notes: null,
          sortOrder: workItems.length + index,
          catalogItemId: catalogItem.id,
        })
        createdCount += 1
      }
      const refreshedItems = await getMaintenanceWorkItems(maintenance.id)
      setWorkItems(refreshedItems)
      setWorkNotes(Object.fromEntries(refreshedItems.map((workItem) => [workItem.id, workItem.notes ?? ""])))
      setSelectedCatalogIds(new Set())
      setIsWorkModalOpen(false)
    } catch (error) {
      const refreshedItems = await getMaintenanceWorkItems(maintenance.id).catch(() => null)
      if (refreshedItems) {
        setWorkItems(refreshedItems)
        setWorkNotes(Object.fromEntries(refreshedItems.map((workItem) => [workItem.id, workItem.notes ?? ""])))
        setWorkDraftResults(Object.fromEntries(refreshedItems.map((workItem) => [workItem.id, workItem.result])))
      }
      setWorkActionError(createdCount > 0
        ? `Se agregaron ${createdCount} de ${catalogItems.length} trabajos. Algunos no pudieron agregarse.`
        : error instanceof Error ? error.message : "No se pudo agregar el trabajo.")
    } finally {
      setSavingWorkId(null)
    }
  }

  const updateWorkItem = async (workItem: MaintenanceWorkItem, result: MaintenanceWorkResult | null, notes: string) => {
    if (maintenance.status !== "open") return

    setSavingWorkId(workItem.id)
    setWorkActionError(null)
    try {
      const updated = await updateMaintenanceWorkItemResult(workItem.id, result, notes.trim() || null)
      setWorkItems((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setWorkNotes((current) => ({ ...current, [updated.id]: updated.notes ?? "" }))
      setWorkDraftResults((current) => ({ ...current, [updated.id]: updated.result }))
      setExpandedWorkId(null)
    } catch (error) {
      setWorkActionError(error instanceof Error ? error.message : "No se pudo actualizar el trabajo.")
    } finally {
      setSavingWorkId(null)
    }
  }

  const vehicleName = [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Sin registrar"
  const nextService = [
    maintenance.nextServiceMileage === null ? null : `${formatMileage(maintenance.nextServiceMileage)} km`,
    maintenance.nextServiceDate === null ? null : formatDate(maintenance.nextServiceDate),
  ]
    .filter(Boolean)
    .join(" · ")
  const receptionConditions = report?.receptionConditions ?? null
  const receptionFuelLevel = receptionConditions?.fuelLevelPercent ?? null
  const receptionWarningLights = receptionConditions?.warningLights?.trim() || null
  const receptionVisibleDamage = receptionConditions?.visibleDamage?.trim() || null
  const receptionObservations = receptionConditions?.observations?.trim() || null

  const persistProgress = async (
    payload: MaintenanceReportPayload,
    workItemDrafts: MaintenanceWorkItemDraft[],
    partDrafts: MaintenancePartDraft[],
    costItemDrafts: MaintenanceCostItemDraft[],
  ) => {
    const savedReport = await saveMaintenanceReport(payload)
    setReport(savedReport)
    const savedWorkItems = await syncMaintenanceWorkItems(maintenance.id, workItems, workItemDrafts)
    setWorkItems(savedWorkItems)
    const savedParts = await syncMaintenanceParts(maintenance.id, parts, partDrafts)
    setParts(savedParts)
    const savedCostItems = await syncMaintenanceCostItems(maintenance.id, costItems, costItemDrafts)
    setCostItems(savedCostItems)
    const hasEconomicBreakdown = parts.length > 0 || costItems.length > 0 || savedParts.length > 0 || savedCostItems.length > 0

    if (hasEconomicBreakdown) {
      const updatedMaintenance = await updateMaintenanceTotalCost(
        maintenance.id,
        calculateMaintenanceCostTotal(savedParts, savedCostItems),
      )
      setTotalCost(updatedMaintenance.totalCost)
    }

    return savedReport
  }

  const handleSave = async (
    payload: MaintenanceReportPayload,
    workItemDrafts: MaintenanceWorkItemDraft[],
    partDrafts: MaintenancePartDraft[],
    costItemDrafts: MaintenanceCostItemDraft[],
  ) => {
    setIsSaving(true)
    setSaveError(null)

    try {
      await persistProgress(payload, workItemDrafts, partDrafts, costItemDrafts)
      setIsFormOpen(false)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar el informe.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleCloseMaintenance = async (
    payload: MaintenanceReportPayload,
    workItemDrafts: MaintenanceWorkItemDraft[],
    partDrafts: MaintenancePartDraft[],
    costItemDrafts: MaintenanceCostItemDraft[],
    closure: Omit<CloseMaintenanceOrderPayload, "maintenanceId">,
  ) => {
    setIsSaving(true)
    setSaveError(null)

    try {
      await persistProgress(payload, workItemDrafts, partDrafts, costItemDrafts)
      const closedMaintenance = await closeMaintenanceOrder({ maintenanceId: maintenance.id, ...closure })
      setReport(await getMaintenanceReport(maintenance.id))
      onMaintenanceChanged(closedMaintenance)
      setIsFormOpen(false)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo cerrar el mantenimiento.")
    } finally {
      setIsSaving(false)
    }
  }

  const hasEconomicBreakdown = parts.length > 0 || costItems.length > 0
  const partsTotal = calculatePartsTotal(parts)
  const laborTotal = calculateCostItemsTotal(costItems, "labor")
  const otherTotal = calculateCostItemsTotal(costItems, "other")
  const economicTotal = calculateMaintenanceCostTotal(parts, costItems)

  return (
    <section className="maintenance-report">
      <button className="summary-back-button" onClick={onBack} type="button">
        <ArrowLeft aria-hidden="true" size={17} />
        Mantenimientos
      </button>

      <header className="maintenance-report__header">
        <div>
          <p className="maintenance-report__breadcrumb">
            Centro de control <span>/</span> {vehicle.internalCode} <span>/</span> Mantenimientos <span>/</span> {maintenance.folio}
          </p>
          <h3>Orden de mantenimiento</h3>
          <div className="maintenance-report__meta">
            <span className="maintenance-report__folio">{maintenance.folio}</span>
            <span className={`maintenance-report__status maintenance-report__status--${maintenance.status}`}>
              {maintenance.status === "open" ? "En curso" : maintenanceStatusLabels[maintenance.status]}
            </span>
          </div>
        </div>
        <button
          className="button button--secondary"
          disabled={isLoading}
          onClick={() => {
            setSaveError(null)
            setIsFormOpen(true)
          }}
          type="button"
        >
          <Edit3 aria-hidden="true" size={17} />
          {maintenance.status === "open" ? "Editar orden" : report ? "Editar informe" : "Completar informe"}
        </button>
      </header>

      <section className="maintenance-report__order-band">
        <div className="maintenance-report__vehicle">
          <span>Unidad</span>
          <strong>{vehicle.internalCode}</strong>
          <p>{vehicleName}</p>
          <small>{vehicle.year ? String(vehicle.year) : "Sin registrar"}</small>
          {hasText(vehicle.licensePlate) ? <small>Placas: {vehicle.licensePlate}</small> : null}
        </div>
        <div className="maintenance-report__order-details">
          <ReportField label="Tipo de servicio" value={maintenance.maintenanceType} />
          <ReportField label="Taller / proveedor" value={hasText(maintenance.provider) ? maintenance.provider.trim() : "Sin registrar"} />
        </div>
        <div className="maintenance-report__order-facts">
          <ReportField label="Fecha de ingreso" value={formatDate(maintenance.serviceDate)} />
          <ReportField label="Kilometraje de entrada" value={maintenance.mileage === null ? "Sin registrar" : `${formatMileage(maintenance.mileage)} km`} />
        </div>
      </section>

      <nav aria-label="Secciones de la orden" className="maintenance-report__nav">
        <a href="#maintenance-report-summary">Resumen</a>
        <a href="#maintenance-report-work">Trabajos ({workItems.length})</a>
        {parts.length > 0 ? <a href="#maintenance-report-parts">Refacciones</a> : null}
        {costItems.length > 0 ? <a href="#maintenance-report-costs">Costos</a> : null}
        <a href="#maintenance-report-details">Reportes</a>
      </nav>

      {loadError ? <div className="form-banner maintenance-report__error">{loadError}</div> : null}

      <div className="maintenance-report__layout">
        <main className="maintenance-report__main maintenance-report__document">
          <section className="maintenance-report__summary-card maintenance-report__document-section" id="maintenance-report-summary">
            <div className="section-title">
              <FileText aria-hidden="true" size={18} />
              <h3>Descripción de la orden</h3>
            </div>
            <div className="maintenance-report__work">
              {hasText(maintenance.description) ? <p>{maintenance.description}</p> : null}
              {report?.reason ? <div className="maintenance-report__description-field"><span>Motivo de ingreso</span><p>{report.reason}</p></div> : null}
              {hasText(maintenance.notes) ? <div className="maintenance-report__description-field"><span>Notas</span><p>{maintenance.notes.trim()}</p></div> : null}
              {!hasText(maintenance.description) && !report?.reason && !hasText(maintenance.notes) ? <p className="maintenance-report__empty-value">Sin registrar</p> : null}
            </div>
          </section>

          <div id="maintenance-report-details">
          {report?.entryAt || report?.exitAt || report?.entryMileage !== null && report?.entryMileage !== undefined ? (
            <ReportSection title="Ingreso y salida">
              <div className="maintenance-report__timeline">
                {report?.entryAt || report?.entryMileage !== null && report?.entryMileage !== undefined ? <div><span>Ingreso</span>{report?.entryAt ? <strong>{formatDateTime(report.entryAt)}</strong> : null}{report?.entryMileage !== null && report?.entryMileage !== undefined ? <small>{formatMileage(report.entryMileage)} km</small> : null}</div> : null}
                {report?.exitAt ? <div><span>Salida</span><strong>{formatDateTime(report.exitAt)}</strong>{maintenance.mileage !== null ? <small>{formatMileage(maintenance.mileage)} km</small> : null}</div> : null}
              </div>
            </ReportSection>
          ) : null}

          {hasReceptionConditions(receptionConditions) ? <ReportSection title="Condiciones de recepción"><div className="maintenance-report__conditions-grid">{receptionFuelLevel !== null ? <ReportField label="Nivel de combustible" value={`${receptionFuelLevel}%`} /> : null}{receptionWarningLights ? <ReportField label="Testigos encendidos" value={receptionWarningLights} /> : null}{receptionVisibleDamage ? <ReportField label="Daños visibles" value={receptionVisibleDamage} /> : null}{receptionObservations ? <ReportField label="Observaciones" value={receptionObservations} /> : null}</div></ReportSection> : null}

          {report?.diagnosis ? <ReportSection title="Diagnóstico"><p>{report.diagnosis}</p></ReportSection> : null}

          <section className="maintenance-report__work-section" id="maintenance-report-work">
            <header className="maintenance-report__work-section-header">
              <div>
                <h3>Trabajos de la orden</h3>
                <span>{workItems.length} {workItems.length === 1 ? "trabajo registrado" : "trabajos registrados"}</span>
              </div>
              {maintenance.status === "open" ? <button className="button button--secondary" onClick={() => void openWorkModal()} type="button"><Plus aria-hidden="true" size={17} />Agregar trabajos</button> : null}
            </header>
            {workActionError ? <div className="form-banner maintenance-report__error">{workActionError}</div> : null}
            {workItems.length > 0 ? (
              <div className="maintenance-work-checklist">
                {workItems.map((item) => {
                  const resultMeta = item.result ? workResultMeta[item.result] : null
                  const ResultIcon = resultMeta?.Icon ?? Circle
                  const isExpanded = expandedWorkId === item.id
                  return (
                    <article className={`maintenance-work-checklist__item ${isExpanded ? "is-expanded" : ""}`} key={item.id}>
                      <button
                        aria-expanded={isExpanded}
                        className="maintenance-work-checklist__row"
                        onClick={() => setExpandedWorkId(isExpanded ? null : item.id)}
                        type="button"
                      >
                        <span className="maintenance-work-checklist__identity">
                          <ResultIcon aria-hidden="true" className={`maintenance-work-result-icon maintenance-work-result-icon--${resultMeta?.tone ?? "empty"}`} size={20} />
                          <strong>{item.description}</strong>
                        </span>
                        <span className="maintenance-work-checklist__row-meta">
                          {resultMeta ? <span className={`maintenance-work-result maintenance-work-result--${resultMeta.tone}`}>{resultMeta.label}</span> : null}
                          {isExpanded ? <ChevronDown aria-hidden="true" size={18} /> : <ChevronRight aria-hidden="true" size={18} />}
                        </span>
                      </button>
                      {isExpanded ? <div className="maintenance-work-checklist__details" onClick={(event) => event.stopPropagation()}>
                        <div className="maintenance-work-checklist__detail-field">
                          <span>Resultado</span>
                          {maintenance.status === "open" ? <select
                            aria-label={`Resultado de ${item.description}`}
                            disabled={savingWorkId === item.id}
                            onChange={(event) => setWorkDraftResults((current) => ({ ...current, [item.id]: event.target.value === "" ? null : event.target.value as MaintenanceWorkResult }))}
                            value={workDraftResults[item.id] ?? ""}
                          >
                            {workResultOptions.map((option) => <option key={option.label} value={option.value ?? ""}>{option.label}</option>)}
                          </select> : <strong>{resultMeta?.label ?? "Sin resultado"}</strong>}
                        </div>
                        <div className="maintenance-work-checklist__detail-field">
                          <span>Notas</span>
                          {maintenance.status === "open" ? <textarea
                            aria-label={`Notas de ${item.description}`}
                            disabled={savingWorkId === item.id}
                            onChange={(event) => setWorkNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                            placeholder="Agregar una nota sobre este trabajo..."
                            rows={3}
                            value={workNotes[item.id] ?? ""}
                          /> : <p className="maintenance-work-checklist__read-only-notes">{hasText(item.notes) ? item.notes.trim() : "Sin notas registradas."}</p>}
                        </div>
                        {maintenance.status === "open" ? <div className="maintenance-work-checklist__detail-actions">
                          <button className="button button--secondary" onClick={() => { setWorkDraftResults((current) => ({ ...current, [item.id]: item.result })); setWorkNotes((current) => ({ ...current, [item.id]: item.notes ?? "" })); setExpandedWorkId(null) }} type="button">Cancelar</button>
                          <button className="button button--primary" disabled={savingWorkId === item.id} onClick={() => void updateWorkItem(item, workDraftResults[item.id] ?? null, workNotes[item.id] ?? "")} type="button">Guardar cambios</button>
                        </div> : null}
                      </div> : null}
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="maintenance-work-checklist__empty">
                <CircleDashed aria-hidden="true" size={22} />
                <span>No hay trabajos registrados en esta orden.</span>
              </div>
            )}
          </section>

          {parts.length > 0 ? <div id="maintenance-report-parts"><ReportSection title="Refacciones y materiales"><div className="maintenance-parts__table"><div className="maintenance-parts__header"><span>Descripción</span><span>Cant.</span><span>Unitario</span><span>Importe</span></div>{parts.map((part) => <div className="maintenance-parts__row" key={part.id}><span>{part.description}{part.unit ? <small>{part.unit}</small> : null}</span><span>{part.quantity}</span><span>{formatCurrency(part.unitCost)}</span><strong>{formatCurrency(calculatePartSubtotal(part.quantity, part.unitCost))}</strong></div>)}</div></ReportSection></div> : null}

          {report?.recommendations ? <ReportSection title="Recomendaciones"><p>{report.recommendations}</p></ReportSection> : null}
          {report?.pendingWork ? <ReportSection title="Trabajos pendientes"><p>{report.pendingWork}</p></ReportSection> : null}
          {report?.closureNotes || report?.closedBy ? <ReportSection title="Cierre"><div className="maintenance-report__conditions-grid">{report.closedBy ? <ReportField label="Responsable de cierre" value={report.closedBy} /> : null}{report.closureNotes ? <ReportField label="Observaciones" value={report.closureNotes} /> : null}</div></ReportSection> : null}
          {hasText(maintenance.notes) ? <ReportSection title="Notas generales"><p>{maintenance.notes.trim()}</p></ReportSection> : null}
          </div>
        </main>

        <aside className="maintenance-report__aside">
          <section className="maintenance-report__order-summary" id="maintenance-report-costs">
            <h3>Resumen de la orden</h3>
            <div className="maintenance-report__summary-counts">
              <div><span>Trabajos registrados</span><strong>{workItems.length}</strong></div>
              <div><span>Refacciones registradas</span><strong>{parts.length}</strong></div>
              <div><span>Costos registrados</span><strong>{costItems.length}</strong></div>
            </div>
            <div className="maintenance-report__summary-cost">
              <span>{hasEconomicBreakdown ? "Costos" : "Costo total"}</span>
              {hasEconomicBreakdown ? <dl className="maintenance-cost-summary__view"><div><dt>Refacciones / materiales</dt><dd>{formatCurrency(partsTotal)}</dd></div><div><dt>Mano de obra</dt><dd>{formatCurrency(laborTotal)}</dd></div><div><dt>Otros cargos</dt><dd>{formatCurrency(otherTotal)}</dd></div><div className="maintenance-cost-summary__total"><dt>Total</dt><dd>{formatCurrency(economicTotal)}</dd></div></dl> : <strong className="maintenance-report__total-cost">{totalCost === null ? "Sin registrar" : formatCurrency(totalCost)}</strong>}
            </div>
            {nextService ? <div className="maintenance-report__next-service"><span>Próximo servicio</span>{maintenance.nextServiceMileage !== null ? <strong>{formatMileage(maintenance.nextServiceMileage)} km</strong> : null}{maintenance.nextServiceDate !== null ? <small>{formatDate(maintenance.nextServiceDate)}</small> : null}</div> : null}
            {costItems.length > 0 ? <div className="maintenance-report__cost-items"><h3>Detalle de cargos</h3>{costItems.map((item) => <p key={item.id}><span>{item.kind === "labor" ? "Mano de obra" : "Otro"} · {item.description}</span><strong>{formatCurrency(item.amount)}</strong></p>)}</div> : null}
          </section>
        </aside>
      </div>

      {isWorkModalOpen ? (
        <div aria-modal="true" className="modal-backdrop" role="dialog">
          <section className="maintenance-work-modal">
            <header className="maintenance-work-modal__header">
              <div>
                <span>Trabajos de la orden</span>
                <h2>Agregar trabajos</h2>
              </div>
              <button aria-label="Cerrar ventana" className="icon-button" onClick={() => setIsWorkModalOpen(false)} type="button"><X aria-hidden="true" size={19} /></button>
            </header>
            <label className="maintenance-work-modal__field">
              <span>Buscar trabajo</span>
              <div className="maintenance-work-modal__search"><Search aria-hidden="true" size={17} /><input autoFocus onChange={(event) => setWorkCatalogQuery(event.target.value)} placeholder="Buscar en el catálogo..." value={workCatalogQuery} /></div>
            </label>
            <div className="maintenance-work-modal__catalog">
              {filteredWorkCatalog.map((item) => {
                const isAlreadyAdded = existingCatalogIds.has(item.id)
                const isSelected = selectedCatalogIds.has(item.id)
                return <button aria-pressed={isSelected} className={`maintenance-work-modal__catalog-item ${isSelected ? "is-selected" : ""} ${isAlreadyAdded ? "is-already-added" : ""}`} disabled={isAlreadyAdded} key={item.id} onClick={() => toggleCatalogItem(item.id)} type="button"><span>{item.name}</span>{isAlreadyAdded ? <small>Ya agregado</small> : isSelected ? <CheckCircle2 aria-hidden="true" size={18} /> : <Circle aria-hidden="true" size={18} />}</button>
              })}
              {filteredWorkCatalog.length === 0 ? <p>No se encontraron trabajos en el catálogo.</p> : null}
            </div>
            <div className="maintenance-work-modal__divider"><span>o trabajo personalizado</span></div>
            <button className="maintenance-work-modal__manual-toggle" onClick={() => { setIsManualWorkMode((current) => !current); setSelectedCatalogIds(new Set()); setWorkActionError(null) }} type="button">+ Trabajo personalizado</button>
            {isManualWorkMode ? <label className="maintenance-work-modal__field">
              <span>Descripción del trabajo</span>
              <input onChange={(event) => setManualWorkDescription(event.target.value)} placeholder="Describe el trabajo" value={manualWorkDescription} />
            </label> : null}
            <div className="maintenance-work-modal__selection-summary">
              {isManualWorkMode ? "Trabajo personalizado" : selectedCatalogIds.size > 0 ? `${selectedCatalogIds.size} ${selectedCatalogIds.size === 1 ? "trabajo seleccionado" : "trabajos seleccionados"}` : "Selecciona uno o más trabajos"}
            </div>
            <footer className="maintenance-work-modal__footer">
              <button className="button button--secondary" onClick={() => setIsWorkModalOpen(false)} type="button">Cancelar</button>
              <button className="button button--primary" disabled={savingWorkId === "new" || (isManualWorkMode ? !manualWorkDescription.trim() : selectedCatalogIds.size === 0)} onClick={() => void addWorkItems()} type="button"><Plus aria-hidden="true" size={17} />{isManualWorkMode ? "Agregar trabajo" : selectedCatalogIds.size === 0 ? "Agregar trabajos" : `Agregar ${selectedCatalogIds.size} ${selectedCatalogIds.size === 1 ? "trabajo" : "trabajos"}`}</button>
            </footer>
          </section>
        </div>
      ) : null}

      {isFormOpen ? (
        <MaintenanceReportForm
          error={saveError}
          isSaving={isSaving}
          maintenance={maintenance}
          onClose={() => setIsFormOpen(false)}
          onCloseMaintenance={handleCloseMaintenance}
          onSubmit={handleSave}
          report={report}
          workItems={workItems}
          parts={parts}
          costItems={costItems}
          vehicleLabel={`${vehicle.internalCode} · ${vehicleName}`}
        />
      ) : null}
    </section>
  )
}
