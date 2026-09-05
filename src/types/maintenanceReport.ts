export const maintenanceEntryFuelLevels = ["empty", "quarter", "half", "three_quarters", "full"] as const

export type MaintenanceEntryFuelLevel = (typeof maintenanceEntryFuelLevels)[number]

export const maintenanceEntryConditions = [
  "no_apparent_damage",
  "warning_lights",
  "exterior_damage",
  "visible_leak",
  "abnormal_noise",
  "other",
] as const

export type MaintenanceEntryCondition = (typeof maintenanceEntryConditions)[number]

export interface MaintenanceReceptionConditions {
  fuelLevel?: MaintenanceEntryFuelLevel | null
  conditions?: MaintenanceEntryCondition[]
  observations?: string | null

  // Legacy fields remain readable until the future entry flow is migrated.
  fuelLevelPercent?: number | null
  warningLights?: string | null
  visibleDamage?: string | null
}

export type ReceptionConditions = MaintenanceReceptionConditions

export interface MaintenanceReport {
  maintenanceId: string
  entryAt: string | null
  exitAt: string | null
  entryMileage: number | null
  reason: string | null
  receptionConditions: ReceptionConditions | null
  diagnosis: string | null
  recommendations: string | null
  pendingWork: string | null
  closedBy: string | null
  closureNotes: string | null
  createdAt: string
  updatedAt: string
}

export interface MaintenanceReportFormValues {
  entryAt: string
  exitAt: string
  entryMileage: string
  reason: string
  fuelLevelPercent: string
  warningLights: string
  visibleDamage: string
  receptionObservations: string
  diagnosis: string
  recommendations: string
  pendingWork: string
  closedBy: string
  closureNotes: string
}

export type MaintenanceReportPayload = Omit<MaintenanceReport, "createdAt" | "updatedAt">
