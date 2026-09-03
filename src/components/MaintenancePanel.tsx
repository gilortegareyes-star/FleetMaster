import { CalendarDays, Edit3, FileText, Plus, Wrench } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { MaintenanceForm } from "./MaintenanceForm"
import { NewMaintenanceOrderForm } from "./NewMaintenanceOrderForm"
import {
  createOpenMaintenanceOrder,
  createMaintenance,
  getMaintenanceById,
  getMaintenanceByVehicle,
  updateMaintenance,
} from "../services/maintenance"
import { getMaintenanceReport } from "../services/maintenanceReports"
import { getMaintenanceParts } from "../services/maintenanceParts"
import { getMaintenanceCostItems } from "../services/maintenanceCostItems"
import type { MaintenancePayload, MaintenanceRecord, OpenMaintenanceOrderPayload } from "../types/maintenance"
import type { MaintenanceReport } from "../types/maintenanceReport"
import type { Vehicle } from "../types/vehicle"
import { displayValue, formatCurrency, formatDate, formatMileage } from "../utils/formatters"
import { calculateMaintenanceCostTotal } from "../utils/maintenanceCosts"

interface MaintenancePanelProps {
  vehicle: Vehicle
  onVehicleMileageSynced: (vehicleId: string, mileage: number) => void
  onFeedback: (message: string) => void
  onRecordsChanged?: (records: MaintenanceRecord[]) => void
  onViewReport?: (maintenanceId: string) => void
}

type MaintenanceFormState =
  | { mode: "create" }
  | { mode: "edit"; maintenance: MaintenanceRecord; structuredTotal: number | null }
  | null

const hasText = (value: string | null): value is string => typeof value === "string" && value.trim().length > 0

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))

