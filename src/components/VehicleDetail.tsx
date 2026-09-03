import {
  ArrowLeft,
  CalendarClock,
  ClipboardCheck,
  Edit3,
  FileText,
  Gauge,
  History,
  IdCard,
  ShieldCheck,
  TriangleAlert,
  Wrench,
} from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { MaintenancePanel } from "./MaintenancePanel"
import { MaintenanceReportView } from "./MaintenanceReportView"
import { StatusBadge } from "./StatusBadge"
import { VehicleDocumentPanel } from "./VehicleDocumentPanel"
import { getMaintenanceByVehicle } from "../services/maintenance"
import { getCurrentVehicleDocument } from "../services/vehicleDocuments"
import type { MaintenanceRecord } from "../types/maintenance"
import type { VehicleDocument, VehicleInspectionResult } from "../types/vehicleDocument"
import type { Vehicle } from "../types/vehicle"
import { getDocumentStatus } from "../utils/documentStatus"
import { displayValue, formatCurrency, formatDate, formatMileage } from "../utils/formatters"

interface VehicleDetailProps {
  vehicle: Vehicle
  onBackToFleet: () => void
  onEdit: () => void
  onVehicleMileageSynced: (vehicleId: string, mileage: number) => void
  onFeedback: (message: string) => void
}

type UnitTab =
  | "summary"
  | "maintenance"
  | "upcoming"
  | "issues"
  | "information"
  | "insurancePolicy"
  | "registrationCard"
  | "vehicleInspection"

type DocumentPanelKind = "insurance_policy" | "registration_card" | "vehicle_inspection"

const documentPanelByTab: Record<Extract<UnitTab, "insurancePolicy" | "registrationCard" | "vehicleInspection">, DocumentPanelKind> = {
  insurancePolicy: "insurance_policy",
  registrationCard: "registration_card",
  vehicleInspection: "vehicle_inspection",
}

const inspectionResultLabels: Record<VehicleInspectionResult, string> = {
  approved: "Aprobada",
  rejected: "Rechazada",
  not_applicable: "No aplica",
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function PreparedModule({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <section className="prepared-module">
      <div className="prepared-module__icon">{icon}</div>
      <div>
      <span>Módulo en preparación</span>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </section>
  )
}

function InformationGroup({
  title,
  children,
  className = "",
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`information-group ${className}`.trim()}>
      <h3>{title}</h3>
      <div className="information-grid">{children}</div>
    </section>
  )
}

