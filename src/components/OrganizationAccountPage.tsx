import { BarChart3, CalendarDays, FileText, Headphones, Info, LogOut, Mail, Send, ShieldCheck, Truck, UserPlus, UserRound, UsersRound, Wrench, X } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { useAuth } from "../contexts/AuthContext"
import { createFeedbackTicket } from "../services/feedback"
import { createOrganizationClientInvitation, listOrganizationUsers } from "../services/organizations"
import type { FeedbackCategory, FeedbackUnreadTicket } from "../types/feedback"
import type { OrganizationAccess, OrganizationUserRecord } from "../types/organization"
import heroImage from "../assets/account-activation-hero.jpg"

const roleLabels = { admin: "Administrador", manager: "Manager", client: "Usuario" } as const
const contactCategories: { value: FeedbackCategory; label: string }[] = [
  { value: "support", label: "Activación de cuenta" },
  { value: "problem", label: "Problema de acceso" },
  { value: "improvement", label: "Pregunta" },
]

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

type OrganizationAccountPageProps = { access: OrganizationAccess; onRefreshUnread: () => Promise<void>; unreadTickets: FeedbackUnreadTicket[] }

export function OrganizationAccountPage({ access }: OrganizationAccountPageProps) {
  const { signOut } = useAuth()
  const [users, setUsers] = useState<OrganizationUserRecord[]>([])
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingUsers, setLoadingUsers] = useState(access.role === "manager")
  const [sending, setSending] = useState(false)
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [contactCategory, setContactCategory] = useState<FeedbackCategory>("support")
  const [contactTitle, setContactTitle] = useState("")
  const [contactMessage, setContactMessage] = useState("")
  const [contactFeedback, setContactFeedback] = useState<string | null>(null)
  const [contactError, setContactError] = useState<string | null>(null)
  const [contactSending, setContactSending] = useState(false)

  const refreshUsers = async () => {
    if (access.role !== "manager") return
    setLoadingUsers(true)
    try { setUsers(await listOrganizationUsers(access.organizationId)) } catch { setError("No se pudo cargar la lista de usuarios.") } finally { setLoadingUsers(false) }
  }

  useEffect(() => { void refreshUsers() }, [access.organizationId, access.role])

  const inviteClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(null); setFeedback(null); setSending(true)
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      await createOrganizationClientInvitation(access.organizationId, name.trim(), email.trim(), expiresAt)
      setName(""); setEmail(""); setFeedback("La invitación quedó registrada. La entrega por correo se habilitará posteriormente."); setIsInviteModalOpen(false); await refreshUsers()
    } catch { setError("No se pudo registrar la invitación.") } finally { setSending(false) }
  }

  const submitContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setContactError(null); setContactFeedback(null); setContactSending(true)
    try {
      await createFeedbackTicket(contactTitle.trim(), contactCategory, contactMessage.trim())
      setContactTitle(""); setContactMessage(""); setContactFeedback("Recibimos tu solicitud. El equipo FleetMaster le dará seguimiento.")
    } catch { setContactError("No se pudo enviar el mensaje. Inténtalo nuevamente.") } finally { setContactSending(false) }
  }

  const usagePercent = access.seatLimit > 0 ? Math.min(100, (access.seatsUsed / access.seatLimit) * 100) : 0
  const isActive = access.status === "active"

  return <main className="organization-account-shell organization-account-shell--blocked">
    <section className="organization-account-panel organization-account-panel--executive" aria-labelledby="organization-account-title">
      <header className="organization-account-topbar organization-account-topbar--executive"><div className="organization-account-brand"><span className="organization-account-brand__mark">FM</span><div><strong>FleetMaster II</strong><span>Control de flotas, sin complicaciones.</span></div></div><div className="organization-account-userbar"><span className="organization-account-userbar__avatar" aria-hidden="true">{getInitials(access.displayName, access.email)}</span><span className="organization-account-userbar__name">{access.displayName || access.email}</span><button className="button button--secondary" onClick={() => void signOut()} type="button"><LogOut aria-hidden="true" size={16} />Cerrar sesión</button></div></header>

      <article className="organization-account-hero organization-account-hero--executive"><div className="organization-account-hero__copy"><p className="organization-account-kicker">Tu cuenta está lista</p><h1 id="organization-account-title">Solo falta un paso <span>para comenzar</span></h1><p>Tu organización ha sido configurada correctamente. El acceso a las funciones operativas de FleetMaster se encuentra pendiente de habilitación por parte del equipo de FleetMaster.</p><div className="organization-account-lock-status"><ShieldCheck aria-hidden="true" size={18} /><div><span>Acceso al sistema</span><strong>Bloqueado</strong><small>Te notificaremos por correo cuando tu cuenta sea activada.</small></div></div></div><div className="organization-account-hero__image"><img src={heroImage} alt="Centro de monitoreo tecnológico" /><div><span>TECNOLOGÍA QUE IMPULSA</span><strong>la operación de tu flota.</strong></div></div></article>

      <section className="organization-account-metrics organization-account-metrics--executive" aria-labelledby="organization-account-summary-title"><div className="organization-account-subheading"><p className="organization-account-kicker">Resumen de cuenta</p><h2 id="organization-account-summary-title">Tu organización, en contexto</h2></div><div className="organization-account-metrics__grid"><article className="organization-account-metric"><span className="organization-account-metric__icon"><UsersRound aria-hidden="true" size={18} /></span><div><span>Organización</span><strong>{access.organizationName}</strong><small>Cuenta activa</small></div></article><article className="organization-account-metric"><span className="organization-account-metric__icon"><UserRound aria-hidden="true" size={18} /></span><div><span>Usuarios</span><strong>{access.seatsUsed} / {access.seatLimit}</strong><small>Usuarios registrados</small><span className="organization-account-progress" aria-label={`${access.seatsUsed} de ${access.seatLimit} usuarios utilizados`}><span style={{ width: `${usagePercent}%` }} /></span></div></article><article className="organization-account-metric"><span className="organization-account-metric__icon"><ShieldCheck aria-hidden="true" size={18} /></span><div><span>Tu rol</span><strong>{roleLabels[access.role]}</strong><small>Acceso de administración</small></div></article><article className="organization-account-metric"><span className="organization-account-metric__icon"><CalendarDays aria-hidden="true" size={18} /></span><div><span>Fecha de alta</span><strong>{formatDate(access.membershipCreatedAt)}</strong><small>Miembro activo</small></div></article></div></section>

      <section className="organization-account-capabilities" aria-labelledby="organization-account-capabilities-title"><div className="organization-account-section-intro"><p className="organization-account-kicker">Cuando tu acceso esté habilitado</p><h2 id="organization-account-capabilities-title">¿Qué podrás hacer?</h2><p>Todo lo necesario para mantener tu operación bajo control.</p></div><div className="organization-account-capabilities__grid"><article><Truck aria-hidden="true" size={21} /><div><strong>Gestionar tu flota</strong><span>Registra y administra tus vehículos.</span></div></article><article><Wrench aria-hidden="true" size={21} /><div><strong>Control de mantenimientos</strong><span>Programa, da seguimiento y genera reportes.</span></div></article><article><FileText aria-hidden="true" size={21} /><div><strong>Documentación</strong><span>Centraliza pólizas, tarjetas y verificaciones.</span></div></article><article><BarChart3 aria-hidden="true" size={21} /><div><strong>Reportes</strong><span>Información clara para mejores decisiones.</span></div></article></div></section>

      {access.role === "manager" ? <section className="organization-account-card organization-account-users-card" aria-labelledby="organization-account-users-title"><header className="organization-account-section-heading"><div className="organization-account-section-heading__title"><span className="organization-account-section-icon"><UsersRound aria-hidden="true" size={19} /></span><div><h2 id="organization-account-users-title">Usuarios de la empresa</h2><p>Personas con acceso a {access.organizationName}.</p></div></div><div className="organization-account-section-heading__actions"><strong>{users.length} {users.length === 1 ? "usuario" : "usuarios"}</strong><button className="button button--primary" onClick={() => { setError(null); setFeedback(null); setIsInviteModalOpen(true) }} title="Invitar usuario" type="button"><UserPlus aria-hidden="true" size={16} />Invitar usuario</button></div></header><div className="organization-account-user-table" role="table" aria-label="Usuarios de la empresa"><div className="organization-account-user-table__header" role="row"><span>Nombre</span><span>Rol</span><span>Estado</span><span>Fecha de alta</span></div><div className="organization-account-users" role="rowgroup">{loadingUsers ? <p className="organization-account-empty">Consultando usuarios...</p> : users.length === 0 ? <p className="organization-account-empty">No hay usuarios activos ni invitaciones pendientes.</p> : users.map((item) => { const status = getUserStatus(item); return <article className="organization-account-user" key={`${item.recordType}-${item.id}`} role="row"><div className="organization-account-user__identity"><span className="organization-account-user__avatar" aria-hidden="true">{getInitials(item.displayName, item.email)}</span><div><strong>{item.displayName || "Sin nombre registrado"}</strong><span>{item.email}</span></div></div><span className="organization-account-user__role" role="cell">{roleLabels[item.role]}</span><span className={`user-status ${status.className}`} role="cell"><span className="user-status__dot" aria-hidden="true" />{status.label}</span><small role="cell">{item.recordType === "invitation" && item.expiresAt ? `Expira: ${formatDate(item.expiresAt)}` : `Alta: ${formatDate(item.createdAt)}`}</small></article> })}</div></div></section> : <div className="organization-account-users organization-account-users--client"><UsersRound aria-hidden="true" size={20} /><p>Tu cuenta tiene acceso a la organización. La administración de usuarios corresponde al Manager.</p></div>}

      <section className="organization-account-contact" aria-labelledby="organization-account-contact-title"><div className="organization-account-contact__intro"><span className="organization-account-contact__icon"><Headphones aria-hidden="true" size={22} /></span><p className="organization-account-kicker">Estamos para ayudarte</p><h2 id="organization-account-contact-title">¿Necesitas ayuda con la activación?</h2><p>Si tienes alguna duda o necesitas información sobre la habilitación de tu cuenta, escríbenos. Nuestro equipo te ayudará.</p></div><form className="organization-account-contact__form" onSubmit={submitContact}><label className="invitation-field"><span>Motivo de tu consulta</span><select onChange={(event) => setContactCategory(event.target.value as FeedbackCategory)} value={contactCategory}>{contactCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label><label className="invitation-field"><span>Asunto</span><input onChange={(event) => setContactTitle(event.target.value)} placeholder="¿En qué podemos ayudarte?" required value={contactTitle} /></label><label className="invitation-field"><span>Mensaje</span><textarea maxLength={500} onChange={(event) => setContactMessage(event.target.value)} placeholder="Cuéntanos cómo podemos ayudarte" required rows={4} value={contactMessage} /><small>{contactMessage.length}/500</small></label>{contactError ? <p className="invitation-error" role="alert">{contactError}</p> : null}{contactFeedback ? <p className="invitation-success" role="status">{contactFeedback}</p> : null}<button className="button button--primary" disabled={contactSending} type="submit"><Send aria-hidden="true" size={16} />{contactSending ? "Enviando..." : "Enviar mensaje"}</button></form></section>

      <footer className="organization-account-footer"><div><strong>FleetMaster II</strong><span>Control de flotas, sin complicaciones.</span></div><span>© 2026 FleetMaster II.</span></footer>
    </section>

    {isInviteModalOpen ? <div className="organization-account-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsInviteModalOpen(false) }}><section aria-labelledby="organization-account-invite-title" aria-modal="true" className="organization-account-modal" role="dialog"><header><div><p className="organization-account-kicker">Nuevo usuario</p><h2 id="organization-account-invite-title">Invitar usuario</h2><p>Envía una invitación a un nuevo miembro de tu empresa.</p></div><button aria-label="Cerrar invitación" className="organization-account-modal__close" onClick={() => setIsInviteModalOpen(false)} type="button"><X aria-hidden="true" size={19} /></button></header><form className="organization-account-invite" onSubmit={inviteClient}><div className="organization-account-invite__fields"><label className="invitation-field"><span>Nombre completo</span><input autoComplete="name" onChange={(event) => setName(event.target.value)} placeholder="Ej. Juan Pérez" required value={name} /></label><label className="invitation-field"><span>Correo electrónico</span><div className="login-field__control"><Mail aria-hidden="true" size={18} /><input autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="usuario@empresa.com" required type="email" value={email} /></div></label></div>{error ? <p className="invitation-error" role="alert">{error}</p> : null}<div className="organization-account-invite__notice"><Info aria-hidden="true" size={17} /><span>El usuario recibirá un correo con instrucciones para activar su cuenta y unirse a {access.organizationName}.</span></div><div className="organization-account-invite__footer"><span className="organization-account-invite__hint">La invitación será válida durante 7 días.</span><button className="button button--primary" disabled={sending} type="submit"><UserPlus aria-hidden="true" size={17} />{sending ? "Registrando..." : "Enviar invitación"}</button></div></form></section></div> : null}
  </main>
}
