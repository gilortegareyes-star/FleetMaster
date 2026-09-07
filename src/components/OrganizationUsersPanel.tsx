import { useEffect, useState, type FormEvent } from "react"
import { Ban, Clock3, Copy, Mail, Plus, RefreshCw, UserPlus, UserRound, UserX, Users } from "lucide-react"
import { createOrganizationClientInvitation, disableOrganizationMembership, listOrganizationUsers, revokeOrganizationInvitation, sendManagerInvitation } from "../services/organizations"
import type { OrganizationSummary, OrganizationUserRecord } from "../types/organization"

const formatDate = (value: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(value))

type OrganizationUsersPanelProps = {
  organization: OrganizationSummary
  isSaving: boolean
  onFeedback: (message: string) => void
  onRefreshOrganizations: () => Promise<void>
  onSavingChange: (value: boolean) => void
  mode: "admin" | "manager"
}

export function OrganizationUsersPanel({ organization, isSaving, onFeedback, onRefreshOrganizations, onSavingChange, mode }: OrganizationUsersPanelProps) {
  const [users, setUsers] = useState<OrganizationUserRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [copiedInvitationId, setCopiedInvitationId] = useState<string | null>(null)

  const loadUsers = async () => {
    setIsLoading(true)
    setError(null)
    try { setUsers(await listOrganizationUsers(organization.id)) }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los usuarios.") }
    finally { setIsLoading(false) }
  }

  useEffect(() => { void loadUsers() }, [organization.id])

  const activeManager = users.find((item) => item.recordType === "membership" && item.role === "manager" && item.status === "active")
  const pendingManagerInvitation = users.find((item) => item.recordType === "invitation" && item.role === "manager" && item.status === "pending")
  const manager = activeManager ?? pendingManagerInvitation
  const otherUsers = users.filter((item) => item.role !== "manager")
  const isAtLimit = organization.seatsUsed >= organization.seatLimit
  const actionsDisabled = isSaving || organization.status !== "active" || isAtLimit

  const handleRevoke = async (item: OrganizationUserRecord) => {
    if (!window.confirm(`¿Revocar la invitación para ${item.email}?\n\nLa plaza reservada quedará disponible nuevamente.`)) return
    onSavingChange(true)
    try { await revokeOrganizationInvitation(item.id); await Promise.all([loadUsers(), onRefreshOrganizations()]); onFeedback("Invitación revocada. La plaza está disponible nuevamente.") }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "No se pudo revocar la invitación.") }
    finally { onSavingChange(false) }
  }

  const handleDisable = async (item: OrganizationUserRecord) => {
    if (!window.confirm(`¿Desactivar a ${item.displayName || item.email}?`)) return
    onSavingChange(true)
    try { await disableOrganizationMembership(item.id); await Promise.all([loadUsers(), onRefreshOrganizations()]); onFeedback("Usuario desactivado.") }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "No se pudo desactivar el usuario.") }
    finally { onSavingChange(false) }
  }

  const submitInvitation = async (name: string, email: string) => {
    onSavingChange(true)
    try { if (mode === "admin") await sendManagerInvitation({ organizationId: organization.id, name, email }); else { const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); await createOrganizationClientInvitation(organization.id, name, email, expiresAt) }; setIsInviteOpen(false); await Promise.all([loadUsers(), onRefreshOrganizations()]); onFeedback(mode === "admin" ? "Invitación enviada correctamente. Se reservó una plaza para el usuario." : "Invitación registrada correctamente. Se reservó una plaza para el usuario.") }
    finally { onSavingChange(false) }
  }

  const copyInvitationLink = async (item: OrganizationUserRecord) => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/?invitation=${encodeURIComponent(item.id)}`); setCopiedInvitationId(item.id); window.setTimeout(() => setCopiedInvitationId((current) => current === item.id ? null : current), 2200) }
    catch { setError("No se pudo copiar la liga. Intenta nuevamente.") }
  }

  return <section className="organization-users">
    {mode === "admin" ? <header className="users-panel-header"><div><p>Usuarios</p><h2>Personas de la empresa</h2><span>Las invitaciones registradas reservan una plaza.</span></div><div className="users-seat-count"><strong>{organization.seatsUsed} de {organization.seatLimit}</strong><span>{organization.seatsAvailable} disponibles</span></div></header> : null}
    {organization.status !== "active" ? <div className="users-notice"><Ban aria-hidden="true" size={17} /> La empresa está suspendida. No se pueden registrar invitaciones.</div> : null}
    {isAtLimit ? <div className="users-notice users-notice--limit"><Users aria-hidden="true" size={17} /> Se alcanzó el límite de plazas.</div> : null}
    {mode === "admin" ? <section className="users-section"><header><div><p>Responsable de la empresa</p><h3>Manager principal</h3></div><div className="users-section__actions"><button className="button button--primary" disabled={actionsDisabled || Boolean(manager)} onClick={() => setIsInviteOpen(true)} type="button"><UserPlus aria-hidden="true" size={17} /> Asignar Manager</button></div></header>{isLoading ? <div className="users-empty">Cargando usuarios...</div> : manager ? <UserRecord item={manager} onDisable={manager.recordType === "membership" && manager.status === "active" ? () => void handleDisable(manager) : undefined} onRevoke={manager.recordType === "invitation" && manager.status === "pending" ? () => void handleRevoke(manager) : undefined} /> : <div className="users-empty"><UserRound aria-hidden="true" size={25} /><strong>Aún no se ha asignado un responsable.</strong><span>Registra una invitación para el Manager principal.</span></div>}</section> : null}
    <section className="users-section"><header><div><p>Usuarios de la empresa</p><h3>Clientes y colaboradores</h3></div><div className="users-section__actions"><span className="users-section__count">{otherUsers.length} registros</span><button className="button button--secondary users-add-button" disabled={actionsDisabled} onClick={() => { setError(null); setIsInviteOpen(true) }} type="button"><Plus aria-hidden="true" size={16} /> Agregar usuario</button></div></header>{isLoading ? <div className="users-empty">Cargando usuarios...</div> : otherUsers.length === 0 ? <div className="users-empty users-empty--invite"><Users aria-hidden="true" size={25} /><strong>Agrega usuarios a tu empresa</strong><span>Invita colaboradores para que puedan acceder a FleetMaster.</span><button className="button button--primary" disabled={actionsDisabled} onClick={() => { setError(null); setIsInviteOpen(true) }} type="button"><Plus aria-hidden="true" size={18} /> Agregar usuario</button></div> : <div className="user-record-list">{otherUsers.map((item) => <UserRecord item={item} key={`${item.recordType}-${item.id}`} onCopyLink={item.recordType === "invitation" && item.status === "pending" ? () => void copyInvitationLink(item) : undefined} copyFeedback={copiedInvitationId === item.id ? "Liga copiada" : undefined} onDisable={mode === "admin" && item.recordType === "membership" && item.status === "active" ? () => void handleDisable(item) : undefined} onRevoke={mode === "admin" && item.recordType === "invitation" && item.status === "pending" ? () => void handleRevoke(item) : undefined} />)}</div>}</section>
    {isInviteOpen ? <InvitationForm isManager={mode === "admin"} isSaving={isSaving} onClose={() => setIsInviteOpen(false)} onSubmit={submitInvitation} /> : null}
    {error ? <p className="organization-form-error" role="alert">{error}</p> : null}
    <button className="users-refresh" disabled={isLoading} onClick={() => void loadUsers()} type="button"><RefreshCw aria-hidden="true" size={16} /> Actualizar lista</button>
  </section>
}

function UserRecord({ item, onCopyLink, copyFeedback, onDisable, onRevoke }: { item: OrganizationUserRecord; onCopyLink?: () => void; copyFeedback?: string; onDisable?: () => void; onRevoke?: () => void }) { const isInvitation = item.recordType === "invitation"; return <article className="user-record"><span className="user-record__icon">{isInvitation ? <Clock3 aria-hidden="true" size={19} /> : <UserRound aria-hidden="true" size={19} />}</span><div className="user-record__identity"><strong>{item.displayName || "Sin nombre registrado"}</strong><span><Mail aria-hidden="true" size={14} /> {item.email}</span></div><span className="user-record__role">{item.role === "manager" ? "Manager" : item.role === "admin" ? "Administrador" : "Usuario"}</span><span className={`user-record__status user-record__status--${isInvitation ? "pending" : item.status}`}>{isInvitation ? "Invitación pendiente" : item.status === "active" ? "Activo" : "Desactivado"}</span><small>{isInvitation ? `Registrada: ${formatDate(item.createdAt)}${item.expiresAt ? ` · Expira: ${formatDate(item.expiresAt)}` : ""}` : `Alta: ${formatDate(item.createdAt)}`}</small>{onCopyLink || onRevoke || onDisable ? <div className="user-record__actions">{onCopyLink ? <button className="button button--secondary user-record__copy" onClick={onCopyLink} type="button"><Copy aria-hidden="true" size={15} />{copyFeedback ?? "Copiar liga"}</button> : null}{onRevoke ? <button className="icon-button user-record__action" aria-label="Revocar invitación" onClick={onRevoke} type="button"><UserX aria-hidden="true" size={17} /></button> : onDisable ? <button className="icon-button user-record__action" aria-label="Desactivar usuario" onClick={onDisable} type="button"><Ban aria-hidden="true" size={17} /></button> : null}</div> : null}</article> }

function InvitationForm({ isManager, isSaving, onClose, onSubmit }: { isManager: boolean; isSaving: boolean; onClose: () => void; onSubmit: (name: string, email: string) => Promise<void> }) { const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [error, setError] = useState<string | null>(null); const handleSubmit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setError(null); try { await onSubmit(name.trim(), email.trim()) } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "No se pudo registrar la invitación.") } }; return <div className="modal-backdrop"><section aria-modal="true" className="organization-form-panel" role="dialog"><header><div><p>{isManager ? "Responsable principal" : "Nuevo usuario"}</p><h2>{isManager ? "Asignar Manager" : "Agregar usuario"}</h2></div><button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">×</button></header><form onSubmit={handleSubmit}><label className="field"><span>{isManager ? "Nombre" : "Nombre completo"}</span><input autoFocus onChange={(event) => setName(event.target.value)} required value={name} /></label><label className="field"><span>Correo electrónico</span><input onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label><p className="form-helper">{isManager ? "Se enviará una invitación por correo electrónico y se reservará una plaza para este usuario." : "Se registrará una invitación y se reservará una plaza para este usuario."}</p>{error ? <p className="organization-form-error" role="alert">{error}</p> : null}<footer><button className="button button--secondary" onClick={onClose} type="button">Cancelar</button><button className="button button--primary" disabled={isSaving} type="submit"><UserPlus aria-hidden="true" size={17} /> {isSaving ? (isManager ? "Enviando..." : "Registrando...") : isManager ? "Enviar invitación" : "Agregar usuario"}</button></footer></form></section></div> }
