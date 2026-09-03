import type { MaintenanceCostItem, MaintenanceCostItemDraft } from "../types/maintenanceCostItem"
import type { MaintenancePart, MaintenancePartDraft } from "../types/maintenancePart"

const finiteNonNegative = (value: number) => (Number.isFinite(value) && value >= 0 ? value : 0)

export const parseCostValue = (value: string) => {
  if (!value.trim()) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export const calculatePartSubtotal = (quantity: number, unitCost: number) =>
  finiteNonNegative(quantity) * finiteNonNegative(unitCost)

export const calculatePartsTotal = (items: Array<MaintenancePart | MaintenancePartDraft>) =>
  items.reduce((total, item) => {
    const quantity = typeof item.quantity === "string" ? parseCostValue(item.quantity) : item.quantity
    const unitCost = typeof item.unitCost === "string" ? parseCostValue(item.unitCost) : item.unitCost
    return total + calculatePartSubtotal(quantity ?? Number.NaN, unitCost ?? Number.NaN)
  }, 0)

export const calculateCostItemsTotal = (
  items: Array<MaintenanceCostItem | MaintenanceCostItemDraft>,
  kind: "labor" | "other",
) =>
  items
    .filter((item) => item.kind === kind)
    .reduce((total, item) => {
      const amount = typeof item.amount === "string" ? parseCostValue(item.amount) : item.amount
      return total + finiteNonNegative(amount ?? Number.NaN)
    }, 0)

export const calculateMaintenanceCostTotal = (
  parts: Array<MaintenancePart | MaintenancePartDraft>,
  costItems: Array<MaintenanceCostItem | MaintenanceCostItemDraft>,
) => calculatePartsTotal(parts) + calculateCostItemsTotal(costItems, "labor") + calculateCostItemsTotal(costItems, "other")
