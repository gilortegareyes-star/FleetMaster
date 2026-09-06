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
      className="vehicle-card__document-warning"
      onClick={(event) => event.stopPropagation()}
      title={`Documentación que requiere atención\n• ${alerts.map((alert) => alert.label).join("\n• ")}`}
    >
      <TriangleAlert aria-hidden="true" fill="none" size={18} strokeWidth={2} />
    </span>
  )
}
