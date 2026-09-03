export type MaintenanceCostKind = "labor" | "other"

export interface MaintenanceCostItem {
  id: string
  maintenanceId: string
  kind: MaintenanceCostKind
  description: string
  amount: number
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface MaintenanceCostItemInput {
  kind: MaintenanceCostKind
  description: string
  amount: number
  sortOrder: number
}

export interface MaintenanceCostItemDraft {
  id?: string
  kind: MaintenanceCostKind
  description: string
  amount: string
}
