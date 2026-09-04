import type { Vehicle } from "../types/vehicle"
import { displayValue } from "../utils/formatters"

interface VehicleDocumentIdentityProps {
  vehicle: Vehicle
}

export function VehicleDocumentIdentity({ vehicle }: VehicleDocumentIdentityProps) {
  const modelLabel = [vehicle.model, vehicle.version].filter(Boolean).join(" ")

  return (
    <div className="vehicle-document-identity" aria-label="Identificación de la unidad">
      <div className="vehicle-document-identity__summary">
        <strong>{vehicle.internalCode}</strong>
        <span aria-hidden="true">·</span>
        <span>{displayValue(modelLabel)}</span>
        <span aria-hidden="true">·</span>
        <span>{vehicle.year}</span>
      </div>
      <div className="vehicle-document-identity__vin">
        <span>VIN / Número de serie</span>
        <strong>{displayValue(vehicle.vin)}</strong>
      </div>
    </div>
  )
}
