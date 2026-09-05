import { getSupabaseClient } from "./supabase"
import { saveMaintenanceReport } from "./maintenanceReports"
import type { CloseMaintenanceOrderPayload, MaintenancePayload, MaintenanceRecord, MaintenanceStatus, MaintenanceType, OpenMaintenanceOrderPayload } from "../types/maintenance"
import type { MaintenanceReport } from "../types/maintenanceReport"

interface MaintenanceRow {
  id: string
  folio: string
  vehicle_id: string
  service_date: string
  mileage: number | null
  maintenance_type: MaintenanceType
  description: string | null
  provider: string | null
  provider_id: string | null
  maintenance_reports?: { entry_at: string | null; entry_mileage: number | null } | Array<{ entry_at: string | null; entry_mileage: number | null }> | null
  total_cost: number | null
  next_service_mileage: number | null
  next_service_date: string | null
  notes: string | null
  status: MaintenanceStatus
  closed_at: string | null
  created_at: string
  updated_at: string
}

const toMaintenanceRecord = (row: MaintenanceRow): MaintenanceRecord => {
  const report = Array.isArray(row.maintenance_reports) ? row.maintenance_reports[0] : row.maintenance_reports

  return {
  id: row.id,
  folio: row.folio,
  vehicleId: row.vehicle_id,
  serviceDate: row.service_date,
  mileage: row.mileage,
  maintenanceType: row.maintenance_type,
  description: row.description,
  provider: row.provider,
  providerId: row.provider_id ?? null,
  entryAt: report?.entry_at ?? null,
  entryMileage: report?.entry_mileage ?? null,
  totalCost: row.total_cost,
  nextServiceMileage: row.next_service_mileage,
  nextServiceDate: row.next_service_date,
  notes: row.notes,
  status: row.status,
  closedAt: row.closed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  }
}

const toMaintenanceRow = (payload: MaintenancePayload) => ({
  vehicle_id: payload.vehicleId,
  service_date: payload.serviceDate,
  mileage: payload.mileage,
  maintenance_type: payload.maintenanceType,
  description: payload.description?.trim() || null,
  provider: payload.provider?.trim() || null,
  total_cost: payload.totalCost,
  next_service_mileage: payload.nextServiceMileage,
  next_service_date: payload.nextServiceDate || null,
  notes: payload.notes?.trim() || null,
})

const friendlyMaintenanceError = (message: string) => {
  const normalized = message.toLowerCase()

  if (normalized.includes("missing-supabase-config")) {
    return "Configura la conexión a Supabase para consultar mantenimientos."
  }

  if (normalized.includes("maintenance_records_vehicle_id_fkey")) {
    return "La unidad seleccionada no existe o no está disponible."
  }

  if (normalized.includes("vehicle not found or unavailable")) {
    return "La unidad seleccionada no existe o no está disponible."
  }

  if (normalized.includes("authentication required")) {
    return "Inicia sesión para registrar un mantenimiento."
  }

  if (normalized.includes("insufficient organization permissions")) {
    return "No tienes permisos para registrar mantenimiento en esta unidad."
  }

  if (normalized.includes("active organization")) {
    return "Tu cuenta no tiene una organización activa disponible."
  }

  if (normalized.includes("check constraint") || normalized.includes("violates check")) {
    return "Revisa los datos del mantenimiento antes de guardar."
  }

  return "No se pudo completar la operación de mantenimiento. Intenta de nuevo."
}

export const getMaintenanceByVehicle = async (vehicleId: string) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("maintenance_records")
      .select("*, maintenance_reports!maintenance_reports_maintenance_id_fkey(entry_at, entry_mileage)")
      .eq("vehicle_id", vehicleId)
      .order("service_date", { ascending: false })
      .order("created_at", { ascending: false })

    if (error) {
      throw error
    }

    return (data ?? []).map((row) => toMaintenanceRecord(row as MaintenanceRow))
  } catch (error) {
    throw new Error(friendlyMaintenanceError(error instanceof Error ? error.message : String(error)))
  }
}

export const getMaintenanceById = async (maintenanceId: string) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("maintenance_records")
      .select("*")
      .eq("id", maintenanceId)
      .single()

    if (error) {
      throw error
    }

    return toMaintenanceRecord(data as MaintenanceRow)
  } catch (error) {
    throw new Error(friendlyMaintenanceError(error instanceof Error ? error.message : String(error)))
  }
}

export const createMaintenance = async (payload: MaintenancePayload) => {
  try {
    const row = toMaintenanceRow(payload)
    const { data, error } = await getSupabaseClient().rpc("create_maintenance_record", {
      p_vehicle_id: row.vehicle_id,
      p_service_date: row.service_date,
      p_mileage: row.mileage,
      p_maintenance_type: row.maintenance_type,
      p_description: row.description,
      p_provider: row.provider,
      p_total_cost: row.total_cost,
      p_next_service_mileage: row.next_service_mileage,
      p_next_service_date: row.next_service_date,
      p_notes: row.notes,
      p_status: "completed",
    })

    if (error) {
      throw error
    }

    return toMaintenanceRecord(data as MaintenanceRow)
  } catch (error) {
    throw new Error(friendlyMaintenanceError(error instanceof Error ? error.message : String(error)))
  }
}