function ServiceInfo({
  label,
  value,
  featured = false,
  multiline = false,
}: {
  label: string
  value: string
  featured?: boolean
  multiline?: boolean
}) {
  const className = [
    "service-info",
    featured ? "service-info--featured" : "",
    multiline ? "service-info--multiline" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className={className}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function MaintenancePanel({
  vehicle,
  onVehicleMileageSynced,
  onFeedback,
  onRecordsChanged,
  onViewReport,
}: MaintenancePanelProps) {
  const [records, setRecords] = useState<MaintenanceRecord[]>([])
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const [formState, setFormState] = useState<MaintenanceFormState>(null)
  const [isOrderFormOpen, setIsOrderFormOpen] = useState(false)
  const [openReport, setOpenReport] = useState<MaintenanceReport | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    const loadMaintenance = async () => {
      setIsLoading(true)
      setLoadError(null)
      setSelectedRecordId(null)

      try {
        const items = await getMaintenanceByVehicle(vehicle.id)
        const activeOrder = items.find((item) => item.status === "open") ?? null
        let activeOrderReport: MaintenanceReport | null = null

        if (activeOrder) {
          try {
            activeOrderReport = await getMaintenanceReport(activeOrder.id)
          } catch {
            activeOrderReport = null
          }
        }

        setRecords(items)
        onRecordsChanged?.(items)
        setSelectedRecordId(items.find((item) => item.status !== "open")?.id ?? null)
        setOpenReport(activeOrderReport)
      } catch (error) {
        setRecords([])
        setOpenReport(null)
        onRecordsChanged?.([])
        setLoadError(error instanceof Error ? error.message : "No se pudo cargar el historial.")
      } finally {
        setIsLoading(false)
      }
    }

    void loadMaintenance()
  }, [vehicle.id])

  const selectedRecord = useMemo(() => {
    return records.find((record) => record.id === selectedRecordId && record.status !== "open") ?? records.find((record) => record.status !== "open") ?? null
  }, [records, selectedRecordId])

  const openRecord = useMemo(() => records.find((record) => record.status === "open") ?? null, [records])

  const sortedRecords = useMemo(() => {
    return records.filter((record) => record.status !== "open").sort((a, b) => {
      const dateComparison = b.serviceDate.localeCompare(a.serviceDate)
      return dateComparison || b.createdAt.localeCompare(a.createdAt)
    })
  }, [records])

  const nextServiceSummary = selectedRecord
    ? [
        selectedRecord.nextServiceMileage === null
          ? null
          : `${formatMileage(selectedRecord.nextServiceMileage)} km`,
        selectedRecord.nextServiceDate === null ? null : formatDate(selectedRecord.nextServiceDate),
      ]
        .filter(Boolean)
        .join(" · ") || null
    : null

  const syncVehicleMileage = (mileage: number | null) => {
    if (mileage !== null && mileage > vehicle.currentMileage) {
      onVehicleMileageSynced(vehicle.id, mileage)
    }
  }

  const handleCreateMaintenance = async (payload: MaintenancePayload) => {
    setIsSaving(true)
    setSaveError(null)

    try {
      const created = await createMaintenance(payload)
      setRecords((current) => {
        const nextRecords = [created, ...current]
        onRecordsChanged?.(nextRecords)
        return nextRecords
      })
      setSelectedRecordId(created.id)
      syncVehicleMileage(created.mileage)
      setFormState(null)
      onFeedback("Mantenimiento registrado correctamente.")
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar el mantenimiento.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateOrder = async (payload: OpenMaintenanceOrderPayload) => {
    setIsSaving(true)
    setSaveError(null)

    try {
      const created = await createOpenMaintenanceOrder(payload)
      setRecords((current) => {
        const nextRecords = [created.maintenance, ...current]
        onRecordsChanged?.(nextRecords)
        return nextRecords
      })
      setOpenReport(created.report)
      setSelectedRecordId(null)
      setIsOrderFormOpen(false)
      onFeedback("Orden de mantenimiento abierta correctamente.")
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo abrir la orden.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdateMaintenance = async (maintenanceId: string, payload: MaintenancePayload) => {
    setIsSaving(true)
    setSaveError(null)

    try {
      const updated = await updateMaintenance(maintenanceId, payload)
      const freshRecord = await getMaintenanceById(updated.id)
      setRecords((current) => {
        const nextRecords = current.map((record) => (record.id === freshRecord.id ? freshRecord : record))
        onRecordsChanged?.(nextRecords)
        return nextRecords
      })
      setSelectedRecordId(freshRecord.id)
      syncVehicleMileage(freshRecord.mileage)
      setFormState(null)
      onFeedback("Mantenimiento actualizado correctamente.")
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar el mantenimiento.")
    } finally {
      setIsSaving(false)
    }
  }

  const openCreateForm = () => {
    setSaveError(null)
    setFormState({ mode: "create" })
  }

  const openOrderForm = () => {
    if (openRecord) {
      onFeedback(`Ya existe el mantenimiento en curso ${openRecord.folio}.`)
      return
    }

    setSaveError(null)
    setIsOrderFormOpen(true)
  }

  const openEditForm = async (maintenance: MaintenanceRecord) => {
    setSaveError(null)

    try {
      const [parts, costItems] = await Promise.all([
        getMaintenanceParts(maintenance.id),
        getMaintenanceCostItems(maintenance.id),
      ])
      setFormState({
        mode: "edit",
        maintenance,
        structuredTotal: parts.length > 0 || costItems.length > 0 ? calculateMaintenanceCostTotal(parts, costItems) : null,
      })
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "No se pudo verificar el desglose económico.")
    }
  }

  return (
    <section className="maintenance-module">
      <header className="maintenance-header">
        <div>
          <p>Historial</p>
          <h3>Mantenimientos</h3>
          <span>Historial y servicios realizados a esta unidad</span>
        </div>
      </header>

      {isLoading ? (
        <div className="state-card">Cargando mantenimientos...</div>
      ) : loadError ? (
        <div className="state-card state-card--warning">
          <strong>No se pudo cargar el historial</strong>
          <span>{loadError}</span>
        </div>
      ) : records.length === 0 ? (
        <div className="empty-state">
          <Wrench aria-hidden="true" size={34} />
          <strong>Esta unidad todavía no tiene mantenimientos registrados.</strong>
          <span>El historial de mantenimientos de esta unidad aparecerá aquí.</span>
        </div>
      ) : (
        <>
          {openRecord ? (
            <section className="maintenance-open-order">
              <header>
                <div>
                  <span>Mantenimiento en curso</span>
                  <h4>{openRecord.folio}</h4>
                </div>
                <span className="maintenance-open-order__status">En curso</span>
              </header>
              <div className="maintenance-open-order__details">
                <div><strong>{openRecord.maintenanceType}</strong><span>Tipo de mantenimiento</span></div>
                <div><strong>{openReport?.entryAt ? formatDateTime(openReport.entryAt) : "—"}</strong><span>Ingresó</span></div>
                <div><strong>{openReport?.entryMileage === null || openReport?.entryMileage === undefined ? "—" : `${formatMileage(openReport.entryMileage)} km`}</strong><span>Kilometraje de entrada</span></div>
                {hasText(openRecord.provider) ? <div><strong>{openRecord.provider}</strong><span>Proveedor</span></div> : null}
              </div>
              <button className="button button--primary" onClick={() => onViewReport?.(openRecord.id)} type="button">
                Continuar mantenimiento
              </button>
            </section>
          ) : null}

          {sortedRecords.length > 0 ? (
            <div className="maintenance-layout">
              <div className="maintenance-list">
                {sortedRecords.map((record) => (
              <button
                className={`maintenance-card ${selectedRecord?.id === record.id ? "maintenance-card--selected" : ""}`}
                key={record.id}
                onClick={() => setSelectedRecordId(record.id)}
                type="button"
              >
                <div className="maintenance-card__date">
                  <CalendarDays aria-hidden="true" size={17} />
                  <span>{formatDate(record.serviceDate)}</span>
                </div>
                <h4>{record.maintenanceType}</h4>
                <p>{record.description}</p>
                <div className="maintenance-card__meta">
                  <span>{record.mileage === null ? "—" : `${formatMileage(record.mileage)} km`}</span>
                  <span>{formatCurrency(record.totalCost)}</span>
                  <span>{displayValue(record.provider)}</span>
                </div>
                </button>
                ))}
              </div>

              {selectedRecord ? (
            <article className="maintenance-detail">
              <header className="maintenance-detail__header">
                <div>
                  <span className="maintenance-detail__folio">{selectedRecord.folio}</span>
                  <h3>{selectedRecord.maintenanceType}</h3>
                  <p>
                    {formatDate(selectedRecord.serviceDate)} · {selectedRecord.mileage === null ? "—" : `${formatMileage(selectedRecord.mileage)} km`}
                  </p>
                </div>
                <div className="maintenance-detail__actions">
                  <button className="button button--secondary" onClick={() => onViewReport?.(selectedRecord.id)} type="button">
                    <FileText aria-hidden="true" size={17} />
                    Ver informe
                  </button>
                  <button className="button button--secondary" onClick={() => void openEditForm(selectedRecord)} type="button">
                    <Edit3 aria-hidden="true" size={17} />
                    Editar mantenimiento
                  </button>
                </div>
              </header>

              <div className="maintenance-detail__cost">{formatCurrency(selectedRecord.totalCost)}</div>

              <section className="maintenance-work">
                <span>Trabajo realizado</span>
                <p>{selectedRecord.description}</p>
              </section>

              <div className="maintenance-info-grid">
                {hasText(selectedRecord.provider) ? (
                  <ServiceInfo label="Taller / proveedor" value={selectedRecord.provider.trim()} />
                ) : null}
                {nextServiceSummary ? <ServiceInfo label="Próximo servicio" value={nextServiceSummary} featured /> : null}
                {hasText(selectedRecord.notes) ? <ServiceInfo label="Notas" value={selectedRecord.notes.trim()} multiline /> : null}
              </div>
            </article>
              ) : null}
            </div>
          ) : (
            <div className="maintenance-history-empty">No hay mantenimientos históricos registrados todavía.</div>
          )}
        </>
      )}

      {isOrderFormOpen ? (
        <NewMaintenanceOrderForm
          error={saveError}
          isSaving={isSaving}
          onClose={() => setIsOrderFormOpen(false)}
          onSubmit={handleCreateOrder}
          vehicle={vehicle}
        />
      ) : null}

      {formState ? (
        <MaintenanceForm
          error={saveError}
          isSaving={isSaving}
          maintenance={formState.mode === "edit" ? formState.maintenance : undefined}
          mode={formState.mode}
          onClose={() => setFormState(null)}
          onSubmit={(payload) =>
            formState.mode === "create"
              ? handleCreateMaintenance(payload)
              : handleUpdateMaintenance(formState.maintenance.id, payload)
          }
          structuredTotal={formState.mode === "edit" ? formState.structuredTotal : null}
          vehicle={vehicle}
        />
      ) : null}
    </section>
  )
}
