import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  FileText,
  FileUp,
  Phone,
  ReceiptText,
  ShieldCheck,
} from "lucide-react"
import { useEffect, useState } from "react"
import { InsurancePolicyForm } from "./InsurancePolicyForm"
import { createInsurancePolicy, createVehicleDocumentSignedUrl } from "../services/vehicleDocuments"
import type { InsurancePolicyPayload, VehicleDocument } from "../types/vehicleDocument"
import type { Vehicle } from "../types/vehicle"
import { getDocumentStatus } from "../utils/documentStatus"
import { displayValue, formatCurrency, formatDate } from "../utils/formatters"

interface InsurancePolicyPanelProps {
  vehicle: Vehicle
  policy: VehicleDocument | null
  isLoading: boolean
  error: string | null
  onBackToSummary: () => void
  onPolicyChanged: (policy: VehicleDocument) => void
  onFeedback: (message: string) => void
}

function PolicyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="policy-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function InsurancePolicyPanel({
  vehicle,
  policy,
  isLoading,
  error,
  onBackToSummary,
  onPolicyChanged,
  onFeedback,
}: InsurancePolicyPanelProps) {
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

      if (!policy) {
        return
      }

      try {
        const signedUrl = await createVehicleDocumentSignedUrl(policy.storagePath)
        if (isActive) {
          setPreviewUrl(signedUrl)
        }
      } catch (previewLoadError) {
        if (isActive) {
          setPreviewError(
            previewLoadError instanceof Error
              ? previewLoadError.message
              : "No se pudo preparar la vista previa.",
          )
        }
      }
    }

    void loadPreviewUrl()

    return () => {
      isActive = false
    }
  }, [policy])

  const handleSubmit = async (payload: InsurancePolicyPayload) => {
    setIsSaving(true)
    setSaveError(null)

    try {
      const createdPolicy = await createInsurancePolicy(payload)
      onPolicyChanged(createdPolicy)
      setIsFormOpen(false)
      onFeedback("Póliza de seguro guardada correctamente.")
    } catch (submitError) {
      setSaveError(submitError instanceof Error ? submitError.message : "No se pudo guardar la póliza.")
    } finally {
      setIsSaving(false)
    }
  }

  const status = getDocumentStatus(policy)
  const vehicleName = [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(" ")

  return (
    <section className="insurance-policy-panel">
      <button className="summary-back-button" onClick={onBackToSummary} type="button">
        <ArrowLeft aria-hidden="true" size={17} />
        Volver al resumen
      </button>

      <header className="insurance-policy-header">
        <div>
          <p>{vehicle.internalCode} · {vehicleName}</p>
          <h3>Póliza de seguro</h3>
        </div>
        {policy ? (
          <button className="button button--secondary" onClick={() => setIsFormOpen(true)} type="button">
            <FileUp aria-hidden="true" size={17} />
            Actualizar póliza
          </button>
        ) : null}
      </header>

      {isLoading ? (
        <div className="state-card">Cargando póliza...</div>
      ) : error ? (
        <div className="state-card state-card--warning">
          <strong>No se pudo cargar la póliza</strong>
          <span>{error}</span>
        </div>
      ) : !policy ? (
        <section className="insurance-empty-state">
          <div className="insurance-empty-state__icon">
            <ShieldCheck aria-hidden="true" size={28} />
          </div>
          <div>
            <span>Póliza de seguro</span>
            <h3>No hay una póliza registrada para esta unidad.</h3>
            <p>Mantén disponible la póliza vigente para consultar rápidamente la cobertura y los datos del seguro.</p>
            <button className="button button--primary" onClick={() => setIsFormOpen(true)} type="button">
              <FileUp aria-hidden="true" size={17} />
              Subir póliza
            </button>
          </div>
        </section>
      ) : (
        <div className="insurance-policy-layout">
          <section className="insurance-policy-info">
            <div className="insurance-policy-info__title">
              <div>
                <span>Aseguradora</span>
                <h3>{displayValue(policy.issuer)}</h3>
              </div>
              <span className={`document-status document-status--${status.tone}`}>{status.label}</span>
            </div>

            <div className="policy-metrics-grid">
              <PolicyMetric label="Póliza" value={displayValue(policy.documentNumber)} />
              <PolicyMetric
                label="Vigencia"
                value={`${formatDate(policy.validFrom)} - ${formatDate(policy.validUntil)}`}
              />
              <PolicyMetric label="Teléfono" value={displayValue(policy.contactPhone)} />
              <PolicyMetric label="Agente / contacto" value={displayValue(policy.contactName)} />
              <PolicyMetric label="Costo" value={formatCurrency(policy.cost)} />
              <PolicyMetric label="Archivo" value={policy.originalFilename} />
            </div>

            {policy.notes ? (
              <div className="policy-notes">
                <span>Notas</span>
                <p>{policy.notes}</p>
              </div>
            ) : null}

            <div className="policy-actions">
              {previewUrl ? (
                <a className="button button--secondary" href={previewUrl} rel="noreferrer" target="_blank">
                  <ExternalLink aria-hidden="true" size={17} />
                  Ver póliza
                </a>
              ) : null}
              <button className="button button--soft-primary" onClick={() => setIsFormOpen(true)} type="button">
                <FileUp aria-hidden="true" size={17} />
                Actualizar póliza
              </button>
            </div>
          </section>

          <section className="document-preview">
            <div className="document-preview__header">
              <div>
                <span>Vista previa</span>
                <strong>{policy.originalFilename}</strong>
              </div>
              {policy.mimeType === "application/pdf" ? (
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
            ) : policy.mimeType === "application/pdf" ? (
              <iframe className="document-preview__frame" src={previewUrl} title="Vista previa de póliza" />
            ) : (
              <img alt="Vista previa de póliza" className="document-preview__image" src={previewUrl} />
            )}
          </section>
        </div>
      )}

      {policy ? (
        <div className="insurance-policy-footnote">
          <CalendarDays aria-hidden="true" size={16} />
          <span>Última actualización: {formatDate(policy.updatedAt.slice(0, 10))}</span>
          {policy.contactPhone ? (
            <>
              <Phone aria-hidden="true" size={16} />
              <span>{policy.contactPhone}</span>
            </>
          ) : null}
        </div>
      ) : null}

      {isFormOpen ? (
        <InsurancePolicyForm
          error={saveError}
          isSaving={isSaving}
          onClose={() => {
            setSaveError(null)
            setIsFormOpen(false)
          }}
          onSubmit={handleSubmit}
          vehicle={vehicle}
        />
      ) : null}
    </section>
  )
}
