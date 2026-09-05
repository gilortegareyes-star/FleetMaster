import { CheckCircle2, LogOut, ShieldCheck } from "lucide-react"
import { useState, type FormEvent } from "react"
import { acceptOrganizationInvitationWithProfile, updateCurrentUserPassword } from "../services/organizations"
import type { InvitationContext } from "../types/organization"
import { useAuth } from "../contexts/AuthContext"

const roleLabels = { admin: "Administrador", manager: "Manager", client: "Cliente" } as const

export function InvitationOnboarding({ invitation, isNewUser, onAccepted }: { invitation: InvitationContext; isNewUser: boolean; onAccepted: () => void }) {
  const { signOut, user } = useAuth()
  const [fullName, setFullName] = useState(invitation.inviteeName ?? user?.user_metadata?.display_name ?? "")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [password, setPassword] = useState("")
  const [passwordConfirmation, setPasswordConfirmation] = useState("")

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = fullName.trim()
    if (!name || name.length > 160) {
      setError("Escribe tu nombre completo.")
      return
    }
    if (isNewUser && password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.")
      return
    }
    if (isNewUser && password !== passwordConfirmation) {
      setError("Las contraseñas no coinciden.")
      return
    }
    setError(null)
    setIsSubmitting(true)
    try {
      if (isNewUser) await updateCurrentUserPassword(password)
      await acceptOrganizationInvitationWithProfile(invitation.invitationId, name)
      onAccepted()
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "No se pudo aceptar la invitación.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return <main className="auth-shell"><section className="invitation-panel" aria-labelledby="invitation-title">
    <div className="invitation-panel__header"><div className="auth-loading-mark"><ShieldCheck aria-hidden="true" size={22} /></div><div><p>Invitación de organización</p><h1 id="invitation-title">Bienvenido a FleetMaster II</h1></div></div>
    <p className="invitation-panel__intro">Has sido invitado a <strong>{invitation.organizationName}</strong> como {roleLabels[invitation.role]}.</p>
    <form className="login-form" onSubmit={submit}>
      <label className="invitation-field"><span>Nombre completo</span><input autoComplete="name" maxLength={160} onChange={(event) => setFullName(event.target.value)} required value={fullName} /></label>
      <label className="invitation-field"><span>Correo de la cuenta</span><input className="invitation-email" readOnly value={user?.email ?? ""} /></label>
      {isNewUser ? <>
        <label className="invitation-field"><span>Nueva contraseña</span><input autoComplete="new-password" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
        <label className="invitation-field"><span>Confirmar contraseña</span><input autoComplete="new-password" minLength={8} onChange={(event) => setPasswordConfirmation(event.target.value)} required type="password" value={passwordConfirmation} /></label>
      </> : null}
      <p className="invitation-expiry">Esta invitación vence el {new Date(invitation.expiresAt).toLocaleString("es-MX")}.</p>
      {error ? <p className="invitation-error" role="alert">{error}</p> : null}
      <button className="button button--primary" disabled={isSubmitting} type="submit"><CheckCircle2 aria-hidden="true" size={18} />{isSubmitting ? (isNewUser ? "Activando..." : "Aceptando...") : (isNewUser ? "Activar cuenta" : "Aceptar invitación")}</button>
    </form>
    <button className="button button--secondary" onClick={() => void signOut()} type="button"><LogOut aria-hidden="true" size={17} />Cerrar sesión</button>
  </section></main>
}
