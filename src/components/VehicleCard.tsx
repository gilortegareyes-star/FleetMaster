import { ArrowRight, Gauge } from "lucide-react"
import { StatusBadge } from "./StatusBadge"
import type { DocumentAlert } from "../services/vehicleDocuments"
import type { Vehicle } from "../types/vehicle"
import { displayValue, formatMileage } from "../utils/formatters"
import { VehicleDocumentAlert } from "./VehicleDocumentAlert"

interface VehicleCardProps {
  documentAlerts: DocumentAlert[]
  vehicle: Vehicle
  isSelected: boolean
  onSelect: () => void
}

export function VehicleCard({ documentAlerts, vehicle, isSelected, onSelect }: VehicleCardProps) {
  const vehicleName = [vehicle.brand, vehicle.model].filter(Boolean).join(" ")
  const vehicleSpec = [vehicle.version, String(vehicle.year)].filter(Boolean).join(" · ")
  const plate = vehicle.stateLicensePlate ?? vehicle.licensePlate

  return (
    <button
      className={`vehicle-card ${isSelected ? "vehicle-card--selected" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <div className="vehicle-card__header">
        <div className="vehicle-card__code-group">
          <strong className="vehicle-card__code">{vehicle.internalCode}</strong>
          <VehicleDocumentAlert alerts={documentAlerts} />
        </div>
        <StatusBadge status={vehicle.status} />
      </div>

      <div className="vehicle-card__body">
        <div className="vehicle-card__identity">
          <h3>{vehicleName}</h3>
          <p>{vehicleSpec}</p>
        </div>
        <div className="vehicle-card__operation">
          <span>
            <Gauge aria-hidden="true" size={16} />
            {formatMileage(vehicle.currentMileage)} km
          </span>
          {plate ? (
            <span className="vehicle-card__plate">
              <small>Placa</small>
              {displayValue(plate)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="vehicle-card__footer">
        <strong>
          Ver unidad
          <ArrowRight aria-hidden="true" size={16} />
        </strong>
      </div>
    </button>
  )
}
