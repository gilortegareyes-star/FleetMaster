import { getSupabaseClient } from "./supabase"
import type { MaintenanceWorkCatalogItem } from "../types/maintenanceWorkCatalog"

interface Row { id:string; name:string; is_active:boolean; usage_count:number; created_at:string; updated_at:string }
const map = (row: Row): MaintenanceWorkCatalogItem => ({ id:row.id,name:row.name,isActive:row.is_active,usageCount:row.usage_count,createdAt:row.created_at,updatedAt:row.updated_at })
const fail = (error: unknown) => new Error(error instanceof Error ? error.message : "No se pudo cargar el catálogo de trabajos.")
export const getActiveMaintenanceWorkCatalog = async () => { try { const {data,error}=await getSupabaseClient().from("maintenance_work_catalog").select("*").eq("is_active",true).order("usage_count",{ascending:false}).order("name",{ascending:true}); if(error)throw error; return (data??[]).map(row=>map(row as Row)) } catch(error){throw fail(error)} }
export const createMaintenanceWorkCatalogItem = async (name:string) => { try { const {data,error}=await getSupabaseClient().from("maintenance_work_catalog").insert({name:name.trim()}).select("*").single(); if(error)throw error; return map(data as Row) } catch(error){throw fail(error)} }
