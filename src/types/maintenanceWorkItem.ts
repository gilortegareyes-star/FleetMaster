export interface MaintenanceWorkItem {
  id: string
  maintenanceId: string
  catalogItemId: string | null
  description: string
  notes: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface MaintenanceWorkItemInput {
  description: string
  notes: string | null
  sortOrder: number
  catalogItemId: string | null
}

export interface MaintenanceWorkItemDraft {
  id?: string
  description: string
  notes: string
  catalogItemId?: string | null
}
