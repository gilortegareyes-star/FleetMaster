import {
  ArrowLeft,
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  ClipboardCheck,
  ExternalLink,
  FileText,
  FileUp,
  Gauge,
  IdCard,
  ReceiptText,
  ShieldCheck,
  X,
} from "lucide-react"
import { createPortal } from "react-dom"
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import {
  createInsurancePolicy,
  createRegistrationCard,
  createVehicleDocumentSignedUrl,
  createVehicleInspection,
} from "../services/vehicleDocuments"
import type { Vehicle } from "../types/vehicle"
import type {
  CirculationType,
  InsurancePolicyPayload,
  RegistrationCardPayload,
  VehicleDocument,
  VehicleDocumentType,
  VehicleInspectionPayload,
  VehicleInspectionResult,
} from "../types/vehicleDocument"
import { getDocumentStatus } from "../utils/documentStatus"
import { displayValue, formatCurrency, formatDate } from "../utils/formatters"
import { VehicleDocumentIdentity } from "./VehicleDocumentIdentity"

type DocumentPanelKind = Extract<VehicleDocumentType, "insurance_policy" | "registration_card" | "vehicle_inspection">

interface VehicleDocumentPanelProps {
  vehicle: Vehicle
  documentType: DocumentPanelKind
  circulationType?: CirculationType | null
  registrationFormRequest?: number
  document: VehicleDocument | null
  isLoading: boolean
  error: string | null
  onBackToSummary: () => void
  onDocumentChanged: (document: VehicleDocument) => void
  onFeedback: (message: string) => void
  onRegister?: () => void
  onRegistrationFlowReset?: () => void
}

interface FieldValues {
  issuer: string
  documentNumber: string
  validFrom: string
  validUntil: string
  cost: string
  contactName: string
  contactPhone: string
  plateNumber: string
  issuingState: string
  verificationResult: VehicleInspectionResult | ""
  notes: string
  file: File | null
}

type FieldErrors = Partial<Record<keyof FieldValues, string>>

interface DocumentConfig {
  title: string
  emptyTitle: string
  emptyText: string
  uploadLabel: string
  updateLabel: string
  saveLabel: string
  savedMessage: string
  openLabel: string
  icon: ReactNode
}

const documentConfigs: Record<DocumentPanelKind, DocumentConfig> = {
  insurance_policy: {
    title: "Póliza de seguro",
    emptyTitle: "No hay una póliza registrada para esta unidad.",
    emptyText: "Mantén disponible la póliza vigente para consultar rápidamente la cobertura y los datos del seguro.",
    uploadLabel: "Subir póliza",
    updateLabel: "Actualizar póliza",
    saveLabel: "Guardar póliza",
    savedMessage: "Póliza de seguro guardada correctamente.",
    openLabel: "Ver póliza",
    icon: <ShieldCheck aria-hidden="true" size={28} />,
  },
  registration_card: {
    title: "Tarjeta de circulación",
    emptyTitle: "No hay una tarjeta de circulación registrada para esta unidad.",
    emptyText: "Registra el documento vigente para consultar folio, placas y entidad de expedición desde el expediente.",
    uploadLabel: "Registrar tarjeta",
    updateLabel: "Actualizar tarjeta",
    saveLabel: "Guardar tarjeta",
    savedMessage: "Tarjeta de circulación guardada correctamente.",
    openLabel: "Ver tarjeta",
    icon: <IdCard aria-hidden="true" size={28} />,
  },
  vehicle_inspection: {
    title: "Verificación vehicular",
    emptyTitle: "No hay una verificación vehicular registrada para esta unidad.",
    emptyText: "Registra la constancia o comprobante para consultar resultado, fecha y próxima verificación.",
    uploadLabel: "Registrar verificación",
    updateLabel: "Actualizar verificación",
    saveLabel: "Guardar verificación",
    savedMessage: "Verificación vehicular guardada correctamente.",
    openLabel: "Ver comprobante",
    icon: <ClipboardCheck aria-hidden="true" size={28} />,
  },
}

