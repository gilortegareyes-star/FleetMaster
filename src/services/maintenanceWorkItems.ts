import { getSupabaseClient } from "./supabase"
import type { MaintenanceWorkItem, MaintenanceWorkItemDraft, MaintenanceWorkItemInput, MaintenanceWorkResult } from "../types/maintenanceWorkItem"

interface MaintenanceWorkItemRow {
  id: string
  maintenance_id: string
  catalog_item_id: string | null
  description: string
  notes: string | null
  result: MaintenanceWorkResult | null
  sort_order: number
  created_at: string
  updated_at: string
}

const toMaintenanceWorkItem = (row: MaintenanceWorkItemRow): MaintenanceWorkItem => ({
  id: row.id,
  maintenanceId: row.maintenance_id,
  catalogItemId: row.catalog_item_id,
  description: row.description,
  notes: row.notes,
  result: row.result,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const toWorkItemRow = (input: MaintenanceWorkItemInput) => ({
  description: input.description.trim(),
  notes: input.notes?.trim() || null,
  sort_order: input.sortOrder,
  catalog_item_id: input.catalogItemId,
})

const friendlyWorkItemError = (message: string) => {
  if (message.toLowerCase().includes("missing-supabase-config")) {
    return "Configura la conexión a Supabase para guardar los trabajos realizados."
  }

  return "No se pudieron guardar los trabajos realizados. Intenta de nuevo."
}

export const getMaintenanceWorkItems = async (maintenanceId: string) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("maintenance_work_items")
      .select("*")
      .eq("maintenance_id", maintenanceId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })

    if (error) {
      throw error
    }

    return (data ?? []).map((row) => toMaintenanceWorkItem(row as MaintenanceWorkItemRow))
  } catch (error) {
    throw new Error(friendlyWorkItemError(error instanceof Error ? error.message : String(error)))
  }
}

export const createMaintenanceWorkItem = async (maintenanceId: string, input: MaintenanceWorkItemInput) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("maintenance_work_items")
      .insert({ maintenance_id: maintenanceId, ...toWorkItemRow(input) })
      .select("*")
      .single()

    if (error) {
      throw error
    }

    return toMaintenanceWorkItem(data as MaintenanceWorkItemRow)
  } catch (error) {
    throw new Error(friendlyWorkItemError(error instanceof Error ? error.message : String(error)))
  }
}

export const updateMaintenanceWorkItem = async (id: string, input: MaintenanceWorkItemInput) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("maintenance_work_items")
      .update(toWorkItemRow(input))
      .eq("id", id)
      .select("*")
      .single()

    if (error) {
      throw error
    }

    return toMaintenanceWorkItem(data as MaintenanceWorkItemRow)
  } catch (error) {
    throw new Error(friendlyWorkItemError(error instanceof Error ? error.message : String(error)))
  }
}

export const deleteMaintenanceWorkItems = async (ids: string[]) => {
  if (ids.length === 0) {
    return
  }

  try {
    const { error } = await getSupabaseClient().from("maintenance_work_items").delete().in("id", ids)

    if (error) {
      throw error
    }
  } catch (error) {
    throw new Error(friendlyWorkItemError(error instanceof Error ? error.message : String(error)))
  }
}

const changed = (item: MaintenanceWorkItem, input: MaintenanceWorkItemInput) =>
  item.description !== input.description.trim() ||
  (item.notes ?? "") !== (input.notes?.trim() || "") ||
  item.sortOrder !== input.sortOrder
  || item.catalogItemId !== input.catalogItemId

export const syncMaintenanceWorkItems = async (
  maintenanceId: string,
  existingItems: MaintenanceWorkItem[],
  drafts: MaintenanceWorkItemDraft[],
) => {
  try {
    const existingById = new Map(existingItems.map((item) => [item.id, item]))
    const draftIds = new Set(drafts.flatMap((draft) => (draft.id ? [draft.id] : [])))
    const inputs = drafts.map<MaintenanceWorkItemInput>((draft, index) => ({
      description: draft.description,
      notes: draft.notes || null,
      catalogItemId: draft.catalogItemId ?? null,
      sortOrder: index,
    }))

    await Promise.all(
      drafts.flatMap((draft, index) => {
        const input = inputs[index]
        const existing = draft.id ? existingById.get(draft.id) : undefined

        if (!draft.id) {
          return [createMaintenanceWorkItem(maintenanceId, input)]
        }

        return existing && changed(existing, input) ? [updateMaintenanceWorkItem(existing.id, input)] : []
      }),
    )

    const deletedIds = existingItems.filter((item) => !draftIds.has(item.id)).map((item) => item.id)
    await deleteMaintenanceWorkItems(deletedIds)

    return await getMaintenanceWorkItems(maintenanceId)
  } catch (error) {
    throw new Error(friendlyWorkItemError(error instanceof Error ? error.message : String(error)))
  }
}