export function VehicleDetail({
  vehicle,
  onBackToFleet,
  onEdit,
  onVehicleMileageSynced,
  onFeedback,
}: VehicleDetailProps) {
  const [activeTab, setActiveTab] = useState<UnitTab>("summary")
  const [reportMaintenanceId, setReportMaintenanceId] = useState<string | null>(null)
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([])
  const [isMaintenanceSummaryLoading, setIsMaintenanceSummaryLoading] = useState(false)
  const [maintenanceSummaryError, setMaintenanceSummaryError] = useState<string | null>(null)
  const [vehicleDocuments, setVehicleDocuments] = useState<Record<DocumentPanelKind, VehicleDocument | null>>({
    insurance_policy: null,
    registration_card: null,
    vehicle_inspection: null,
  })
  const [isDocumentSummaryLoading, setIsDocumentSummaryLoading] = useState(false)
  const [documentSummaryError, setDocumentSummaryError] = useState<string | null>(null)
  const fullName = [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(" ")
  const identityLine = [String(vehicle.year), vehicle.licensePlate].filter(Boolean).join(" · ")
  const stateLicensePlate = vehicle.stateLicensePlate?.trim() || null
  const federalLicensePlate = vehicle.federalLicensePlate?.trim() || null
  const fuelLabels = vehicle.fuelTypes.filter(Boolean)
  const usesFuelTank = fuelLabels.some((fuel) => ["Gasolina", "Diésel", "Gas LP", "Gas Natural"].includes(fuel))
  const hasTankCapacity = usesFuelTank && vehicle.tankCapacityLiters !== null && vehicle.tankCapacityLiters > 0

  useEffect(() => {
    if (activeTab === "information") {
      setActiveTab("summary")
    }
  }, [activeTab])

  useEffect(() => {
    let isActive = true

    const loadMaintenanceSummary = async () => {
      setIsMaintenanceSummaryLoading(true)
      setMaintenanceSummaryError(null)

      try {
        const items = await getMaintenanceByVehicle(vehicle.id)
        if (isActive) {
          setMaintenanceRecords(items)
        }
      } catch (error) {
        if (isActive) {
          setMaintenanceRecords([])
          setMaintenanceSummaryError(error instanceof Error ? error.message : "No se pudo cargar el resumen.")
        }
      } finally {
        if (isActive) {
          setIsMaintenanceSummaryLoading(false)
        }
      }
    }

    void loadMaintenanceSummary()

    return () => {
      isActive = false
    }
  }, [vehicle.id])

  useEffect(() => {
    let isActive = true

    const loadDocuments = async () => {
      setIsDocumentSummaryLoading(true)
      setDocumentSummaryError(null)

      try {
        const [insurancePolicy, registrationCard, vehicleInspection] = await Promise.all([
          getCurrentVehicleDocument(vehicle.id, "insurance_policy"),
          getCurrentVehicleDocument(vehicle.id, "registration_card"),
          getCurrentVehicleDocument(vehicle.id, "vehicle_inspection"),
        ])

        if (isActive) {
          setVehicleDocuments({
            insurance_policy: insurancePolicy,
            registration_card: registrationCard,
            vehicle_inspection: vehicleInspection,
          })
        }
      } catch (error) {
        if (isActive) {
          setVehicleDocuments({
            insurance_policy: null,
            registration_card: null,
            vehicle_inspection: null,
          })
          setDocumentSummaryError(error instanceof Error ? error.message : "No se pudieron cargar los documentos.")
        }
      } finally {
        if (isActive) {
          setIsDocumentSummaryLoading(false)
        }
      }
    }

    void loadDocuments()

    return () => {
      isActive = false
    }
  }, [vehicle.id])

  const sortedMaintenanceRecords = useMemo(() => {
    return [...maintenanceRecords].sort((a, b) => {
      const dateComparison = b.serviceDate.localeCompare(a.serviceDate)
      return dateComparison || b.createdAt.localeCompare(a.createdAt)
    })
  }, [maintenanceRecords])

  const latestMaintenance = sortedMaintenanceRecords.find((record) => record.status !== "open") ?? null
  const reportMaintenance = reportMaintenanceId
    ? maintenanceRecords.find((record) => record.id === reportMaintenanceId) ?? null
    : null
  const nextServiceRecord =
    sortedMaintenanceRecords.find(
      (record) => record.nextServiceMileage !== null || record.nextServiceDate !== null,
    ) ?? null
  const remainingMileage =
    nextServiceRecord?.nextServiceMileage === null || nextServiceRecord?.nextServiceMileage === undefined
      ? null
      : nextServiceRecord.nextServiceMileage - vehicle.currentMileage

  const insurancePolicy = vehicleDocuments.insurance_policy
  const registrationCard = vehicleDocuments.registration_card
  const vehicleInspection = vehicleDocuments.vehicle_inspection
  const tabs: Array<{ id: UnitTab; label: string; icon: ReactNode }> = [
    { id: "summary", label: "Resumen", icon: <Gauge aria-hidden="true" size={17} /> },
    { id: "maintenance", label: "Mantenimientos", icon: <Wrench aria-hidden="true" size={17} /> },
    { id: "upcoming", label: "Próximos servicios", icon: <CalendarClock aria-hidden="true" size={17} /> },
    { id: "issues", label: "Fallas", icon: <TriangleAlert aria-hidden="true" size={17} /> },
  ]
  const insuranceStatus = getDocumentStatus(insurancePolicy)
  const registrationStatus = getDocumentStatus(registrationCard)
  const inspectionStatus = getDocumentStatus(vehicleInspection)
  const insuranceComplete = insurancePolicy !== null && ["Vigente", "Próximo a vencer"].includes(insuranceStatus.label)
  const registrationComplete = registrationCard !== null && registrationStatus.label !== "Vencido"
  const pendingDocumentCount = [!insuranceComplete, !registrationComplete].filter(Boolean).length
  const isDocumentallyEnabled = !isDocumentSummaryLoading && !documentSummaryError && pendingDocumentCount === 0
  const hasPendingRequiredDocuments = !isDocumentSummaryLoading && !documentSummaryError && pendingDocumentCount > 0
  const isDocumentView =
    activeTab === "insurancePolicy" || activeTab === "registrationCard" || activeTab === "vehicleInspection"
  const documentShortcuts = [
    {
      label: "Póliza de seguro",
      detail: insurancePolicy
        ? `${displayValue(insurancePolicy.issuer)} · Vence ${formatDate(insurancePolicy.validUntil)}`
        : "Sin registrar",
      status: insurancePolicy ? insuranceStatus.label : "Pendiente",
      statusTone: insurancePolicy ? insuranceStatus.tone : "warning",
      isRequired: true,
      isPending: !insuranceComplete,
      icon: <ShieldCheck aria-hidden="true" size={17} />,
      onClick: () => setActiveTab("insurancePolicy"),
    },
    {
      label: "Tarjeta de circulación",
      detail: registrationCard
        ? displayValue(registrationCard.details.plateNumber ?? vehicle.licensePlate ?? registrationCard.issuer)
        : "Sin registrar",
      status: registrationCard ? registrationStatus.label : "Pendiente",
      statusTone: registrationCard ? registrationStatus.tone : "warning",
      isRequired: true,
      isPending: !registrationComplete,
      icon: <IdCard aria-hidden="true" size={17} />,
      onClick: () => setActiveTab("registrationCard"),
    },
    {
      label: "Verificación vehicular",
      detail: vehicleInspection
        ? vehicleInspection.validFrom
          ? `Última: ${formatDate(vehicleInspection.validFrom)}`
          : displayValue(vehicleInspection.issuer)
        : "Sin registrar",
      status: vehicleInspection?.details.verificationResult
        ? inspectionResultLabels[vehicleInspection.details.verificationResult]
        : vehicleInspection
          ? inspectionStatus.label
          : "Opcional",
      statusTone: vehicleInspection?.details.verificationResult === "approved" || vehicleInspection?.details.verificationResult === "not_applicable"
        ? "current"
        : vehicleInspection?.details.verificationResult === "rejected"
          ? "warning"
          : vehicleInspection
            ? inspectionStatus.tone
            : "neutral",
      isRequired: false,
      isPending: false,
      icon: <ClipboardCheck aria-hidden="true" size={17} />,
      onClick: () => setActiveTab("vehicleInspection"),
    },
  ]

  if (reportMaintenance) {
    return (
      <MaintenanceReportView
        maintenance={reportMaintenance}
        onBack={() => {
          setReportMaintenanceId(null)
          setActiveTab("maintenance")
        }}
        onMaintenanceChanged={(changedMaintenance) =>
          setMaintenanceRecords((current) =>
            current.map((maintenance) => (maintenance.id === changedMaintenance.id ? changedMaintenance : maintenance)),
          )
        }
        vehicle={vehicle}
      />
    )
  }

  return (
    <article className="vehicle-detail">
      <button className="fleet-back-button" onClick={onBackToFleet} type="button">
        <ArrowLeft aria-hidden="true" size={17} />
        Flota
      </button>

      <header className="vehicle-detail__hero">
        <div>
          <div className="vehicle-detail__info-label">Número económico</div>
          <h2>{vehicle.internalCode}</h2>
          <p>{fullName}</p>
          <span>{identityLine}</span>
        </div>
        <div className="vehicle-detail__vehicle-visual">
          <img src="/vehicle-van-transparent.png" alt="" />
          {fuelLabels.length > 0 ? (
            <div className="vehicle-detail__quick-specs">
              <div className="vehicle-detail__quick-spec">
                <span className="vehicle-detail__info-label">Combustible</span>
                <strong>{fuelLabels.join(" · ")}</strong>
              </div>
              {hasTankCapacity ? (
                <div className="vehicle-detail__quick-spec">
                  <span className="vehicle-detail__info-label">Capacidad del tanque</span>
                  <strong>{vehicle.tankCapacityLiters} L</strong>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="vehicle-detail__summary">
          <div className="vehicle-detail__operations">
            <div className="vehicle-detail__operation-group">
              <span className="vehicle-detail__info-label">VIN / Número de serie</span>
              <strong className="vehicle-detail__operation-value vehicle-detail__operation-value--identifier">{vehicle.vin}</strong>
            </div>
            {stateLicensePlate || federalLicensePlate ? (
              <div className="vehicle-detail__operation-group">
                <span className="vehicle-detail__info-label">Placas</span>
                <strong className="vehicle-detail__operation-value">
                  {[
                    stateLicensePlate ? `Estatal: ${stateLicensePlate}` : null,
                    federalLicensePlate ? `Federal: ${federalLicensePlate}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </strong>
              </div>
            ) : null}
            <div className="vehicle-detail__operation-group">
              <span className="vehicle-detail__info-label">Kilometraje actual</span>
              <strong className="vehicle-detail__mileage">{formatMileage(vehicle.currentMileage)} km</strong>
            </div>
            <div className="vehicle-detail__operation-group">
              <span className="vehicle-detail__info-label">Estado</span>
              <div className="vehicle-detail__badge-row">
                <StatusBadge status={vehicle.status} />
              </div>
            </div>
          </div>
        </div>
      </header>

      {!isDocumentView ? (
        <div className="vehicle-tabs-row">
          <div className="vehicle-tabs" role="tablist" aria-label="Expediente de unidad">
            {tabs.map((tab) => (
              <button
                aria-selected={activeTab === tab.id}
                className={activeTab === tab.id ? "vehicle-tab vehicle-tab--active" : "vehicle-tab"}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                type="button"
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
          <button className="button button--secondary vehicle-tabs-row__action" onClick={onEdit} type="button">
            <Edit3 aria-hidden="true" size={17} />
            Editar unidad
          </button>
        </div>
      ) : null}

      {activeTab === "summary" ? (
        <div className="unit-summary">
          <section className="next-service-card">
            <div className="section-title">
              <CalendarClock aria-hidden="true" size={18} />
              <h3>Próximo mantenimiento</h3>
            </div>
            {isMaintenanceSummaryLoading ? (
              <p>Cargando programación...</p>
            ) : maintenanceSummaryError ? (
              <p>No se pudo cargar la programación.</p>
            ) : nextServiceRecord ? (
              <>
                <strong>
                  {nextServiceRecord.nextServiceMileage === null
                    ? "Sin kilometraje"
                    : `${formatMileage(nextServiceRecord.nextServiceMileage)} km`}
                </strong>
                <span>{formatDate(nextServiceRecord.nextServiceDate)}</span>
                <p>{nextServiceRecord.maintenanceType}</p>
                <small>
                  Faltan:{" "}
                  {remainingMileage === null
                    ? "Sin dato"
                    : remainingMileage > 0
                      ? `${formatMileage(remainingMileage)} km`
                      : "Servicio alcanzado"}
                </small>
              </>
            ) : (
              <>
                <strong>Sin próximo servicio programado</strong>
                <p>Registra el próximo servicio desde el historial de mantenimientos.</p>
                <button className="button button--soft-primary" onClick={() => setActiveTab("maintenance")} type="button">
                  <CalendarClock aria-hidden="true" size={17} />
                  Programar servicio
                </button>
              </>
            )}
          </section>

          <section className="summary-card summary-card--maintenance">
            <div className="section-title">
              <History aria-hidden="true" size={18} />
              <h3>Mantenimientos</h3>
            </div>
            {isMaintenanceSummaryLoading ? (
              <p>Cargando historial reciente...</p>
            ) : maintenanceSummaryError ? (
              <p>No se pudo cargar el historial reciente.</p>
            ) : latestMaintenance ? (
              <>
                <span>Último servicio</span>
                <strong>{formatDate(latestMaintenance.serviceDate)}</strong>
                <p>
                  {latestMaintenance.maintenanceType} · {latestMaintenance.mileage === null ? "—" : `${formatMileage(latestMaintenance.mileage)} km`} ·{" "}
                  {formatCurrency(latestMaintenance.totalCost)}
                </p>
                <button className="button button--secondary" onClick={() => setActiveTab("maintenance")} type="button">
                  Ver historial
                </button>
              </>
            ) : (
              <>
                <strong>Sin mantenimientos registrados</strong>
                <p>El historial se construirá desde los servicios capturados.</p>
                <button className="button button--secondary" onClick={() => setActiveTab("maintenance")} type="button">
                  Registrar mantenimiento
                </button>
              </>
            )}
          </section>

          <section className={`summary-card documentation-summary-card${hasPendingRequiredDocuments ? " documentation-summary-card--pending" : ""}`}>
            <div className="section-title">
              {hasPendingRequiredDocuments ? (
                <TriangleAlert aria-hidden="true" className="documentation-summary-card__warning" size={18} />
              ) : (
                <FileText aria-hidden="true" size={18} />
              )}
              <h3>Documentación</h3>
            </div>
            <div className="document-shortcuts">
              {isDocumentSummaryLoading ? (
                <div className="state-card document-shortcuts__state">Cargando documentos...</div>
              ) : documentSummaryError ? (
                <div className="state-card state-card--warning document-shortcuts__state">
                  <strong>No se pudieron cargar los documentos</strong>
                  <span>{documentSummaryError}</span>
                </div>
              ) : documentShortcuts.map((item) => (
                <button
                  className="document-shortcut"
                  key={item.label}
                  onClick={item.onClick}
                  type="button"
                >
                  <span className="document-shortcut__icon">{item.icon}</span>
                  {item.isRequired && item.isPending ? <TriangleAlert aria-label="Documentación pendiente" className="document-shortcut__warning" size={16} /> : null}
                  <span className="document-shortcut__content">
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </span>
                  {item.status ? (
                    <span className={`document-status document-status--${item.statusTone}`}>{item.status}</span>
                  ) : null}
                </button>
              ))}
            </div>
            {hasPendingRequiredDocuments ? (
              <div className="documentation-readiness-note">
                <TriangleAlert aria-hidden="true" size={17} />
                <span>Esta unidad aún no está habilitada para operar. Completa la documentación obligatoria pendiente.</span>
              </div>
            ) : null}
          </section>

          <button className="summary-card summary-card--prepared" onClick={() => setActiveTab("issues")} type="button">
            <div className="section-title">
              <TriangleAlert aria-hidden="true" size={18} />
              <h3>Fallas reportadas</h3>
            </div>
            <strong>Módulo en preparación</strong>
            <p>Reportes de falla, severidad y órdenes correctivas quedarán concentrados aquí.</p>
          </button>
        </div>
      ) : null}

      {activeTab === "maintenance" ? (
        <MaintenancePanel
          onRecordsChanged={setMaintenanceRecords}
          onFeedback={onFeedback}
          onVehicleMileageSynced={onVehicleMileageSynced}
          onViewReport={setReportMaintenanceId}
          vehicle={vehicle}
        />
      ) : null}

      {activeTab === "upcoming" ? (
        <PreparedModule
          description="Este espacio alojará reglas, alertas y servicios programados cuando el módulo esté listo."
          icon={<CalendarClock aria-hidden="true" size={24} />}
          title="Próximos servicios"
        />
      ) : null}

      {activeTab === "insurancePolicy" ? (
        <VehicleDocumentPanel
          document={insurancePolicy}
          documentType="insurance_policy"
          error={documentSummaryError}
          isLoading={isDocumentSummaryLoading}
          onBackToSummary={() => setActiveTab("summary")}
          onDocumentChanged={(document) =>
            setVehicleDocuments((current) => ({ ...current, insurance_policy: document }))
          }
          onFeedback={onFeedback}
          vehicle={vehicle}
        />
      ) : null}

      {activeTab === "registrationCard" ? (
        <VehicleDocumentPanel
          document={registrationCard}
          documentType={documentPanelByTab.registrationCard}
          error={documentSummaryError}
          isLoading={isDocumentSummaryLoading}
          onBackToSummary={() => setActiveTab("summary")}
          onDocumentChanged={(document) =>
            setVehicleDocuments((current) => ({ ...current, registration_card: document }))
          }
          onFeedback={onFeedback}
          vehicle={vehicle}
        />
      ) : null}

      {activeTab === "vehicleInspection" ? (
        <VehicleDocumentPanel
          document={vehicleInspection}
          documentType={documentPanelByTab.vehicleInspection}
          error={documentSummaryError}
          isLoading={isDocumentSummaryLoading}
          onBackToSummary={() => setActiveTab("summary")}
          onDocumentChanged={(document) =>
            setVehicleDocuments((current) => ({ ...current, vehicle_inspection: document }))
          }
          onFeedback={onFeedback}
          vehicle={vehicle}
        />
      ) : null}

      {activeTab === "issues" ? (
        <PreparedModule
          description="Aquí se registrarán fallas, severidad, seguimiento y órdenes correctivas."
          icon={<TriangleAlert aria-hidden="true" size={24} />}
          title="Fallas"
        />
      ) : null}

      {activeTab === "information" ? (
        <section className="information-panel">
          <header className="information-panel__header">
            <div>
              <p>Ficha técnica</p>
              <h3>Información de la unidad</h3>
              <span>Datos técnicos y administrativos del vehículo.</span>
            </div>
          </header>

          <div className="information-sections">
            <InformationGroup title="Identificación">
              <DetailItem label="Código interno" value={vehicle.internalCode} />
              <DetailItem label="Marca" value={vehicle.brand} />
              <DetailItem label="Modelo" value={vehicle.model} />
              <DetailItem label="Año" value={String(vehicle.year)} />
              <DetailItem label="Placas" value={displayValue([vehicle.stateLicensePlate, vehicle.federalLicensePlate].filter(Boolean).join(" / ") || vehicle.licensePlate)} />
              <DetailItem label="VIN / número de serie" value={vehicle.vin} />
            </InformationGroup>

            <InformationGroup title="Características">
              <DetailItem label="Color" value={displayValue(vehicle.color)} />
              <DetailItem label="Tipo de combustible" value={vehicle.fuelTypes.join(" + ") || displayValue(vehicle.fuelType)} />
              <DetailItem label="Capacidad del tanque" value={displayValue(vehicle.tankCapacityLiters, " L")} />
            </InformationGroup>

            <InformationGroup className="information-group--compact" title="Adquisición">
              <DetailItem label="Fecha de adquisición" value={formatDate(vehicle.acquisitionDate)} />
            </InformationGroup>
          </div>
        </section>
      ) : null}
    </article>
  )
}