const emptyValues: FieldValues = {
  issuer: "",
  documentNumber: "",
  validFrom: "",
  validUntil: "",
  cost: "",
  contactName: "",
  contactPhone: "",
  plateNumber: "",
  issuingState: "",
  verificationResult: "",
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

const getVehiclePlate = (vehicle: Vehicle) =>
  vehicle.stateLicensePlate?.trim() || vehicle.federalLicensePlate?.trim() || vehicle.licensePlate?.trim() || ""

const resultLabels: Record<VehicleInspectionResult, string> = {
  approved: "Aprobada",
  rejected: "Rechazada",
  not_applicable: "No aplica",
}

function DocumentMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="policy-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

const getDocumentTitleValue = (documentType: DocumentPanelKind, document: VehicleDocument) => {
  if (documentType === "insurance_policy") {
    return displayValue(document.issuer)
  }

  if (documentType === "registration_card") {
    return displayValue(document.details.plateNumber ?? document.issuer)
  }

  const result = document.details.verificationResult
  return result ? resultLabels[result] : "Verificación registrada"
}

const getDocumentMetrics = (documentType: DocumentPanelKind, document: VehicleDocument, vehicle: Vehicle) => {
  if (documentType === "insurance_policy") {
    return [
      { label: "Póliza", value: displayValue(document.documentNumber) },
      { label: "Vigencia", value: `${formatDate(document.validFrom)} - ${formatDate(document.validUntil)}` },
      { label: "Teléfono", value: displayValue(document.contactPhone) },
      { label: "Agente / contacto", value: displayValue(document.contactName) },
      { label: "Costo", value: formatCurrency(document.cost) },
      { label: "Archivo", value: document.originalFilename },
    ]
  }

  if (documentType === "registration_card") {
    return [
      { label: "Placas", value: displayValue(document.details.plateNumber ?? vehicle.licensePlate) },
      { label: "Folio", value: displayValue(document.documentNumber) },
      { label: "Expedida en", value: displayValue(document.details.issuingState ?? document.issuer) },
      { label: "Fecha de expedición", value: formatDate(document.validFrom) },
      { label: "Vigencia", value: formatDate(document.validUntil) },
      { label: "Archivo", value: document.originalFilename },
    ]
  }

  const result = document.details.verificationResult
  return [
    { label: "Resultado", value: result ? resultLabels[result] : "Sin dato" },
    { label: "Fecha", value: formatDate(document.validFrom) },
    { label: "Folio", value: displayValue(document.documentNumber) },
    { label: "Centro", value: displayValue(document.issuer) },
    { label: "Próxima verificación", value: formatDate(document.validUntil) },
    { label: "Costo", value: formatCurrency(document.cost) },
    { label: "Archivo", value: document.originalFilename },
  ]
}

function VehicleDocumentForm({
  vehicle,
  documentType,
  circulationType,
  isSaving,
  error,
  onClose,
  onSubmit,
}: {
  vehicle: Vehicle
  documentType: DocumentPanelKind
  circulationType: CirculationType | null
  isSaving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (values: FieldValues) => Promise<void>
}) {
  const config = documentConfigs[documentType]
  const registrationTitle = circulationType === "federal" ? "Registrar tarjeta Federal" : "Registrar tarjeta Estatal"
  const vehiclePlate = circulationType === "federal"
    ? vehicle.federalLicensePlate?.trim() || ""
    : circulationType === "state"
      ? vehicle.stateLicensePlate?.trim() || ""
      : getVehiclePlate(vehicle)
  const [values, setValues] = useState<FieldValues>({
    ...emptyValues,
    plateNumber: documentType === "registration_card" ? vehiclePlate : "",
  })
  const [errors, setErrors] = useState<FieldErrors>({})

  const costPreview = useMemo(() => {
    const parsed = parseNumber(values.cost)
    return parsed === null || Number.isNaN(parsed) ? "$0.00" : formatCurrency(parsed)
  }, [values.cost])

  const updateValue = (field: keyof FieldValues, value: string | File | null) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const validate = () => {
    const nextErrors: FieldErrors = {}
    const parsedCost = parseNumber(values.cost)

    if (documentType === "insurance_policy") {
      if (!values.issuer.trim()) {
        nextErrors.issuer = "La aseguradora es obligatoria."
      }

      if (!values.documentNumber.trim()) {
        nextErrors.documentNumber = "El número de póliza es obligatorio."
      }

      if (!values.validUntil) {
        nextErrors.validUntil = "El fin de vigencia es obligatorio."
      }
    }

    if (documentType === "vehicle_inspection") {
      if (!values.validFrom) {
        nextErrors.validFrom = "La fecha de verificación es obligatoria."
      }

      if (!values.verificationResult) {
        nextErrors.verificationResult = "Selecciona el resultado."
      }
    }

    ;(["validFrom", "validUntil"] as const).forEach((field) => {
      if (values[field] && !isDateValue(values[field])) {
        nextErrors[field] = "Usa el formato AAAA-MM-DD."
      }
    })

    if (
      values.validFrom &&
      values.validUntil &&
      isDateValue(values.validFrom) &&
      isDateValue(values.validUntil) &&
      values.validFrom > values.validUntil
    ) {
      nextErrors.validFrom = "La fecha inicial no puede ser posterior a la vigencia."
    }

    if (documentType !== "insurance_policy" && (Number.isNaN(parsedCost) || (parsedCost !== null && parsedCost < 0))) {
      nextErrors.cost = "Ingresa un costo válido."
    }

    if (!values.file) {
      nextErrors.file = "Selecciona el archivo del documento."
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

    await onSubmit(values)
  }

  return createPortal(
    <div className="modal-backdrop modal-backdrop--document" role="presentation">
      <form className="vehicle-form insurance-policy-form vehicle-form--document-window" onSubmit={handleSubmit}>
        <header className="vehicle-form__header">
          <div>
            <p>{config.title}</p>
            <h2>{documentType === "registration_card" ? registrationTitle : config.uploadLabel}</h2>
            <VehicleDocumentIdentity vehicle={vehicle} />
          </div>
          <button aria-label="Cerrar formulario" className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        {error ? <div className="form-banner">{error}</div> : null}

        <section className="form-section">
          <h3>Datos del documento</h3>
          <div className="form-grid">
            {documentType === "insurance_policy" ? (
              <>
                <label className="field">
                  <span>Aseguradora *</span>
                  <input onChange={(event) => updateValue("issuer", event.target.value)} value={values.issuer} />
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
              </>
            ) : null}

            {documentType === "registration_card" ? (
              <>
                <label className="field">
                  <span>Placas</span>
                  <input
                    aria-readonly="true"
                    className="field__reference-input"
                    readOnly
                    value={vehiclePlate || "Sin placa registrada"}
                  />
                </label>

                <label className="field">
                  <span>Folio del documento</span>
                  <input
                    onChange={(event) => updateValue("documentNumber", event.target.value)}
                    value={values.documentNumber}
                  />
                </label>

                <label className="field">
                  <span>Fecha de expedición</span>
                  <input
                    inputMode="numeric"
                    onChange={(event) => updateValue("validFrom", event.target.value)}
                    placeholder="AAAA-MM-DD"
                    value={values.validFrom}
                  />
                  {errors.validFrom ? <em>{errors.validFrom}</em> : null}
                </label>

                <label className="field">
                  <span>Fecha de vigencia / vencimiento</span>
                  <input
                    inputMode="numeric"
                    onChange={(event) => updateValue("validUntil", event.target.value)}
                    placeholder="AAAA-MM-DD"
                    value={values.validUntil}
                  />
                  {errors.validUntil ? <em>{errors.validUntil}</em> : null}
                </label>

                <label className="field">
                  <span>Entidad / estado de expedición</span>
                  <input
                    onChange={(event) => updateValue("issuingState", event.target.value)}
                    value={values.issuingState}
                  />
                </label>
              </>
            ) : null}

            {documentType === "vehicle_inspection" ? (
              <>
                <label className="field">
                  <span>Fecha de verificación *</span>
                  <input
                    inputMode="numeric"
                    onChange={(event) => updateValue("validFrom", event.target.value)}
                    placeholder="AAAA-MM-DD"
                    value={values.validFrom}
                  />
                  {errors.validFrom ? <em>{errors.validFrom}</em> : null}
                </label>

                <label className="field">
                  <span>Resultado *</span>
                  <select
                    onChange={(event) =>
                      updateValue("verificationResult", event.target.value as VehicleInspectionResult | "")
                    }
                    value={values.verificationResult}
                  >
                    <option value="">Selecciona resultado</option>
                    <option value="approved">Aprobada</option>
                    <option value="rejected">Rechazada</option>
                    <option value="not_applicable">No aplica</option>
                  </select>
                  {errors.verificationResult ? <em>{errors.verificationResult}</em> : null}
                </label>

                <label className="field">
                  <span>Folio / número de constancia</span>
                  <input
                    onChange={(event) => updateValue("documentNumber", event.target.value)}
                    value={values.documentNumber}
                  />
                </label>

                <label className="field">
                  <span>Centro de verificación</span>
                  <input onChange={(event) => updateValue("issuer", event.target.value)} value={values.issuer} />
                </label>

                <label className="field">
                  <span>Próxima verificación / vencimiento</span>
                  <input
                    inputMode="numeric"
                    onChange={(event) => updateValue("validUntil", event.target.value)}
                    placeholder="AAAA-MM-DD"
                    value={values.validUntil}
                  />
                  {errors.validUntil ? <em>{errors.validUntil}</em> : null}
                </label>

                <label className="field">
                  <span>Costo</span>
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
              </>
            ) : null}
          </div>
        </section>

        <section className="form-section">
          <h3>Archivo</h3>
          <label className="file-dropzone">
            <FileUp aria-hidden="true" size={24} />
            <span>Archivo *</span>
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
              <textarea onChange={(event) => updateValue("notes", event.target.value)} value={values.notes} />
            </label>
          </div>
        </section>

        <footer className="vehicle-form__footer">
          <button className="button button--secondary" onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="button button--primary" disabled={isSaving} type="submit">
            {isSaving ? "Guardando..." : config.saveLabel}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  )
}

export function VehicleDocumentPanel({
  vehicle,
  documentType,
  circulationType,
  registrationFormRequest,
  document,
  isLoading,
  error,
  onBackToSummary,
  onDocumentChanged,
  onFeedback,
  onRegister,
  onRegistrationFlowReset,
}: VehicleDocumentPanelProps) {
  const config = documentConfigs[documentType]
  const registerDocument = onRegister ?? (() => setIsFormOpen(true))
  const circulationLabel = circulationType === "federal" ? "FEDERAL" : circulationType === "state" ? "ESTATAL" : null
  const vehiclePlate = circulationType === "federal"
    ? vehicle.federalLicensePlate?.trim() || ""
    : circulationType === "state"
      ? vehicle.stateLicensePlate?.trim() || ""
      : getVehiclePlate(vehicle)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true

    const loadPreviewUrl = async () => {
      setPreviewUrl(null)
      setPreviewError(null)

      if (!document) {
        return
      }

      try {
        const signedUrl = await createVehicleDocumentSignedUrl(document.storagePath)
        if (isActive) {
          setPreviewUrl(signedUrl)
        }
      } catch (previewLoadError) {
        if (isActive) {
          setPreviewError(
            previewLoadError instanceof Error ? previewLoadError.message : "No se pudo preparar la vista previa.",
          )
        }
      }
    }

    void loadPreviewUrl()

    return () => {
      isActive = false
    }
  }, [document])

  useEffect(() => {
    if (registrationFormRequest) {
      setIsFormOpen(true)
    }
  }, [registrationFormRequest])

  const handleSubmit = async (values: FieldValues) => {
    if (!values.file) {
      return
    }

    setIsSaving(true)
    setSaveError(null)

    try {
      let createdDocument: VehicleDocument
      const parsedCost = parseNumber(values.cost)
      const vehiclePlate = getVehiclePlate(vehicle)

      if (documentType === "insurance_policy") {
        const payload: InsurancePolicyPayload = {
          vehicleId: vehicle.id,
          issuer: values.issuer.trim(),
          documentNumber: values.documentNumber.trim(),
          validFrom: values.validFrom || null,
          validUntil: values.validUntil,
          cost: null,
          contactName: values.contactName.trim() || null,
          contactPhone: values.contactPhone.trim() || null,
          notes: values.notes.trim() || null,
          file: values.file,
        }
        createdDocument = await createInsurancePolicy(payload)
      } else if (documentType === "registration_card") {
        const payload: RegistrationCardPayload = {
          vehicleId: vehicle.id,
          circulationType: circulationType ?? "state",
          documentNumber: values.documentNumber.trim(),
          plateNumber: document?.details.plateNumber?.trim() || vehiclePlate || null,
          issuingState: values.issuingState.trim() || null,
          validFrom: values.validFrom || null,
          validUntil: values.validUntil || null,
          notes: values.notes.trim() || null,
          file: values.file,
        }
        createdDocument = await createRegistrationCard(payload)
      } else {
        const payload: VehicleInspectionPayload = {
          vehicleId: vehicle.id,
          validFrom: values.validFrom,
          verificationResult: values.verificationResult as VehicleInspectionResult,
          documentNumber: values.documentNumber.trim() || null,
          issuer: values.issuer.trim() || null,
          validUntil: values.validUntil || null,
          cost: parsedCost,
          notes: values.notes.trim() || null,
          file: values.file,
        }
        createdDocument = await createVehicleInspection(payload)
      }

      onDocumentChanged(createdDocument)
      setIsFormOpen(false)
      onRegistrationFlowReset?.()
      onFeedback(config.savedMessage)
    } catch (submitError) {
      setSaveError(submitError instanceof Error ? submitError.message : "No se pudo guardar el documento.")
    } finally {
      setIsSaving(false)
    }
  }

  const status = getDocumentStatus(document)
  const metrics = document ? getDocumentMetrics(documentType, document, vehicle) : []

  return (
    <section className={`insurance-policy-panel${documentType === "registration_card" ? " insurance-policy-panel--registration" : ""}`}>
      <button className="summary-back-button" onClick={onBackToSummary} type="button">
        <ArrowLeft aria-hidden="true" size={17} />
        Atrás
      </button>

      <header className={`insurance-policy-header${documentType === "registration_card" ? " insurance-policy-header--registration" : ""}`}>
        <div>
          <h3>{circulationLabel ? `Tarjeta de circulación ${circulationLabel.toLowerCase()}` : config.title}</h3>
        </div>
        <div className="insurance-policy-header__actions">
          <button className="button button--secondary unit-summary-button" onClick={onBackToSummary} type="button">
            <Gauge aria-hidden="true" size={17} />
            Resumen
          </button>
          {document && documentType !== "registration_card" ? (
            <>
              {onRegister ? (
                <button className="button button--secondary" onClick={onRegister} type="button">
                  <FileUp aria-hidden="true" size={17} />
                  {config.uploadLabel}
                </button>
              ) : null}
              <button className="button button--secondary" onClick={() => setIsFormOpen(true)} type="button">
                <FileUp aria-hidden="true" size={17} />
                {config.updateLabel}
              </button>
            </>
          ) : null}
        </div>
      </header>

      {isLoading ? (
        <div className="state-card">Cargando documento...</div>
      ) : error ? (
        <div className="state-card state-card--warning">
          <strong>No se pudo cargar el documento</strong>
          <span>{error}</span>
        </div>
      ) : !document ? (
        <section className={`insurance-empty-state${circulationLabel ? " insurance-empty-state--pending" : ""}`}>
          <div className="insurance-empty-state__icon">
            {circulationLabel ? <AlertTriangle aria-hidden="true" size={28} /> : config.icon}
          </div>
          <div>
            <span>{circulationLabel ? `Documento de la placa ${circulationLabel.toLowerCase()} de esta unidad.` : config.title}</span>
            <h3>{circulationLabel ? "Documento pendiente" : config.emptyTitle}</h3>
            {circulationLabel ? <strong className="insurance-empty-state__plate">{vehiclePlate || "Sin placa registrada"}</strong> : null}
            <p>
              {circulationLabel
                ? `La tarjeta de circulación ${circulationLabel.toLowerCase()} aún no está registrada para esta placa.`
                : config.emptyText}
            </p>
            <button className="button button--primary" onClick={registerDocument} type="button">
              <FileUp aria-hidden="true" size={17} />
              {config.uploadLabel}
            </button>
          </div>
        </section>
      ) : (
        <div className="insurance-policy-layout">
          <section className="insurance-policy-info">
            <div className="insurance-policy-info__title">
              <div>
                <span>{circulationLabel ? `Documento vigente de la placa ${circulationLabel.toLowerCase()}.` : config.title}</span>
                <h3>{getDocumentTitleValue(documentType, document)}</h3>
              </div>
              <span className={`document-status document-status--${status.tone}`}>{status.label}</span>
            </div>

            {documentType === "vehicle_inspection" && document.details.verificationResult ? (
              <div className="document-result-row">
                <BadgeCheck aria-hidden="true" size={18} />
                <span>Resultado</span>
                <strong>{resultLabels[document.details.verificationResult]}</strong>
              </div>
            ) : null}

            <div className="policy-metrics-grid">
              {metrics.map((metric) => (
                <DocumentMetric key={metric.label} label={metric.label} value={metric.value} />
              ))}
            </div>

            {document.notes ? (
              <div className="policy-notes">
                <span>Notas</span>
                <p>{document.notes}</p>
              </div>
            ) : null}

            <div className="policy-actions">
              {previewUrl ? (
                <a className="button button--secondary" href={previewUrl} rel="noreferrer" target="_blank">
                  <ExternalLink aria-hidden="true" size={17} />
                  {config.openLabel}
                </a>
              ) : null}
              <button className="button button--soft-primary" onClick={() => setIsFormOpen(true)} type="button">
                <FileUp aria-hidden="true" size={17} />
                {config.updateLabel}
              </button>
            </div>
          </section>

          <section className="document-preview">
            <div className="document-preview__header">
              <div>
                <span>Vista previa</span>
                <strong>{document.originalFilename}</strong>
              </div>
              {document.mimeType === "application/pdf" ? (
                <FileText aria-hidden="true" size={19} />
              ) : (
                <ReceiptText aria-hidden="true" size={19} />
              )}
            </div>

            {previewError ? (
              <div className="document-preview__fallback">
                <span>{previewError}</span>
              </div>
            ) : !previewUrl ? (
              <div className="document-preview__fallback">
                <span>Preparando vista previa...</span>
              </div>
            ) : document.mimeType === "application/pdf" ? (
              <iframe className="document-preview__frame" src={previewUrl} title={`Vista previa de ${config.title}`} />
            ) : (
              <img alt={`Vista previa de ${config.title}`} className="document-preview__image" src={previewUrl} />
            )}
          </section>
        </div>
      )}

      {document ? (
        <div className="insurance-policy-footnote">
          <CalendarDays aria-hidden="true" size={16} />
          <span>Última actualización: {formatDate(document.updatedAt.slice(0, 10))}</span>
        </div>
      ) : null}

      {isFormOpen ? (
        <VehicleDocumentForm
          circulationType={circulationType ?? null}
          documentType={documentType}
          error={saveError}
          isSaving={isSaving}
          onClose={() => {
            setSaveError(null)
            setIsFormOpen(false)
            onRegistrationFlowReset?.()
          }}
          onSubmit={handleSubmit}
          vehicle={vehicle}
        />
      ) : null}
    </section>
  )
}