const deleteOpenMaintenance = async (maintenanceId: string) => {
  const { data, error } = await getSupabaseClient()
    .from("maintenance_records")
    .delete()
    .eq("id", maintenanceId)
    .eq("status", "open")
    .select("id")
    .maybeSingle()

  if (error || !data) {
    throw new Error("open-maintenance-compensation-failed")
  }
}

export const createOpenMaintenanceOrder = async (
  payload: OpenMaintenanceOrderPayload,
): Promise<{ maintenance: MaintenanceRecord; report: MaintenanceReport }> => {
  let maintenance: MaintenanceRecord

  try {
    const { data, error } = await getSupabaseClient().rpc("create_maintenance_record", {
      p_vehicle_id: payload.vehicleId,
      p_service_date: payload.serviceDate,
      p_mileage: null,
      p_maintenance_type: payload.maintenanceType,
      p_description: null,
      p_provider: payload.provider?.trim() || null,
      p_total_cost: null,
      p_next_service_mileage: null,
      p_next_service_date: null,
      p_notes: null,
      p_status: "open",
    })

    if (error) {
      throw error
    }

    maintenance = toMaintenanceRecord(data as MaintenanceRow)
  } catch (error) {
    throw new Error(friendlyMaintenanceError(error instanceof Error ? error.message : String(error)))
  }

  try {
    const report = await saveMaintenanceReport({
      maintenanceId: maintenance.id,
      entryAt: payload.entryAt,
      exitAt: null,
      entryMileage: payload.entryMileage,
      reason: payload.reason?.trim() || null,
      receptionConditions: null,
      diagnosis: null,
      recommendations: null,
      pendingWork: null,
      closedBy: null,
      closureNotes: null,
    })

    return { maintenance, report }
  } catch (error) {
    try {
      await deleteOpenMaintenance(maintenance.id)
    } catch {
      throw new Error("No se pudo crear el informe. La orden quedó abierta y requiere revisión antes de continuar.")
    }

    throw new Error("No se pudo crear el informe. La orden no fue creada.")
  }
}

export const updateMaintenance = async (maintenanceId: string, payload: MaintenancePayload) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("maintenance_records")
      .update(toMaintenanceRow(payload))
      .eq("id", maintenanceId)
      .select("*")
      .single()

    if (error) {
      throw error
    }

    return toMaintenanceRecord(data as MaintenanceRow)
  } catch (error) {
    throw new Error(friendlyMaintenanceError(error instanceof Error ? error.message : String(error)))
  }
}

export const updateMaintenanceTotalCost = async (maintenanceId: string, totalCost: number) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("maintenance_records")
      .update({ total_cost: totalCost })
      .eq("id", maintenanceId)
      .select("*")
      .single()

    if (error) {
      throw error
    }

    return toMaintenanceRecord(data as MaintenanceRow)
  } catch (error) {
    throw new Error(friendlyMaintenanceError(error instanceof Error ? error.message : String(error)))
  }
}

const friendlyCloseMaintenanceError = (message: string) => {
  const normalized = message.toLowerCase()

  if (normalized.includes("maintenance-close-not-open")) return "Esta orden ya no está abierta y no puede cerrarse nuevamente."
  if (normalized.includes("maintenance-close-content-required")) return "Agrega al menos un trabajo realizado, diagnóstico u observación de cierre antes de cerrar el mantenimiento."
  if (normalized.includes("maintenance-close-follow-up-required")) return "Agrega un trabajo pendiente, recomendación o próximo servicio para indicar el seguimiento."
  if (normalized.includes("maintenance-close-mileage-before-entry")) return "El kilometraje de salida no puede ser menor al kilometraje de entrada."
  if (normalized.includes("maintenance-close-mileage-invalid")) return "Ingresa un kilometraje de salida válido."
  if (normalized.includes("maintenance-close-exit-required")) return "Indica la fecha y hora de salida."
  if (normalized.includes("maintenance-close-report-missing")) return "No se encontró el informe asociado a esta orden."

  return "No se pudo cerrar el mantenimiento. Intenta de nuevo."
}

export const closeMaintenanceOrder = async (payload: CloseMaintenanceOrderPayload) => {
  try {
    const { error } = await getSupabaseClient().rpc("close_maintenance_order", {
      p_maintenance_id: payload.maintenanceId,
      p_status: payload.status,
      p_exit_at: payload.exitAt,
      p_mileage: payload.mileage,
      p_next_service_mileage: payload.nextServiceMileage,
      p_next_service_date: payload.nextServiceDate,
      p_closure_notes: payload.closureNotes,
    })

    if (error) throw error

    return await getMaintenanceById(payload.maintenanceId)
  } catch (error) {
    throw new Error(friendlyCloseMaintenanceError(error instanceof Error ? error.message : String(error)))
  }
}
