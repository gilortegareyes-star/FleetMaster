export interface ReceptionConditions {
  fuelLevelPercent?: number | null
  warningLights?: string | null
  visibleDamage?: string | null
  observations?: string | null
}

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
