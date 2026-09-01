import { ChevronRight } from "lucide-react"
import { StatusBadge } from "./StatusBadge"
import type { Vehicle } from "../types/vehicle"
import { displayValue, formatMileage } from "../utils/formatters"

interface VehicleCardProps {
  vehicle: Vehicle
  isSelected: boolean
  onSelect: () => void
}

export function VehicleCard({ vehicle, isSelected, onSelect }: VehicleCardProps) {
  return (
    <button
      className={`vehicle-card ${isSelected ? "vehicle-card--selected" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <div className="vehicle-card__main">
        <span className="vehicle-code">{vehicle.internalCode}</span>
        <div>
          <h3>
            {vehicle.brand} {vehicle.model}
          </h3>
          <p>
            {vehicle.year} · {displayValue(vehicle.licensePlate)} · {formatMileage(vehicle.currentMileage)} km
          </p>
        </div>
      </div>
      <div className="vehicle-card__meta">
        <StatusBadge status={vehicle.status} />
        <ChevronRight aria-hidden="true" size={18} />
      </div>
    </button>
  )
}
