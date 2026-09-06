export const organizationRoles = ["client", "manager", "admin"] as const
export type OrganizationRole = (typeof organizationRoles)[number]

export const organizationStatuses = ["active", "suspended"] as const
export type OrganizationStatus = (typeof organizationStatuses)[number]

export const membershipStatuses = ["active", "disabled"] as const
export type MembershipStatus = (typeof membershipStatuses)[number]

export const organizationInvitationStatuses = ["pending", "accepted", "expired", "revoked"] as const
export type OrganizationInvitationStatus = (typeof organizationInvitationStatuses)[number]
export type OperationalAccessReasonCode = "manual" | "maintenance" | "administrative" | "security" | "payment" | "other"

export interface Organization {
  id: string
  name: string
  seatLimit: number
  status: OrganizationStatus
  suspendedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface OrganizationSummary extends Organization {
  seatsUsed: number
  seatsAvailable: number
  operationalAccessManuallyEnabled: boolean
  operationalAccessChangedAt: string | null
  operationalAccessChangedBy: string | null
  operationalAccessReasonCode: OperationalAccessReasonCode | null
  operationalAccessReasonNote: string | null
}

export interface CreateOrganizationInput {
  name: string
  seatLimit: number
}

export interface UpdateOrganizationInput extends CreateOrganizationInput {
  organizationId: string
}

export interface OrganizationInvitation {
  id: string
  organizationId: string
  email: string
  inviteeName: string | null
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

export type OrganizationUserRecordType = "membership" | "invitation"

export interface OrganizationUserRecord {
  id: string
  userId?: string | null
  displayName: string | null
  email: string
  role: OrganizationRole
  status: string
  recordType: OrganizationUserRecordType
  createdAt: string
  expiresAt?: string | null
  acceptedAt?: string | null
}

export interface InvitationContext {
  invitationId: string
  organizationId: string
  organizationName: string
  inviteeName: string | null
  role: OrganizationRole
  expiresAt: string
}

export interface OrganizationAccess {
  organizationId: string
  organizationName: string
  role: OrganizationRole
  status: MembershipStatus
  displayName: string | null
  email: string
  membershipCreatedAt: string
  seatLimit: number
  seatsUsed: number
  seatsAvailable: number
  operationalAccessManuallyEnabled: boolean
  operationalAccessEnabled: boolean
  operationalAccessChangedAt: string | null
  operationalAccessReasonCode: OperationalAccessReasonCode | null
  operationalAccessReasonNote: string | null
}

export interface CreateManagerInvitationInput {
  organizationId: string
  inviteeName: string
  email: string
  expiresAt: string
}
