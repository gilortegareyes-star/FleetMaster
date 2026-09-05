import { getSupabaseClient } from "./supabase"
import type {
  CreateOrganizationInput,
  CreateManagerInvitationInput,
  CreateOrganizationInvitationInput,
  InvitationContext,
  OrganizationInvitation,
  OrganizationAccess,
  OrganizationUserRecord,
  OrganizationStatus,
  OrganizationSummary,
  UpdateOrganizationInput,
} from "../types/organization"

interface OrganizationSummaryRow {
  id: string
  name: string
  status: OrganizationStatus
  seat_limit: number
  seats_used: number
  seats_available: number
  created_at: string
  suspended_at: string | null
}

const toOrganizationSummary = (row: OrganizationSummaryRow): OrganizationSummary => ({
  id: row.id,
  name: row.name,
  status: row.status,
  seatLimit: row.seat_limit,
  seatsUsed: row.seats_used,
  seatsAvailable: row.seats_available,
  suspendedAt: row.suspended_at,
  createdAt: row.created_at,
  updatedAt: row.created_at,
})

const throwOrganizationError = (error: { message?: string }) => {
  const message = error.message ?? ""
  if (message.includes("seat limit cannot be lower")) throw new Error("El límite no puede ser menor que los usuarios ocupando plaza.")
  if (message.includes("name is required")) throw new Error("Escribe el nombre de la empresa.")
  if (message.includes("seat limit must be greater")) throw new Error("El límite de usuarios debe ser mayor que cero.")
  if (message.includes("organization not found")) throw new Error("La empresa ya no está disponible.")
  throw new Error("No se pudo completar la operación de empresa.")
}

export const listOrganizations = async () => {
  const { data, error } = await getSupabaseClient().rpc("get_organizations_for_admin")
  if (error) throwOrganizationError(error)
  return (data as OrganizationSummaryRow[]).map(toOrganizationSummary)
}

export const createOrganization = async (input: CreateOrganizationInput) => {
  const { data, error } = await getSupabaseClient().rpc("create_organization", {
    p_name: input.name,
    p_seat_limit: input.seatLimit,
  })
  if (error) throwOrganizationError(error)
  return toOrganizationSummary({ ...(data as Record<string, unknown>), seats_used: 0, seats_available: input.seatLimit } as OrganizationSummaryRow)
}

export const updateOrganization = async (input: UpdateOrganizationInput) => {
  const { data, error } = await getSupabaseClient().rpc("update_organization", {
    p_organization_id: input.organizationId,
    p_name: input.name,
    p_seat_limit: input.seatLimit,
  })
  if (error) throwOrganizationError(error)
  return toOrganizationSummary({ ...(data as Record<string, unknown>), seats_used: 0, seats_available: input.seatLimit } as OrganizationSummaryRow)
}

export const setOrganizationStatus = async (organizationId: string, status: OrganizationStatus) => {
  const { data, error } = await getSupabaseClient().rpc("set_organization_status", {
    p_organization_id: organizationId,
    p_status: status,
  })
  if (error) throwOrganizationError(error)
  return data
}

interface OrganizationInvitationRow {
  id: string
  organization_id: string
  email: string
  invitee_name: string | null
  role: OrganizationInvitation["role"]
  invited_by: string
  status: OrganizationInvitation["status"]
  expires_at: string
  created_at: string
  accepted_at: string | null
  revoked_at: string | null
  updated_at: string
}

const toOrganizationInvitation = (row: OrganizationInvitationRow): OrganizationInvitation => ({
  id: row.id,
  organizationId: row.organization_id,
  email: row.email,
  inviteeName: row.invitee_name,
  role: row.role,
  invitedBy: row.invited_by,
  status: row.status,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  acceptedAt: row.accepted_at,
  revokedAt: row.revoked_at,
  updatedAt: row.updated_at,
})

export const createOrganizationInvitation = async (input: CreateOrganizationInvitationInput) => {
  const { data, error } = await getSupabaseClient().rpc("create_organization_invitation", {
    p_organization_id: input.organizationId,
    p_email: input.email,
    p_role: input.role,
    p_expires_at: input.expiresAt,
  })

  if (error) {
    throw error
  }

  return toOrganizationInvitation(data as OrganizationInvitationRow)
}

export const createOrganizationClientInvitation = async (organizationId: string, inviteeName: string, email: string, expiresAt: string) => {
  const { data, error } = await getSupabaseClient().rpc("create_organization_client_invitation", {
    p_organization_id: organizationId,
    p_invitee_name: inviteeName,
    p_email: email,
    p_expires_at: expiresAt,
  })
  if (error) throw error
  return toOrganizationInvitation(data as OrganizationInvitationRow)
}

interface OrganizationUserRow {
  id: string
  user_id?: string | null
  display_name: string | null
  email: string
  role: OrganizationUserRecord["role"]
  status: string
  record_type: OrganizationUserRecord["recordType"]
  created_at: string
  expires_at?: string | null
  accepted_at?: string | null
}

export class OrganizationUsersLoadError extends Error {
  readonly code?: string
  readonly details?: string
  readonly hint?: string

  constructor(error: { code?: unknown; message?: unknown; details?: unknown; hint?: unknown }) {
    super(typeof error.message === "string" ? error.message : "No se pudo cargar la lista de usuarios.")
    this.name = "OrganizationUsersLoadError"
    this.code = typeof error.code === "string" ? error.code : undefined
    this.details = typeof error.details === "string" ? error.details : undefined
    this.hint = typeof error.hint === "string" ? error.hint : undefined
  }
}

