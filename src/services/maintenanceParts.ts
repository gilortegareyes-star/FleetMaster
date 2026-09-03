import { getSupabaseClient } from "./supabase"
import type { MaintenancePart, MaintenancePartDraft, MaintenancePartInput } from "../types/maintenancePart"

interface MaintenancePartRow {
  id: string
  maintenance_id: string
  description: string
  quantity: number
  unit: string | null
  unit_cost: number
  sort_order: number
  created_at: string
  updated_at: string
}

const toPart = (row: MaintenancePartRow): MaintenancePart => ({
  id: row.id,
  maintenanceId: row.maintenance_id,
  description: row.description,
  quantity: Number(row.quantity),
  unit: row.unit,
  unitCost: Number(row.unit_cost),
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const toPartRow = (input: MaintenancePartInput) => ({
  description: input.description.trim(),
  quantity: input.quantity,
  unit: input.unit?.trim() || null,
  unit_cost: input.unitCost,
  sort_order: input.sortOrder,
})

const friendlyError = (message: string) =>
  message.toLowerCase().includes("missing-supabase-config")
    ? "Configura la conexión a Supabase para guardar las refacciones."
    : "No se pudieron guardar las refacciones y materiales. Intenta de nuevo."

export const getMaintenanceParts = async (maintenanceId: string) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("maintenance_parts")
      .select("*")
      .eq("maintenance_id", maintenanceId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
    if (error) throw error
    return (data ?? []).map((row) => toPart(row as MaintenancePartRow))
  } catch (error) {
    throw new Error(friendlyError(error instanceof Error ? error.message : String(error)))
  }
}

export const createMaintenancePart = async (maintenanceId: string, input: MaintenancePartInput) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("maintenance_parts")
      .insert({ maintenance_id: maintenanceId, ...toPartRow(input) })
      .select("*")
      .single()
    if (error) throw error
    return toPart(data as MaintenancePartRow)
  } catch (error) {
    throw new Error(friendlyError(error instanceof Error ? error.message : String(error)))
  }
}

export const updateMaintenancePart = async (id: string, input: MaintenancePartInput) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("maintenance_parts")
      .update(toPartRow(input))
      .eq("id", id)
      .select("*")
      .single()
    if (error) throw error
    return toPart(data as MaintenancePartRow)
  } catch (error) {
    throw new Error(friendlyError(error instanceof Error ? error.message : String(error)))
  }
}

export const deleteMaintenanceParts = async (ids: string[]) => {
  if (ids.length === 0) return
  try {
    const { error } = await getSupabaseClient().from("maintenance_parts").delete().in("id", ids)
    if (error) throw error
  } catch (error) {
    throw new Error(friendlyError(error instanceof Error ? error.message : String(error)))
  }
}

const changed = (part: MaintenancePart, input: MaintenancePartInput) =>
  part.description !== input.description.trim() ||
  part.quantity !== input.quantity ||
  (part.unit ?? "") !== (input.unit?.trim() || "") ||
  part.unitCost !== input.unitCost ||
  part.sortOrder !== input.sortOrder

export const syncMaintenanceParts = async (
  maintenanceId: string,
  existingParts: MaintenancePart[],
  drafts: MaintenancePartDraft[],
) => {
  try {
    const existingById = new Map(existingParts.map((part) => [part.id, part]))
    const draftIds = new Set(drafts.flatMap((draft) => (draft.id ? [draft.id] : [])))
    const inputs = drafts.map<MaintenancePartInput>((draft, index) => ({
      description: draft.description,
      quantity: Number(draft.quantity),
      unit: draft.unit || null,
      unitCost: Number(draft.unitCost),
      sortOrder: index,
    }))

    await Promise.all(
      drafts.flatMap((draft, index) => {
        const input = inputs[index]
        const existing = draft.id ? existingById.get(draft.id) : undefined
        if (!draft.id) return [createMaintenancePart(maintenanceId, input)]
        return existing && changed(existing, input) ? [updateMaintenancePart(existing.id, input)] : []
      }),
    )

    await deleteMaintenanceParts(existingParts.filter((part) => !draftIds.has(part.id)).map((part) => part.id))
    return await getMaintenanceParts(maintenanceId)
  } catch (error) {
    throw new Error(friendlyError(error instanceof Error ? error.message : String(error)))
  }
}
