import { getSupabaseClient } from "./supabase"
import type { FuelType, Vehicle, VehiclePayload, VehicleStatus } from "../types/vehicle"

interface VehicleRow {
  id: string
  internal_code: string
  brand: string
  model: string
  version: string | null
  year: number
  vin: string
  license_plate: string | null
  engine_number: string | null
  color: string | null
  fuel_type: FuelType | null
  fuel_types: FuelType[] | null
  state_license_plate: string | null
  federal_license_plate: string | null
  vehicle_type: Vehicle["vehicleType"]
  transmission_type: Vehicle["transmissionType"]
  load_capacity_kg: number | null
  tank_capacity_liters: number | null
  acquisition_date: string | null
  acquisition_price: number | null
  current_mileage: number
  status: VehicleStatus
  created_at: string
  updated_at: string
}

const toVehicle = (row: VehicleRow): Vehicle => ({
  id: row.id,
  internalCode: row.internal_code,
  brand: row.brand,
  model: row.model,
  version: row.version,
  year: row.year,
  vin: row.vin,
  licensePlate: row.license_plate,
  engineNumber: row.engine_number,
  color: row.color,
  fuelType: row.fuel_type,
  fuelTypes: row.fuel_types ?? (row.fuel_type ? [row.fuel_type] : []),
  stateLicensePlate: row.state_license_plate,
  federalLicensePlate: row.federal_license_plate,
  vehicleType: row.vehicle_type,
  transmissionType: row.transmission_type,
  loadCapacityKg: row.load_capacity_kg,
  tankCapacityLiters: row.tank_capacity_liters,
  acquisitionDate: row.acquisition_date,
  acquisitionPrice: row.acquisition_price,
  currentMileage: row.current_mileage,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const toVehicleRow = (payload: VehiclePayload) => ({
  internal_code: payload.internalCode.trim(),
  brand: payload.brand.trim(),
  model: payload.model.trim(),
  version: payload.version?.trim() || null,
  year: payload.year,
  vin: payload.vin.trim(),
  ...(payload.licensePlate !== undefined ? { license_plate: payload.licensePlate?.trim() || null } : {}),
  state_license_plate: payload.stateLicensePlate?.trim().toUpperCase() || null,
  federal_license_plate: payload.federalLicensePlate?.trim().toUpperCase() || null,
  engine_number: payload.engineNumber?.trim() || null,
  color: payload.color?.trim() || null,
  ...(payload.fuelType !== undefined ? { fuel_type: payload.fuelType || null } : {}),
  fuel_types: [...new Set((payload.fuelTypes ?? []).map((value) => value.trim()).filter(Boolean))],
  vehicle_type: payload.vehicleType || null,
  transmission_type: payload.transmissionType || null,
  load_capacity_kg: payload.loadCapacityKg,
  tank_capacity_liters: payload.tankCapacityLiters,
  acquisition_date: payload.acquisitionDate || null,
  acquisition_price: payload.acquisitionPrice,
  current_mileage: payload.currentMileage,
  status: payload.status,
})

const friendlyDatabaseError = (message: string) => {
  const normalized = message.toLowerCase()

  if (normalized.includes("vehicles_vin")) {
    return "Ya existe una unidad con este VIN."
  }

  if (normalized.includes("vehicles_internal_code")) {
    return "Ya existe una unidad con este número económico."
  }

  if (normalized.includes("missing-supabase-config")) {
    return "Configura la conexión a Supabase para guardar unidades."
  }

  return "No se pudo completar la operación. Intenta de nuevo."
}

export const listVehicles = async () => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("vehicles")
      .select("*")
      .order("internal_code", { ascending: true })

    if (error) {
      throw error
    }

    return (data ?? []).map((row) => toVehicle(row as VehicleRow))
  } catch (error) {
    throw new Error(friendlyDatabaseError(error instanceof Error ? error.message : String(error)))
  }
}

export const createVehicle = async (payload: VehiclePayload) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("vehicles")
      .insert(toVehicleRow(payload))
      .select("*")
      .single()

    if (error) {
      throw error
    }

    return toVehicle(data as VehicleRow)
  } catch (error) {
    throw new Error(friendlyDatabaseError(error instanceof Error ? error.message : String(error)))
  }
}

export const updateVehicle = async (vehicleId: string, payload: VehiclePayload) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("vehicles")
      .update(toVehicleRow(payload))
      .eq("id", vehicleId)
      .select("*")
      .single()

    if (error) {
      throw error
    }

    return toVehicle(data as VehicleRow)
  } catch (error) {
    throw new Error(friendlyDatabaseError(error instanceof Error ? error.message : String(error)))
  }
}