const toOrganizationUser = (row: OrganizationUserRow): OrganizationUserRecord => ({
  id: row.id,
  userId: row.user_id ?? null,
  displayName: row.display_name,
  email: row.email,
  role: row.role,
  status: row.status,
  recordType: row.record_type,
  createdAt: row.created_at,
  expiresAt: row.expires_at ?? null,
  acceptedAt: row.accepted_at ?? null,
})

export const listOrganizationUsers = async (organizationId: string) => {
  const { data, error } = await getSupabaseClient().rpc("get_organization_user_records", {
    p_organization_id: organizationId,
  })

  if (error) throw new OrganizationUsersLoadError(error)
  return (data as OrganizationUserRow[]).map(toOrganizationUser)
}

export const createManagerInvitation = async (input: CreateManagerInvitationInput) => {
  const { data, error } = await getSupabaseClient().rpc("create_manager_invitation", {
    p_organization_id: input.organizationId,
    p_invitee_name: input.inviteeName,
    p_email: input.email,
    p_expires_at: input.expiresAt,
  })

  if (error) throwOrganizationError(error)
  return toOrganizationInvitation(data as OrganizationInvitationRow)
}

export const sendManagerInvitation = async (input: { organizationId: string; name: string; email: string }) => {
  const { data, error } = await getSupabaseClient().functions.invoke("invite-organization-user", {
    body: {
      organization_id: input.organizationId,
      name: input.name,
      email: input.email,
      role: "manager",
    },
  })

  if (!error && data?.ok === true) return data

  let code = data && typeof data === "object" && "code" in data ? String(data.code) : ""
  if (!code && error && typeof error === "object" && "context" in error) {
    const context = error.context
    if (context && typeof context === "object" && "clone" in context && typeof context.clone === "function") {
      try {
        const body = await (context as Response).clone().json() as { code?: unknown }
        if (typeof body.code === "string") code = body.code
      } catch {
        // Keep the generic fallback when the error body is unavailable.
      }
    }
  }
  const messages: Record<string, string> = {
    no_seats_available: "No hay lugares disponibles para este usuario.",
    seat_limit_reached: "No hay plazas disponibles para enviar esta invitación.",
    pending_invitation_exists: "Ya existe una invitación pendiente para este Manager.",
    manager_already_exists: "La empresa ya tiene un Manager principal.",
    user_not_eligible: "El usuario no puede recibir esta invitación.",
    organization_suspended: "La empresa está suspendida.",
  }
  throw new Error(messages[code] ?? "No se pudo enviar la invitación.")
}

export const updateCurrentUserPassword = async (password: string) => {
  const { error } = await getSupabaseClient().auth.updateUser({ password })
  if (error) throw new Error("No se pudo establecer la contraseña.")
}

export const acceptOrganizationInvitation = async (invitationId: string) => {
  const { data, error } = await getSupabaseClient().rpc("accept_organization_invitation", {
    p_invitation_id: invitationId,
  })

  if (error) throwOrganizationError(error)
  return data
}

export const getMyInvitation = async (invitationId: string) => {
  const { data, error } = await getSupabaseClient().rpc("get_my_invitation", {
    p_invitation_id: invitationId,
  })

  if (error) throw new Error("No se encontró una invitación válida para esta cuenta.")
  const row = (data as Array<{
    invitation_id: string
    organization_id: string
    organization_name: string
    invitee_name: string | null
    role: InvitationContext["role"]
    expires_at: string
  }>)[0]
  if (!row) throw new Error("No se encontró una invitación válida para esta cuenta.")
  return {
    invitationId: row.invitation_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    inviteeName: row.invitee_name,
    role: row.role,
    expiresAt: row.expires_at,
  } satisfies InvitationContext
}

export const acceptOrganizationInvitationWithProfile = async (invitationId: string, fullName: string) => {
  const { data, error } = await getSupabaseClient().rpc("accept_organization_invitation_with_profile", {
    p_invitation_id: invitationId,
    p_full_name: fullName,
  })

  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes("email does not match")) throw new Error("Esta invitación corresponde a otro correo.")
    if (message.includes("expired")) throw new Error("La invitación ya expiró.")
    if (message.includes("not active")) throw new Error("La empresa no está activa.")
    if (message.includes("belongs to") || message.includes("already a member")) throw new Error("Esta cuenta ya pertenece a otra organización.")
    throw new Error("No se pudo aceptar la invitación.")
  }

  return data
}

export const getMyOrganizationAccess = async () => {
  const { data, error } = await getSupabaseClient().rpc("get_my_organization_account")
  if (error) throw error
  const row = (data as Array<{
    organization_id: string
    organization_name: string
    role: OrganizationAccess["role"]
    status: OrganizationAccess["status"]
    display_name: string | null
    email: string
    membership_created_at: string
    seat_limit: number
    seats_used: number
    seats_available: number
  }>)[0]
  if (!row) return null
  return {
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    role: row.role,
    status: row.status,
    displayName: row.display_name,
    email: row.email,
    membershipCreatedAt: row.membership_created_at,
    seatLimit: row.seat_limit,
    seatsUsed: row.seats_used,
    seatsAvailable: row.seats_available,
  } satisfies OrganizationAccess
}

export const disableOrganizationMembership = async (membershipId: string) => {
  const { data, error } = await getSupabaseClient().rpc("disable_organization_membership", {
    p_membership_id: membershipId,
  })

  if (error) throwOrganizationError(error)
  return data
}

export const revokeOrganizationInvitation = async (invitationId: string) => {
  const { data, error } = await getSupabaseClient().rpc("revoke_organization_invitation", {
    p_invitation_id: invitationId,
  })

  if (error) throwOrganizationError(error)
  return toOrganizationInvitation(data as OrganizationInvitationRow)
}
