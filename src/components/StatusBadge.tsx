import type { VehicleStatus } from "../types/vehicle"

const statusClassName: Record<VehicleStatus, string> = {
  Activo: "status-badge status-badge--active",
  "En mantenimiento": "status-badge status-badge--maintenance",
  "Fuera de servicio": "status-badge status-badge--offline",
  Vendido: "status-badge status-badge--sold",
  Baja: "status-badge status-badge--inactive",
}

export function StatusBadge({ status }: { status: VehicleStatus }) {
  return <span className={statusClassName[status]}>{status}</span>
}
