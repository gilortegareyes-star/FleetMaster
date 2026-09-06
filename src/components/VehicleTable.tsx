import type { DocumentAlert } from "../services/vehicleDocuments"
import type { Vehicle } from "../types/vehicle"
import { displayValue, formatMileage } from "../utils/formatters"
import { StatusBadge } from "./StatusBadge"
import { VehicleDocumentAlert } from "./VehicleDocumentAlert"

interface VehicleTableProps {
  documentAlertsByVehicle: Map<string, DocumentAlert[]>
  isSelected: (vehicleId: string) => boolean
  onSelect: (vehicle: Vehicle) => void
  vehicles: Vehicle[]
}

export function VehicleTable({ documentAlertsByVehicle, isSelected, onSelect, vehicles }: VehicleTableProps) {
  return (
    <div className="vehicle-table-wrap">
      <table className="vehicle-table">
        <thead>
          <tr>
            <th scope="col">Unidad</th>
            <th scope="col">Vehículo</th>
            <th scope="col">Año</th>
            <th scope="col">Placas</th>
            <th scope="col">Kilometraje</th>
            <th scope="col">Estado</th>
            <th scope="col">Alertas</th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map((vehicle) => {
            const alerts = documentAlertsByVehicle.get(vehicle.id) ?? []
            const plate = vehicle.stateLicensePlate ?? vehicle.licensePlate

            return (
              <tr
                aria-selected={isSelected(vehicle.id)}
                className={isSelected(vehicle.id) ? "vehicle-table__row vehicle-table__row--selected" : "vehicle-table__row"}
                key={vehicle.id}
                onClick={() => onSelect(vehicle)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    onSelect(vehicle)
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <th scope="row">{vehicle.internalCode}</th>
                <td>{[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "—"}</td>
                <td>{vehicle.year || "—"}</td>
                <td>{plate ? displayValue(plate) : "—"}</td>
                <td>{formatMileage(vehicle.currentMileage)} km</td>
                <td><StatusBadge status={vehicle.status} /></td>
                <td><VehicleDocumentAlert alerts={alerts} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
