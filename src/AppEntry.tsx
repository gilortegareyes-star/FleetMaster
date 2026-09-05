import { LogIn } from "lucide-react"
import { useEffect, useState } from "react"
import { Login } from "./components/Login"
import { InvitationOnboarding } from "./components/InvitationOnboarding"
import { OrganizationAccountPage } from "./components/OrganizationAccountPage"
import { getMyInvitation } from "./services/organizations"
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

  useEffect(() => {
    if (!session || isFleetmasterAdmin || !invitationId || !invitationPattern.test(invitationId)) {
      setInvitation(null)
      setInvitationLoading(false)
      return
    }
    setInvitationLoading(true)
    void getMyInvitation(invitationId).then(setInvitation).catch(() => setInvitation(null)).finally(() => setInvitationLoading(false))
  }, [invitationId, isFleetmasterAdmin, session])

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
  if (isFleetmasterAdmin) return <App />
  if (invitation) return <InvitationOnboarding invitation={invitation} isNewUser={isInviteSession} onAccepted={clearInvitation} />
  if (organizationAccess) return <OrganizationAccountPage access={organizationAccess} />
  return <AccessDenied />
}
