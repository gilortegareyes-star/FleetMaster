import { getSupabaseClient } from "./supabase"
import { toMaintenanceReport } from "./maintenanceReports"
import type { MaintenanceEntryPayload } from "../types/maintenanceReport"

interface MaintenanceReportRow {
  maintenance_id: string
  entry_at: string | null
  entry_mileage: number | null
  reception_conditions: unknown
  exit_at: string | null
  reason: string | null
  diagnosis: string | null
  recommendations: string | null
  pending_work: string | null
  closed_by: string | null
  closure_notes: string | null
  created_at: string
  updated_at: string
}

export const saveMaintenanceEntry = async (payload: MaintenanceEntryPayload) => {
  const { data, error } = await getSupabaseClient().rpc("save_maintenance_entry", {
    p_maintenance_id: payload.maintenanceId,
    p_entry_at: payload.entryAt,
    p_entry_mileage: payload.entryMileage,
    p_provider_id: payload.providerId,
    p_fuel_level: payload.fuelLevel,
    p_conditions: payload.conditions,
    p_observations: payload.observations?.trim() || null,
  })

  if (error) throw error
  const row = data as MaintenanceReportRow
  return toMaintenanceReport(row)
}
