export const maintenanceProviderTypes = [
  "agency",
  "workshop",
  "tire_shop",
  "specialist",
  "other",
] as const

export type MaintenanceProviderType = (typeof maintenanceProviderTypes)[number]

export interface MaintenanceProvider {
  id: string
  organizationId: string
  name: string
  type: MaintenanceProviderType
  isActive: boolean
  createdAt: string
  updatedAt: string
}
