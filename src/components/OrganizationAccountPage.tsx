import { CalendarDays, Gauge, Info, LogOut, Mail, RefreshCw, ShieldCheck, Truck, UserPlus, UserRound, UsersRound } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { createOrganizationClientInvitation, listOrganizationUsers } from "../services/organizations"
import type { OrganizationAccess, OrganizationUserRecord } from "../types/organization"
import { useAuth } from "../contexts/AuthContext"
import { FeedbackPanel } from "./FeedbackPanel"

const roleLabels = { admin: "Administrador", manager: "Manager", client: "Cliente" } as const

const formatDate = (value: string) => new Date(value).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })

const getInitials = (displayName: string | null, email: string) => {
  const source = displayName?.trim() || email
  const parts = source.split(/\s+/).filter(Boolean)
  return parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : source.slice(0, 2).toUpperCase()
}

const getUserStatus = (item: OrganizationUserRecord) => {
  if (item.recordType === "invitation") return { label: "Invitación pendiente", className: "user-status--pending" }
  if (item.status === "active") return { label: "Activo", className: "user-status--active" }
  return { label: "Deshabilitado", className: "user-status--disabled" }
}

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

  const usagePercent = access.seatLimit > 0 ? Math.min(100, (access.seatsUsed / access.seatLimit) * 100) : 0
  const isActive = access.status === "active"

  return <main className="organization-account-shell">
    <section className="organization-account-panel" aria-labelledby="organization-account-title">
      <header className="organization-account-topbar">
        <div className="organization-account-brand"><span className="organization-account-brand__mark">FM</span><div><strong>FleetMaster II</strong><span>Cuenta de organización</span></div></div>
        <button className="button button--secondary" onClick={() => void signOut()} type="button"><LogOut aria-hidden="true" size={17} />Cerrar sesión</button>
      </header>

      <article className="organization-account-hero">
        <div className="organization-account-hero__copy">
          <p className="organization-account-kicker">Organización</p>
          <h1 id="organization-account-title">{access.organizationName}</h1>
          <span className={`organization-account-status ${isActive ? "" : "organization-account-status--suspended"}`}><ShieldCheck aria-hidden="true" size={15} />{isActive ? "Cuenta activa" : "Cuenta suspendida"}</span>
          <p>Gestiona los usuarios de tu empresa y controla el acceso al sistema.</p>
        </div>
        <div className="organization-account-hero__visual" aria-hidden="true">
          <div className="organization-account-hero__message"><strong>Vehículos en movimiento.<br />Negocios más fuertes.</strong><span>Control · Eficiencia · Resultados</span></div>
          <div className="organization-account-fleet"><Truck size={72} strokeWidth={1.35} /><Truck size={46} strokeWidth={1.35} /><Truck size={34} strokeWidth={1.35} /></div>
          <span className="organization-account-road organization-account-road--one" /><span className="organization-account-road organization-account-road--two" />
        </div>
      </article>

      <section className="organization-account-metrics" aria-labelledby="organization-account-summary-title">
        <div className="organization-account-subheading"><p className="organization-account-kicker">Resumen ejecutivo</p><h2 id="organization-account-summary-title">Estado de tu cuenta</h2></div>
        <div className="organization-account-metrics__grid">
          <article className="organization-account-metric"><span className="organization-account-metric__icon"><UsersRound aria-hidden="true" size={18} /></span><div><span>Usuarios</span><strong>{access.seatsUsed} / {access.seatLimit}</strong><small>{access.seatsAvailable} {access.seatsAvailable === 1 ? "lugar disponible" : "lugares disponibles"}</small><span className="organization-account-progress" aria-label={`${access.seatsUsed} de ${access.seatLimit} usuarios utilizados`}><span style={{ width: `${usagePercent}%` }} /></span></div></article>
          <article className="organization-account-metric"><span className="organization-account-metric__icon"><UserRound aria-hidden="true" size={18} /></span><div><span>Tu rol</span><strong>{roleLabels[access.role]}</strong><small>Acceso de administración</small></div></article>
          <article className="organization-account-metric"><span className="organization-account-metric__icon"><CalendarDays aria-hidden="true" size={18} /></span><div><span>Fecha de alta</span><strong>{formatDate(access.membershipCreatedAt)}</strong><small>Miembro activo</small></div></article>
          <article className="organization-account-metric"><span className="organization-account-metric__icon"><Gauge aria-hidden="true" size={18} /></span><div><span>Estado</span><strong>{isActive ? "Activa" : "Suspendida"}</strong><small>{isActive ? "Sin restricciones" : "Acceso restringido"}</small></div></article>
        </div>
      </section>

      {access.role === "manager" ? <>
        <section className="organization-account-card" aria-labelledby="organization-account-users-title">
          <header className="organization-account-section-heading"><div className="organization-account-section-heading__title"><span className="organization-account-section-icon"><UsersRound aria-hidden="true" size={19} /></span><div><h2 id="organization-account-users-title">Usuarios de la empresa</h2><p>Personas con acceso a {access.organizationName}.</p></div></div><div className="organization-account-section-heading__actions"><strong>{users.length} {users.length === 1 ? "usuario" : "usuarios"}</strong><button className="button button--secondary" onClick={() => void refreshUsers()} title="Actualizar usuarios" type="button"><RefreshCw aria-hidden="true" size={16} />Actualizar</button></div></header>
          <div className="organization-account-user-table" role="table" aria-label="Usuarios de la empresa">
            <div className="organization-account-user-table__header" role="row"><span>Nombre</span><span>Rol</span><span>Estado</span><span>Fecha de alta</span></div>
            <div className="organization-account-users" role="rowgroup">{loadingUsers ? <p className="organization-account-empty">Consultando usuarios...</p> : users.length === 0 ? <p className="organization-account-empty">No hay usuarios activos ni invitaciones pendientes.</p> : users.map((item) => { const status = getUserStatus(item); return <article className="organization-account-user" key={`${item.recordType}-${item.id}`} role="row"><div className="organization-account-user__identity"><span className="organization-account-user__avatar" aria-hidden="true">{getInitials(item.displayName, item.email)}</span><div><strong>{item.displayName || "Sin nombre registrado"}</strong><span>{item.email}</span></div></div><span className="organization-account-user__role" role="cell">{roleLabels[item.role]}</span><span className={`user-status ${status.className}`} role="cell"><span className="user-status__dot" aria-hidden="true" />{status.label}</span><small role="cell">{item.recordType === "invitation" && item.expiresAt ? `Expira: ${formatDate(item.expiresAt)}` : `Alta: ${formatDate(item.createdAt)}`}</small></article> })}</div>
          </div>
        </section>

        <section className="organization-account-card organization-account-invite-card" aria-labelledby="organization-account-invite-title">
          <header className="organization-account-section-heading"><div className="organization-account-section-heading__title"><span className="organization-account-section-icon"><UserPlus aria-hidden="true" size={19} /></span><div><h2 id="organization-account-invite-title">Invitar usuario</h2><p>Envía una invitación a un nuevo miembro de tu empresa.</p></div></div></header>
          <form className="organization-account-invite" onSubmit={inviteClient}><div className="organization-account-invite__fields"><label className="invitation-field"><span>Nombre completo</span><input autoComplete="name" onChange={(event) => setName(event.target.value)} placeholder="Ej. Juan Pérez" required value={name} /></label><label className="invitation-field"><span>Correo electrónico</span><div className="login-field__control"><Mail aria-hidden="true" size={18} /><input autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="usuario@empresa.com" required type="email" value={email} /></div></label></div>{error ? <p className="invitation-error" role="alert">{error}</p> : null}{feedback ? <p className="invitation-success" role="status">{feedback}</p> : null}<div className="organization-account-invite__notice"><Info aria-hidden="true" size={17} /><span>El usuario recibirá un correo con instrucciones para activar su cuenta y unirse a {access.organizationName}.</span></div><div className="organization-account-invite__footer"><span className="organization-account-invite__hint">La invitación será válida durante 7 días.</span><button className="button button--primary" disabled={sending} type="submit"><UserPlus aria-hidden="true" size={17} />{sending ? "Registrando..." : "Invitar usuario"}</button></div></form>
        </section>
      </> : <div className="organization-account-users organization-account-users--client"><UsersRound aria-hidden="true" size={20} /><p>Tu cuenta tiene acceso a la organización. La administración de usuarios corresponde al Manager.</p></div>}
      <FeedbackPanel />
    </section>
  </main>
}
