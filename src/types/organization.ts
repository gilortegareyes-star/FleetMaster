export const organizationRoles = ["client", "manager", "admin"] as const
export type OrganizationRole = (typeof organizationRoles)[number]

export const organizationStatuses = ["active", "suspended"] as const
export type OrganizationStatus = (typeof organizationStatuses)[number]

export const membershipStatuses = ["active", "disabled"] as const
export type MembershipStatus = (typeof membershipStatuses)[number]

export const organizationInvitationStatuses = ["pending", "accepted", "expired", "revoked"] as const
export type OrganizationInvitationStatus = (typeof organizationInvitationStatuses)[number]

export interface Organization {
  id: string
  name: string
  seatLimit: number
  status: OrganizationStatus
  suspendedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface OrganizationInvitation {
  id: string
  organizationId: string
  email: string
  role: OrganizationRole
  invitedBy: string
  status: OrganizationInvitationStatus
  expiresAt: string
  createdAt: string
  acceptedAt: string | null
  revokedAt: string | null
  updatedAt: string
}

export interface CreateOrganizationInvitationInput {
  organizationId: string
  email: string
  role: OrganizationRole
  expiresAt: string
}
