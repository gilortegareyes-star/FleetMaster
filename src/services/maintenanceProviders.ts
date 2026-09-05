import { getSupabaseClient } from "./supabase"
import type { MaintenanceProvider, MaintenanceProviderType } from "../types/maintenanceProvider"

interface MaintenanceProviderRow {
  id: string
  organization_id: string
  name: string
  type: MaintenanceProviderType
  is_active: boolean
  created_at: string
  updated_at: string
}

const toMaintenanceProvider = (row: MaintenanceProviderRow): MaintenanceProvider => ({
  id: row.id,
  organizationId: row.organization_id,
  name: row.name,
  type: row.type,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const providerError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  if (message.includes("duplicate") || message.includes("unique")) return new Error("Ya existe un proveedor activo con ese nombre.")
  if (message.includes("permission") || message.includes("policy") || message.includes("row-level security")) return new Error("No tienes permisos para gestionar proveedores de esta empresa.")
  return new Error("No se pudo guardar el proveedor. Intenta de nuevo.")
}

export const listMaintenanceProviders = async (organizationId: string) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("maintenance_providers")
      .select("*")
      .eq("organization_id", organizationId)
      .order("is_active", { ascending: false })
      .order("name", { ascending: true })

    if (error) throw error
    return (data ?? []).map((row) => toMaintenanceProvider(row as MaintenanceProviderRow))
  } catch (error) {
    throw providerError(error)
  }
}

export const createMaintenanceProvider = async (organizationId: string, name: string, type: MaintenanceProviderType) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("maintenance_providers")
      .insert({ organization_id: organizationId, name: name.trim(), type })
      .select("*")
      .single()

    if (error) throw error
    return toMaintenanceProvider(data as MaintenanceProviderRow)
  } catch (error) {
    throw providerError(error)
  }
}

export const updateMaintenanceProvider = async (id: string, organizationId: string, name: string, type: MaintenanceProviderType) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("maintenance_providers")
      .update({ name: name.trim(), type })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select("*")
      .single()

    if (error) throw error
    return toMaintenanceProvider(data as MaintenanceProviderRow)
  } catch (error) {
    throw providerError(error)
  }
}

export const setMaintenanceProviderActive = async (id: string, organizationId: string, isActive: boolean) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("maintenance_providers")
      .update({ is_active: isActive })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select("*")
      .single()

    if (error) throw error
    return toMaintenanceProvider(data as MaintenanceProviderRow)
  } catch (error) {
    throw providerError(error)
  }
}
