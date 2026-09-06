import { getSupabaseClient } from "./supabase"
import type { FeedbackCategory, FeedbackPriority, FeedbackStatus, FeedbackTicket, FeedbackTicketMessage } from "../types/feedback"

interface FeedbackTicketRow {
  id: string
  organization_id: string
  folio: string
  created_by: string
  title: string
  category: FeedbackCategory
  status: FeedbackStatus
  priority: FeedbackPriority
  created_at: string
  updated_at: string
  resolved_at: string | null
  closed_at: string | null
}

interface FeedbackMessageRow {
  id: string
  ticket_id: string
  organization_id: string
  author_id: string
  message: string
  created_at: string
}

interface ProfileRow { id: string; display_name: string | null }

const feedbackError = (error: { message?: string }) => {
  const message = error.message?.toLowerCase() ?? ""
  if (message.includes("closed tickets")) return new Error("Los tickets cerrados no aceptan nuevas respuestas.")
  if (message.includes("active organization membership")) return new Error("Tu cuenta no tiene una organización activa.")
  if (message.includes("insufficient organization permissions")) return new Error("No tienes acceso a este ticket.")
  return new Error("No se pudo completar la operación de Feedback.")
}

const loadProfileNames = async (ids: string[]) => {
  const uniqueIds = [...new Set(ids)]
  if (uniqueIds.length === 0) return new Map<string, string | null>()
  const { data, error } = await getSupabaseClient().from("profiles").select("id, display_name").in("id", uniqueIds)
  if (error) return new Map<string, string | null>()
  return new Map((data as ProfileRow[]).map((profile) => [profile.id, profile.display_name]))
}

const toTicket = (row: FeedbackTicketRow, profileNames: Map<string, string | null>): FeedbackTicket => ({
  id: row.id,
  organizationId: row.organization_id,
  folio: row.folio,
  createdBy: row.created_by,
  creatorName: profileNames.get(row.created_by) ?? null,
  title: row.title,
  category: row.category,
  status: row.status,
  priority: row.priority,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  resolvedAt: row.resolved_at,
  closedAt: row.closed_at,
})

export const listMyFeedbackTickets = async () => {
  const { data, error } = await getSupabaseClient().from("feedback_tickets").select("*").order("updated_at", { ascending: false })
  if (error) throw feedbackError(error)
  const rows = (data ?? []) as FeedbackTicketRow[]
  return rows.map((row) => toTicket(row, new Map()))
}

export const listOrganizationFeedbackTickets = async (organizationId: string) => {
  const { data, error } = await getSupabaseClient().from("feedback_tickets").select("*").eq("organization_id", organizationId).order("updated_at", { ascending: false })
  if (error) throw feedbackError(error)
  const rows = (data ?? []) as FeedbackTicketRow[]
  const profileNames = await loadProfileNames(rows.map((row) => row.created_by))
  return rows.map((row) => toTicket(row, profileNames))
}

export const getFeedbackTicketMessages = async (ticketId: string) => {
  const { data, error } = await getSupabaseClient().from("feedback_ticket_messages").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true })
  if (error) throw feedbackError(error)
  const rows = (data ?? []) as FeedbackMessageRow[]
  const profileNames = await loadProfileNames(rows.map((row) => row.author_id))
  return rows.map((row): FeedbackTicketMessage => ({
    id: row.id,
    ticketId: row.ticket_id,
    organizationId: row.organization_id,
    authorId: row.author_id,
    authorName: profileNames.get(row.author_id) ?? null,
    message: row.message,
    createdAt: row.created_at,
  }))
}

export const createFeedbackTicket = async (title: string, category: FeedbackCategory, message: string) => {
  const { data, error } = await getSupabaseClient().rpc("create_feedback_ticket", { p_title: title, p_category: category, p_message: message })
  if (error) throw feedbackError(error)
  return toTicket(data as FeedbackTicketRow, new Map())
}

export const addFeedbackTicketMessage = async (ticketId: string, message: string) => {
  const { data, error } = await getSupabaseClient().rpc("add_feedback_ticket_message", { p_ticket_id: ticketId, p_message: message })
  if (error) throw feedbackError(error)
  return data as FeedbackMessageRow
}
