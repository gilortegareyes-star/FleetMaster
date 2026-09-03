import { getSupabaseClient } from "./supabase"
import type { MaintenanceCostItem, MaintenanceCostItemDraft, MaintenanceCostItemInput, MaintenanceCostKind } from "../types/maintenanceCostItem"

interface MaintenanceCostItemRow {
  id: string
  maintenance_id: string
  kind: MaintenanceCostKind
  description: string
  amount: number
  sort_order: number
  created_at: string
  updated_at: string
}

const toCostItem = (row: MaintenanceCostItemRow): MaintenanceCostItem => ({
  id: row.id,
  maintenanceId: row.maintenance_id,
  kind: row.kind,
  description: row.description,
  amount: Number(row.amount),
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const toCostItemRow = (input: MaintenanceCostItemInput) => ({
  kind: input.kind,
  description: input.description.trim(),
  amount: input.amount,
  sort_order: input.sortOrder,
})

const friendlyError = (message: string) =>
  message.toLowerCase().includes("missing-supabase-config")
    ? "Configura la conexión a Supabase para guardar los cargos."
    : "No se pudieron guardar los cargos. Intenta de nuevo."

export const getMaintenanceCostItems = async (maintenanceId: string) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("maintenance_cost_items")
      .select("*")
      .eq("maintenance_id", maintenanceId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
    if (error) throw error
    return (data ?? []).map((row) => toCostItem(row as MaintenanceCostItemRow))
  } catch (error) {
    throw new Error(friendlyError(error instanceof Error ? error.message : String(error)))
  }
}

export const createMaintenanceCostItem = async (maintenanceId: string, input: MaintenanceCostItemInput) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("maintenance_cost_items")
      .insert({ maintenance_id: maintenanceId, ...toCostItemRow(input) })
      .select("*")
      .single()
    if (error) throw error
    return toCostItem(data as MaintenanceCostItemRow)
  } catch (error) {
    throw new Error(friendlyError(error instanceof Error ? error.message : String(error)))
  }
}

export const updateMaintenanceCostItem = async (id: string, input: MaintenanceCostItemInput) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("maintenance_cost_items")
      .update(toCostItemRow(input))
      .eq("id", id)
      .select("*")
      .single()
    if (error) throw error
    return toCostItem(data as MaintenanceCostItemRow)
  } catch (error) {
    throw new Error(friendlyError(error instanceof Error ? error.message : String(error)))
  }
}

export const deleteMaintenanceCostItems = async (ids: string[]) => {
  if (ids.length === 0) return
  try {
    const { error } = await getSupabaseClient().from("maintenance_cost_items").delete().in("id", ids)
    if (error) throw error
  } catch (error) {
    throw new Error(friendlyError(error instanceof Error ? error.message : String(error)))
  }
}

const changed = (item: MaintenanceCostItem, input: MaintenanceCostItemInput) =>
  item.kind !== input.kind ||
  item.description !== input.description.trim() ||
  item.amount !== input.amount ||
  item.sortOrder !== input.sortOrder

export const syncMaintenanceCostItems = async (
  maintenanceId: string,
  existingItems: MaintenanceCostItem[],
  drafts: MaintenanceCostItemDraft[],
) => {
  try {
    const existingById = new Map(existingItems.map((item) => [item.id, item]))
    const draftIds = new Set(drafts.flatMap((draft) => (draft.id ? [draft.id] : [])))
    const inputs = drafts.map<MaintenanceCostItemInput>((draft, index) => ({
      kind: draft.kind,
      description: draft.description,
      amount: Number(draft.amount),
      sortOrder: index,
    }))

    await Promise.all(
      drafts.flatMap((draft, index) => {
        const input = inputs[index]
        const existing = draft.id ? existingById.get(draft.id) : undefined
        if (!draft.id) return [createMaintenanceCostItem(maintenanceId, input)]
        return existing && changed(existing, input) ? [updateMaintenanceCostItem(existing.id, input)] : []
      }),
    )

    await deleteMaintenanceCostItems(existingItems.filter((item) => !draftIds.has(item.id)).map((item) => item.id))
    return await getMaintenanceCostItems(maintenanceId)
  } catch (error) {
    throw new Error(friendlyError(error instanceof Error ? error.message : String(error)))
  }
}
