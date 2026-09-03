export interface MaintenancePart {
  id: string
  maintenanceId: string
  description: string
  quantity: number
  unit: string | null
  unitCost: number
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface MaintenancePartInput {
  description: string
  quantity: number
  unit: string | null
  unitCost: number
  sortOrder: number
}

export interface MaintenancePartDraft {
  id?: string
  description: string
  quantity: string
  unit: string
  unitCost: string
}
