import { getSupabaseClient } from "./supabase"
import { maintenanceEntryConditions, maintenanceEntryFuelLevels } from "../types/maintenanceReport"
import type { MaintenanceEntryCondition, MaintenanceEntryFuelLevel, MaintenanceReport, MaintenanceReportPayload, ReceptionConditions } from "../types/maintenanceReport"

interface MaintenanceReportRow {
  maintenance_id: string
  entry_at: string | null
  exit_at: string | null
  entry_mileage: number | null
  reason: string | null
  reception_conditions: unknown
  diagnosis: string | null
  recommendations: string | null
  pending_work: string | null
  closed_by: string | null
  closure_notes: string | null
  created_at: string
  updated_at: string
}

const toOptionalString = (value: unknown) => (typeof value === "string" ? value : null)

const toReceptionConditions = (value: unknown): ReceptionConditions | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const rawConditions = value as Record<string, unknown>
  const fuelLevel = typeof rawConditions.fuelLevel === "string" && maintenanceEntryFuelLevels.includes(rawConditions.fuelLevel as MaintenanceEntryFuelLevel)
    ? rawConditions.fuelLevel as MaintenanceEntryFuelLevel
    : null
  const conditions = Array.isArray(rawConditions.conditions)
    ? rawConditions.conditions.filter((condition): condition is MaintenanceEntryCondition => typeof condition === "string" && maintenanceEntryConditions.includes(condition as MaintenanceEntryCondition))
    : []
  const fuelLevelPercent = typeof rawConditions.fuelLevelPercent === "number" ? rawConditions.fuelLevelPercent : null
  const warningLights = toOptionalString(rawConditions.warningLights)
  const visibleDamage = toOptionalString(rawConditions.visibleDamage)
  const observations = toOptionalString(rawConditions.observations)

  return fuelLevel === null && conditions.length === 0 && fuelLevelPercent === null && !warningLights && !visibleDamage && !observations
    ? null
    : { fuelLevel, conditions, fuelLevelPercent, warningLights, visibleDamage, observations }
}

export const toMaintenanceReport = (row: MaintenanceReportRow): MaintenanceReport => ({
  maintenanceId: row.maintenance_id,
  entryAt: row.entry_at,
  exitAt: row.exit_at,
  entryMileage: row.entry_mileage,
  reason: row.reason,
  receptionConditions: toReceptionConditions(row.reception_conditions),
  diagnosis: row.diagnosis,
  recommendations: row.recommendations,
  pendingWork: row.pending_work,
  closedBy: row.closed_by,
  closureNotes: row.closure_notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const toMaintenanceReportRow = (payload: MaintenanceReportPayload) => ({
  maintenance_id: payload.maintenanceId,
  entry_at: payload.entryAt,
  exit_at: payload.exitAt,
  entry_mileage: payload.entryMileage,
  reason: payload.reason?.trim() || null,
  reception_conditions: payload.receptionConditions,
  diagnosis: payload.diagnosis?.trim() || null,
  recommendations: payload.recommendations?.trim() || null,
  pending_work: payload.pendingWork?.trim() || null,
  closed_by: payload.closedBy?.trim() || null,
  closure_notes: payload.closureNotes?.trim() || null,
})

const friendlyMaintenanceReportError = (message: string) => {
  if (message.toLowerCase().includes("missing-supabase-config")) {
    return "Configura la conexión a Supabase para guardar el informe."
  }

  return "No se pudo guardar el informe de mantenimiento. Intenta de nuevo."
}

export const getMaintenanceReport = async (maintenanceId: string) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("maintenance_reports")
      .select("*")
      .eq("maintenance_id", maintenanceId)
      .maybeSingle()

    if (error) {
      throw error
    }

    return data ? toMaintenanceReport(data as MaintenanceReportRow) : null
  } catch (error) {
    throw new Error(friendlyMaintenanceReportError(error instanceof Error ? error.message : String(error)))
  }
}

export const saveMaintenanceReport = async (payload: MaintenanceReportPayload) => {
  try {
    const row = toMaintenanceReportRow(payload)
    const { data, error } = await getSupabaseClient().rpc("save_maintenance_report", {
      p_maintenance_id: row.maintenance_id,
      p_entry_at: row.entry_at,
      p_exit_at: row.exit_at,
      p_entry_mileage: row.entry_mileage,
      p_reason: row.reason,
      p_reception_conditions: row.reception_conditions,
      p_diagnosis: row.diagnosis,
      p_recommendations: row.recommendations,
      p_pending_work: row.pending_work,
      p_closed_by: row.closed_by,
      p_closure_notes: row.closure_notes,
    })

    if (error) {
      throw error
    }

    return toMaintenanceReport(data as MaintenanceReportRow)
  } catch (error) {
    throw new Error(friendlyMaintenanceReportError(error instanceof Error ? error.message : String(error)))
  }
}
