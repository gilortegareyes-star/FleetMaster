import { LogIn } from "lucide-react"
import { useEffect, useState } from "react"
import { Login } from "./components/Login"
import { InvitationOnboarding } from "./components/InvitationOnboarding"
import { OrganizationAccountPage } from "./components/OrganizationAccountPage"
import { getMyInvitation } from "./services/organizations"
import { getSupabaseClient } from "./services/supabase"
import { listFeedbackAdminUnreadSummary, listFeedbackUnreadTickets } from "./services/feedback"
import type { FeedbackAdminUnreadOrganization, FeedbackUnreadTicket } from "./types/feedback"
import type { InvitationContext } from "./types/organization"
import { getStoredInviteContext, useAuth } from "./contexts/AuthContext"
import App from "./App"
import "./App.css"

function AuthLoading() {
  return <main className="auth-shell auth-shell--loading" aria-live="polite"><div className="auth-loading-mark">FM</div><span>Verificando acceso...</span></main>
}

function AccessDenied() {
  const { signOut } = useAuth()
  return <main className="auth-shell"><section className="access-denied-panel"><div className="auth-loading-mark"><LogIn aria-hidden="true" size={22} /></div><p>Acceso privado</p><h1>Tu cuenta aún no tiene acceso habilitado a FleetMaster.</h1><button className="button button--secondary" onClick={() => void signOut()} type="button">Cerrar sesión</button></section></main>
}

const invitationPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default function AppEntry() {
  const { authorizationLoading, clearInviteSessionContext, isFleetmasterAdmin, isInviteSession, loading, organizationAccess, organizationAccessLoading, refreshOrganizationAccess, session } = useAuth()
  const [invitationId, setInvitationId] = useState(() => new URLSearchParams(window.location.search).get("invitation") ?? getStoredInviteContext()?.invitationId ?? null)
  const [invitation, setInvitation] = useState<InvitationContext | null>(null)
  const [invitationLoading, setInvitationLoading] = useState(false)
  const [supportUnreadTickets, setSupportUnreadTickets] = useState<FeedbackUnreadTicket[]>([])
  const [supportUnreadOrganizations, setSupportUnreadOrganizations] = useState<FeedbackAdminUnreadOrganization[]>([])

  const refreshSupportUnread = async () => {
    const safeError = (error: unknown) => {
      if (!error || typeof error !== "object") return {}
      const candidate = error as { code?: unknown; message?: unknown; rawMessage?: unknown; details?: unknown; hint?: unknown }
      return {
        ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
        ...(typeof candidate.rawMessage === "string" ? { message: candidate.rawMessage } : typeof candidate.message === "string" ? { message: candidate.message } : {}),
        ...(typeof candidate.details === "string" ? { details: candidate.details } : {}),
        ...(typeof candidate.hint === "string" ? { hint: candidate.hint } : {}),
      }
    }

    if (isFleetmasterAdmin) {
      try {
        const [tickets, organizations] = await Promise.all([
          listFeedbackUnreadTickets().then((result) => {
            console.debug("[FLEET-5E DEBUG] unread tickets response", { count: result.length, ticketIds: result.map((ticket) => ticket.ticketId) })
            return result
          }).catch((error) => {
            console.error("[FLEET-5E DEBUG] unread tickets error", safeError(error))
            throw error
          }),
          listFeedbackAdminUnreadSummary().then((result) => {
            console.debug("[FLEET-5E DEBUG] admin unread summary response", { count: result.length, organizations: result.map((organization) => ({ organizationId: organization.organizationId, unreadCount: organization.unreadCount })) })
            return result
          }).catch((error) => {
            console.error("[FLEET-5E DEBUG] admin unread summary error", safeError(error))
            throw error
          }),
        ])
        setSupportUnreadTickets(tickets)
        setSupportUnreadOrganizations(organizations)
      } catch {
        setSupportUnreadTickets([])
        setSupportUnreadOrganizations([])
      }
      return
    }

    if (organizationAccess) {
      try {
        const tickets = await listFeedbackUnreadTickets()
        console.debug("[FLEET-5E DEBUG] unread tickets response", { count: tickets.length, ticketIds: tickets.map((ticket) => ticket.ticketId), organizationId: organizationAccess.organizationId })
        setSupportUnreadTickets(tickets)
      } catch (error) {
        console.error("[FLEET-5E DEBUG] unread tickets error", safeError(error))
        setSupportUnreadTickets([])
      }
      setSupportUnreadOrganizations([])
      return
    }

    setSupportUnreadTickets([])
    setSupportUnreadOrganizations([])
  }

  useEffect(() => {
    if (!session || isFleetmasterAdmin || !invitationId || !invitationPattern.test(invitationId)) {
      setInvitation(null)
      setInvitationLoading(false)
      return
    }
    setInvitationLoading(true)
    void getMyInvitation(invitationId).then(setInvitation).catch(() => setInvitation(null)).finally(() => setInvitationLoading(false))
  }, [invitationId, isFleetmasterAdmin, session])

  useEffect(() => {
    let active = true
    if (session) {
      console.debug("[FLEET-5E DEBUG] unread identity", { role: isFleetmasterAdmin ? "fleetmaster_admin" : organizationAccess?.role ?? "organization_user", isFleetmasterAdmin, organizationId: organizationAccess?.organizationId ?? null })
    }
    if (!session || loading || authorizationLoading || organizationAccessLoading || (!isFleetmasterAdmin && !organizationAccess)) {
      void refreshSupportUnread()
      return () => {
        active = false
      }
    }

    void refreshSupportUnread()
    const channel = getSupabaseClient().channel(`feedback-notifications-${session.user.id}-${isFleetmasterAdmin ? "admin" : organizationAccess?.organizationId}`)
    const ticketChanges = channel.on(
      "postgres_changes",
      isFleetmasterAdmin
        ? { event: "INSERT", schema: "public", table: "feedback_tickets" }
        : { event: "INSERT", schema: "public", table: "feedback_tickets", filter: `organization_id=eq.${organizationAccess?.organizationId}` },
      () => {
        if (active) void refreshSupportUnread()
      },
    )
    ticketChanges.on(
      "postgres_changes",
      isFleetmasterAdmin
        ? { event: "INSERT", schema: "public", table: "feedback_ticket_messages" }
        : { event: "INSERT", schema: "public", table: "feedback_ticket_messages", filter: `organization_id=eq.${organizationAccess?.organizationId}` },
      () => {
        if (active) void refreshSupportUnread()
      },
    ).subscribe()

    return () => {
      active = false
      void getSupabaseClient().removeChannel(channel)
    }
  }, [authorizationLoading, isFleetmasterAdmin, loading, organizationAccess?.organizationId, organizationAccessLoading, session?.user.id])

  const clearInvitation = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete("invitation")
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`)
    setInvitationId(null)
    setInvitation(null)
    clearInviteSessionContext()
    void refreshOrganizationAccess()
  }

  if (loading || (session && (authorizationLoading || organizationAccessLoading || invitationLoading))) return <AuthLoading />
  if (!session) return <Login hasInvitation={Boolean(invitationId)} />
  const supportProps = { onRefreshSupportUnread: refreshSupportUnread, supportUnreadOrganizations, supportUnreadTickets }
  if (isFleetmasterAdmin) return <App {...supportProps} />
  if (invitation) return <InvitationOnboarding invitation={invitation} isNewUser={isInviteSession} onAccepted={clearInvitation} />
  if (organizationAccess?.operationalAccessEnabled === true) return <App {...supportProps} />
  if (organizationAccess) return <OrganizationAccountPage access={organizationAccess} unreadTickets={supportUnreadTickets} onRefreshUnread={refreshSupportUnread} />
  return <AccessDenied />
}
