export const fuelTypes = [
  "Gasolina",
  "Diésel",
  "Eléctrico",
  "Gas LP",
  "Gas Natural",
] as const

export const vehicleTypes = [
  "Automóvil",
  "SUV",
  "Pickup",
  "Van",
  "Camión",
  "Tractocamión",
  "Remolque",
  "Maquinaria",
  "Otro",
] as const

export const transmissionTypes = ["Manual", "Automática", "CVT", "DCT", "Otro"] as const

export const vehicleStatuses = [
  "Activo",
  "Inactivo",
  "En mantenimiento",
  "Fuera de servicio",
  "Vendido",
  "Baja",
] as const

export type FuelType = (typeof fuelTypes)[number]
export type VehicleType = (typeof vehicleTypes)[number]
export type TransmissionType = (typeof transmissionTypes)[number]
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
  fuelType: FuelType | null
  fuelTypes: FuelType[]
  stateLicensePlate: string | null
  federalLicensePlate: string | null
  vehicleType: VehicleType | null
  transmissionType: TransmissionType | null
  loadCapacityKg: number | null
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
  fuelTypes: FuelType[]
  stateLicensePlate: string
  federalLicensePlate: string
  vehicleType: VehicleType | ""
  transmissionType: TransmissionType | ""
  loadCapacityKg: string
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

export type VehiclePayload = Omit<Vehicle, "id" | "createdAt" | "updatedAt" | "licensePlate" | "fuelType">
  & { licensePlate?: string | null; fuelType?: FuelType | null }
