import { LogOut, Mail, RefreshCw, UserPlus, Users } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { createOrganizationClientInvitation, listOrganizationUsers } from "../services/organizations"
import type { OrganizationAccess, OrganizationUserRecord } from "../types/organization"
import { useAuth } from "../contexts/AuthContext"

const roleLabels = { admin: "Administrador", manager: "Manager", client: "Cliente" } as const

export function OrganizationAccountPage({ access }: { access: OrganizationAccess }) {
  const { signOut } = useAuth()
  const [users, setUsers] = useState<OrganizationUserRecord[]>([])
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingUsers, setLoadingUsers] = useState(access.role === "manager")
  const [sending, setSending] = useState(false)

  const refreshUsers = async () => {
    if (access.role !== "manager") return
    setLoadingUsers(true)
    try { setUsers(await listOrganizationUsers(access.organizationId)) } catch { setError("No se pudo cargar la lista de usuarios.") } finally { setLoadingUsers(false) }
  }
  useEffect(() => { void refreshUsers() }, [access.organizationId, access.role])

  const inviteClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null); setFeedback(null); setSending(true)
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      await createOrganizationClientInvitation(access.organizationId, name.trim(), email.trim(), expiresAt)
      setName(""); setEmail(""); setFeedback("La invitación quedó registrada. La entrega por correo se habilitará posteriormente."); await refreshUsers()
    } catch { setError("No se pudo registrar la invitación.") } finally { setSending(false) }
  }

  return <main className="organization-account-shell"><section className="organization-account-panel" aria-labelledby="organization-account-title">
    <header className="organization-account-header"><div><p className="organization-account-kicker">FleetMaster II · Cuenta</p><h1 id="organization-account-title">{access.organizationName}</h1><span className="organization-account-status">Cuenta activa</span></div><button className="button button--secondary" onClick={() => void signOut()} type="button"><LogOut aria-hidden="true" size={17} />Cerrar sesión</button></header>
    <div className="organization-account-summary"><div><span>Nombre</span><strong>{access.displayName || "Sin nombre registrado"}</strong></div><div><span>Correo</span><strong>{access.email}</strong></div><div><span>Rol</span><strong>{roleLabels[access.role]}</strong></div><div className="organization-account-seat"><span>Usuarios</span><strong>{access.seatsUsed} / {access.seatLimit}</strong><small>{access.seatsAvailable} lugares disponibles</small></div></div>
    {access.role === "manager" ? <>
      <div className="organization-account-section-heading"><div><p className="organization-account-kicker">Administración</p><h2>Usuarios de la empresa</h2></div><button className="icon-button" onClick={() => void refreshUsers()} title="Actualizar usuarios" type="button"><RefreshCw aria-hidden="true" size={17} /></button></div>
      <div className="organization-account-users">{loadingUsers ? <p>Consultando usuarios...</p> : users.length === 0 ? <p>No hay usuarios activos ni invitaciones pendientes.</p> : users.map((item) => <article className="organization-account-user" key={`${item.recordType}-${item.id}`}><div className="organization-account-user__identity"><strong>{item.displayName || "Sin nombre registrado"}</strong><span>{item.email}</span></div><span>{roleLabels[item.role]}</span><span className={item.recordType === "invitation" ? "user-status user-status--pending" : "user-status user-status--active"}>{item.recordType === "invitation" ? "Invitación pendiente" : "Activo"}</span><small>{item.recordType === "invitation" && item.expiresAt ? `Expira: ${new Date(item.expiresAt).toLocaleDateString("es-MX")}` : `Alta: ${new Date(item.createdAt).toLocaleDateString("es-MX")}`}</small></article>)}</div>
      <form className="organization-account-invite" onSubmit={inviteClient}><div><p className="organization-account-kicker">Nueva invitación</p><h2>Invitar cliente</h2></div><label className="invitation-field"><span>Nombre</span><input autoComplete="name" onChange={(event) => setName(event.target.value)} required value={name} /></label><label className="invitation-field"><span>Correo electrónico</span><div className="login-field__control"><Mail aria-hidden="true" size={18} /><input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></div></label>{error ? <p className="invitation-error" role="alert">{error}</p> : null}{feedback ? <p className="invitation-success" role="status">{feedback}</p> : null}<button className="button button--primary" disabled={sending} type="submit"><UserPlus aria-hidden="true" size={17} />{sending ? "Registrando..." : "Invitar cliente"}</button></form>
    </> : <div className="organization-account-users organization-account-users--client"><Users aria-hidden="true" size={20} /><p>Tu cuenta tiene acceso a la organización. La administración de usuarios corresponde al Manager.</p></div>}
  </section></main>
}
