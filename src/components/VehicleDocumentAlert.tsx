import { TriangleAlert } from "lucide-react"
import type { DocumentAlert } from "../services/vehicleDocuments"

export function VehicleDocumentAlert({ alerts }: { alerts: DocumentAlert[] }) {
  if (alerts.length === 0) {
    return null
  }

  const summary = alerts.map((alert) => alert.label).join("; ")

  return (
    <span
      aria-label={`Documentación que requiere atención: ${summary}`}
      className="vehicle-document-alert"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      role="img"
      tabIndex={0}
    >
      <TriangleAlert aria-hidden="true" fill="none" size={18} strokeWidth={2} />
      <span className="vehicle-document-alert__tooltip" role="tooltip">
        <strong>Documentación que requiere atención</strong>
        {alerts.map((alert) => <span key={alert.code}>• {alert.label}</span>)}
      </span>
    </span>
  )
}
