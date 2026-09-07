import { UsersRound } from "lucide-react"
import { OrganizationUsersPanel } from "./OrganizationUsersPanel"
import type { OrganizationAccess, OrganizationSummary } from "../types/organization"

export function OrganizationUsersPage({ access, isSaving, onFeedback, onRefreshOrganizations, onSavingChange }: { access: OrganizationAccess; isSaving: boolean; onFeedback: (message: string) => void; onRefreshOrganizations: () => Promise<void>; onSavingChange: (value: boolean) => void }) {
  const organization: OrganizationSummary = {
    id: access.organizationId, name: access.organizationName, seatLimit: access.seatLimit, status: "active", suspendedAt: null, createdAt: access.membershipCreatedAt, updatedAt: access.membershipCreatedAt,
    seatsUsed: access.seatsUsed, seatsAvailable: access.seatsAvailable, operationalAccessManuallyEnabled: access.operationalAccessManuallyEnabled, operationalAccessChangedAt: access.operationalAccessChangedAt, operationalAccessChangedBy: null, operationalAccessReasonCode: access.operationalAccessReasonCode, operationalAccessReasonNote: access.operationalAccessReasonNote,
  }
  return <section className="manager-users-page"><header className="page-header"><div><p>Gestión de organización</p><h1>Usuarios</h1><span>Administra las personas que tienen acceso a tu empresa.</span></div><div className="manager-users-page__summary"><strong>{access.seatsUsed} de {access.seatLimit}</strong><span>{access.seatsAvailable} disponibles</span></div></header><div className="manager-users-page__identity"><UsersRound aria-hidden="true" size={18} /><span>{access.organizationName}</span></div><OrganizationUsersPanel mode="manager" organization={organization} isSaving={isSaving} onFeedback={onFeedback} onRefreshOrganizations={onRefreshOrganizations} onSavingChange={onSavingChange} /></section>
}
