import { getSupabaseClient } from "./supabase"
import type { CreateOrganizationInvitationInput, OrganizationInvitation } from "../types/organization"

interface OrganizationInvitationRow {
  id: string
  organization_id: string
  email: string
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
