export const fuelTypes = [
  "Gasolina",
  "Diésel",
  "Híbrido",
  "Híbrido enchufable",
  "Eléctrico",
  "Otro",
] as const

export const vehicleStatuses = [
  "Activo",
  "En mantenimiento",
  "Fuera de servicio",
  "Vendido",
  "Baja",
] as const

export type FuelType = (typeof fuelTypes)[number]
export type VehicleStatus = (typeof vehicleStatuses)[number]

export interface Vehicle {
  id: string
  internalCode: string
  brand: string
  model: string
  version: string | null
  year: number
  vin: string
  licensePlate: string | null
  engineNumber: string | null
  color: string | null
  fuelType: FuelType
  tankCapacityLiters: number | null
  acquisitionDate: string | null
  acquisitionPrice: number | null
  currentMileage: number
  status: VehicleStatus
  createdAt: string
  updatedAt: string
}

export interface VehicleFormValues {
  internalCode: string
  brand: string
  model: string
  version: string
  year: string
  vin: string
  licensePlate: string
  engineNumber: string
  color: string
  fuelType: FuelType | ""
  tankCapacityLiters: string
  acquisitionDate: string
  acquisitionPrice: string
  currentMileage: string
  status: VehicleStatus | ""
}

export interface VehicleFilters {
  query: string
  status: "Todos" | VehicleStatus
  brand: "Todas" | string
  year: "Todos" | string
}

export type VehiclePayload = Omit<Vehicle, "id" | "createdAt" | "updatedAt">
