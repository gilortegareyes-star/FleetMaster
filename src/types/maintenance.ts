export const maintenanceTypes = [
  "Servicio preventivo",
  "Cambio de aceite",
  "Filtros",
  "Frenos",
  "Suspensión",
  "Dirección",
  "Sistema eléctrico",
  "Motor",
  "Transmisión",
  "Sistema de enfriamiento",
  "Aire acondicionado",
  "Llantas",
  "Alineación y balanceo",
  "Batería",
  "Reparación",
  "Diagnóstico",
  "Otro",
] as const

export type MaintenanceType = (typeof maintenanceTypes)[number]

export const maintenanceStatuses = [
  "open",
  "completed",
  "partially_completed",
  "follow_up_required",
  "not_repaired",
  "cancelled",
] as const

export type MaintenanceStatus = (typeof maintenanceStatuses)[number]

export interface MaintenanceRecord {
  id: string
  folio: string
  vehicleId: string
  serviceDate: string
  mileage: number | null
  maintenanceType: MaintenanceType
  description: string | null
  provider: string | null
  providerId: string | null
  entryAt: string | null
  entryMileage: number | null
  totalCost: number | null
  nextServiceMileage: number | null
  nextServiceDate: string | null
  notes: string | null
  status: MaintenanceStatus
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface MaintenanceFormValues {
  serviceDate: string
  mileage: string
  maintenanceType: MaintenanceType | ""
  description: string
  provider: string
  totalCost: string
  nextServiceMileage: string
  nextServiceDate: string
  notes: string
}

export type MaintenancePayload = Omit<MaintenanceRecord, "id" | "folio" | "status" | "closedAt" | "createdAt" | "updatedAt" | "entryAt" | "entryMileage" | "providerId">

export interface OpenMaintenanceOrderPayload {
  vehicleId: string
  serviceDate: string
  maintenanceType: MaintenanceType
  provider: string | null
  entryAt: string
  entryMileage: number
  reason: string | null
}

export type MaintenanceClosingStatus = "completed" | "partially_completed" | "follow_up_required" | "not_repaired"

export interface CloseMaintenanceOrderPayload {
  maintenanceId: string
  status: MaintenanceClosingStatus
  exitAt: string
  mileage: number
  nextServiceMileage: number | null
  nextServiceDate: string | null
  closureNotes: string | null
}
