import { useEffect, useState, type FormEvent } from "react"
import { ArrowLeft, Ban, Building2, CalendarDays, CheckCircle2, ChevronRight, Clock3, Edit3, Info, LockKeyhole, Mail, PauseCircle, PlayCircle, Plus, RefreshCw, Settings2, ShieldCheck, Trash2, UserPlus, UserRound, UserX, Users } from "lucide-react"
import { createOrganization, deleteOrganization, disableOrganizationMembership, listOrganizationUsers, listOrganizations, OrganizationDeletionError, revokeOrganizationInvitation, sendManagerInvitation, setOrganizationOperationalAccess, setOrganizationStatus, updateOrganization } from "../services/organizations"
import type { CreateOrganizationInput, OperationalAccessReasonCode, OrganizationStatus, OrganizationSummary, OrganizationUserRecord } from "../types/organization"
import { useOrganization } from "../contexts/OrganizationContext"
import { useAuth } from "../contexts/AuthContext"
import { FeedbackAdminPanel } from "./FeedbackAdminPanel"

type AdminTab = "summary" | "users" | "tickets"
const formatDate = (value: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(value))
const operationalAccessReasons: Array<{ value: OperationalAccessReasonCode; label: string }> = [
  { value: "manual", label: "Manual" },
  { value: "maintenance", label: "Mantenimiento" },
  { value: "administrative", label: "Administrativo" },
  { value: "security", label: "Seguridad" },
  { value: "payment", label: "Pago" },
  { value: "other", label: "Otro" },
]

export function AdminOrganizationsPage({ onFeedback, onEnterOrganization, onRefreshSupportUnread, supportUnreadOrganizations, supportUnreadTicketIds }: { onFeedback: (message: string) => void; onEnterOrganization: () => void; onRefreshSupportUnread: () => Promise<void>; supportUnreadOrganizations: Array<{ organizationId: string; unreadCount: number }>; supportUnreadTicketIds: string[] }) {
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([])
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<AdminTab>("summary")
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingOrganization, setEditingOrganization] = useState<OrganizationSummary | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isAccessFormOpen, setIsAccessFormOpen] = useState(false)
  const [accessReasonCode, setAccessReasonCode] = useState<OperationalAccessReasonCode>("manual")
  const [accessReasonNote, setAccessReasonNote] = useState("")
  const [accessError, setAccessError] = useState<string | null>(null)
  const [deletingOrganization, setDeletingOrganization] = useState<OrganizationSummary | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const [deleteError, setDeleteError] = useState<{ message: string; correlationId: string | null } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const { setActiveOrganization } = useOrganization()
  const { isFleetmasterAdmin } = useAuth()

  const loadOrganizations = async () => {
    setIsLoading(true); setLoadError(null)
    try {
      const items = await listOrganizations()
      setOrganizations(items)
      setSelectedOrganizationId((current) => current && items.some((item) => item.id === current) ? current : null)
    } catch (error) { setLoadError(error instanceof Error ? error.message : "No se pudieron cargar las empresas.") }
    finally { setIsLoading(false) }
  }
  useEffect(() => { void loadOrganizations() }, [])
  const selectedOrganization = organizations.find((item) => item.id === selectedOrganizationId) ?? null
  const openCreateForm = () => { setEditingOrganization(null); setIsFormOpen(true) }
  const openEditForm = () => { if (selectedOrganization) { setEditingOrganization(selectedOrganization); setIsFormOpen(true) } }
  const handleSave = async (input: CreateOrganizationInput) => {
    setIsSaving(true)
    try {
      const saved = editingOrganization ? await updateOrganization({ ...input, organizationId: editingOrganization.id }) : await createOrganization(input)
      setIsFormOpen(false); setSelectedOrganizationId(saved.id); await loadOrganizations()
      onFeedback(editingOrganization ? "Empresa actualizada correctamente." : "Empresa creada correctamente.")
    } catch (error) { throw error instanceof Error ? error : new Error("No se pudo guardar la empresa.") }
    finally { setIsSaving(false) }
  }
  const handleStatusChange = async () => {
    if (!selectedOrganization) return
    const nextStatus: OrganizationStatus = selectedOrganization.status === "active" ? "suspended" : "active"
    if (nextStatus === "suspended" && !window.confirm("La empresa conservará sus datos, pero quedará marcada como suspendida. ¿Deseas continuar?")) return
    setIsSaving(true)
    try { await setOrganizationStatus(selectedOrganization.id, nextStatus); await loadOrganizations(); onFeedback(nextStatus === "suspended" ? "Empresa suspendida." : "Empresa reactivada.") }
    catch (error) { setLoadError(error instanceof Error ? error.message : "No se pudo actualizar el estado de la empresa.") }
    finally { setIsSaving(false) }
  }

  const openAccessForm = () => {
    if (!selectedOrganization) return
    setAccessReasonCode(selectedOrganization.operationalAccessReasonCode ?? "manual")
    setAccessReasonNote(selectedOrganization.operationalAccessReasonNote ?? "")
    setAccessError(null)
    setIsAccessFormOpen(true)
  }

  const handleOperationalAccessChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedOrganization) return
    const enabled = !selectedOrganization.operationalAccessManuallyEnabled
    setIsSaving(true)
    setAccessError(null)
    try {
      await setOrganizationOperationalAccess({ organizationId: selectedOrganization.id, enabled, reasonCode: accessReasonCode, reasonNote: accessReasonNote.trim() || null })
      setIsAccessFormOpen(false)
      await loadOrganizations()
      onFeedback(enabled ? "Acceso operativo liberado." : "Acceso operativo bloqueado.")
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "No se pudo actualizar el acceso operativo.")
    } finally {
      setIsSaving(false)
    }
  }

  const openDeleteModal = (organization: OrganizationSummary) => {
    setDeletingOrganization(organization)
    setDeleteConfirmation("")
    setDeleteError(organization.status === "active" ? { message: "Esta empresa debe estar suspendida antes de poder eliminarla.", correlationId: null } : null)
  }

  const closeDeleteModal = () => {
    if (isDeleting) return
    setDeletingOrganization(null)
    setDeleteConfirmation("")
    setDeleteError(null)
  }

  const handleDeleteOrganization = async () => {
    if (!deletingOrganization || !isFleetmasterAdmin || isDeleting || deleteConfirmation !== deletingOrganization.name) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteOrganization(deletingOrganization.id)
      setDeletingOrganization(null)
      setDeleteConfirmation("")
      await loadOrganizations()
      void onRefreshSupportUnread().catch(() => undefined)
      onFeedback("Empresa eliminada correctamente.")
    } catch (error) {
      setDeleteError({
        message: error instanceof Error ? error.message : "No fue posible completar la eliminación. Inténtalo nuevamente.",
        correlationId: error instanceof OrganizationDeletionError ? error.correlationId : null,
      })
    } finally {
      setIsDeleting(false)
    }
  }

  if (selectedOrganization) {
    const accessEnabled = selectedOrganization.status === "active" && selectedOrganization.operationalAccessManuallyEnabled
    const accessLabel = accessEnabled ? "Liberado" : "Bloqueado"
    const accessDescription = selectedOrganization.status === "suspended" ? "La organización está suspendida y el acceso efectivo permanece bloqueado." : accessEnabled ? "Los usuarios de esta empresa pueden ingresar al sistema operativo según sus permisos." : "El acceso operativo de los usuarios de esta empresa está bloqueado."
    const accessActionLabel = selectedOrganization.operationalAccessManuallyEnabled ? "Bloquear acceso" : "Liberar acceso"
    const accessReason = selectedOrganization.operationalAccessReasonCode ? operationalAccessReasons.find((item) => item.value === selectedOrganization.operationalAccessReasonCode)?.label ?? selectedOrganization.operationalAccessReasonCode : "Sin cambios manuales registrados"
    const usedProgress = selectedOrganization.seatLimit > 0 ? Math.min(100, (selectedOrganization.seatsUsed / selectedOrganization.seatLimit) * 100) : 0
    return <section className="admin-page admin-detail-page">
      <button className="summary-back-button" onClick={() => setSelectedOrganizationId(null)} type="button"><ArrowLeft aria-hidden="true" size={18} /> Empresas</button>
      <header className="company-hero">
        <div className="company-hero__identity"><span className="company-hero__icon"><Building2 aria-hidden="true" size={28} /></span><div><p>Empresa</p><h1>{selectedOrganization.name}</h1><span className="company-hero__meta"><CalendarDays aria-hidden="true" size={15} /> Alta: {formatDate(selectedOrganization.createdAt)}</span></div></div>
        <div className="company-hero__actions"><button className="button button--primary company-hero__manage-button" disabled={selectedOrganization.status !== "active"} onClick={() => { setActiveOrganization({ id: selectedOrganization.id, name: selectedOrganization.name, status: selectedOrganization.status }); onEnterOrganization() }} type="button"><Settings2 aria-hidden="true" size={17} /> Administrar empresa <ChevronRight aria-hidden="true" size={17} /></button><button aria-label="Editar empresa" className="button button--secondary company-hero__edit-button" onClick={openEditForm} title="Editar empresa" type="button"><Edit3 aria-hidden="true" size={18} /></button></div>
      </header>
      <nav className="admin-tabs company-tabs" aria-label="Secciones de empresa">{(["summary", "users", "tickets"] as const).map((tab) => <button className={activeTab === tab ? "admin-tab admin-tab--active" : "admin-tab"} key={tab} onClick={() => setActiveTab(tab)} type="button">{tab === "summary" ? "Resumen" : tab === "users" ? "Usuarios" : "Tickets"}</button>)}</nav>
      {activeTab === "summary" ? <>
        <section className={`access-status-card ${accessEnabled ? "access-status-card--enabled" : "access-status-card--blocked"}`}><div className="access-status-card__main"><span className="access-status-card__icon"><ShieldCheck aria-hidden="true" size={23} /></span><div><p>Acceso al sistema</p><h2>{accessLabel}</h2><span>{accessDescription}</span></div></div><div className="access-status-card__details"><div><span><CalendarDays aria-hidden="true" size={14} /> Último cambio</span><strong>{selectedOrganization.operationalAccessChangedAt ? formatDate(selectedOrganization.operationalAccessChangedAt) : "Sin registro"}</strong></div><div><span><Info aria-hidden="true" size={14} /> Motivo</span><strong>{accessReason}</strong></div>{selectedOrganization.operationalAccessReasonNote ? <div><span><Info aria-hidden="true" size={14} /> Nota</span><strong>{selectedOrganization.operationalAccessReasonNote}</strong></div> : null}</div><button className="button button--secondary access-status-card__action" disabled={isSaving} onClick={openAccessForm} type="button"><LockKeyhole aria-hidden="true" size={17} /> {accessActionLabel}</button></section>
        <section className="organization-summary-grid company-metrics"><div className="organization-summary-card company-metric-card"><span><Users aria-hidden="true" size={16} /> Usuarios utilizados</span><strong>{selectedOrganization.seatsUsed} <small>de {selectedOrganization.seatLimit}</small></strong><div className="company-metric-card__bar" aria-label={`${selectedOrganization.seatsUsed} de ${selectedOrganization.seatLimit} usuarios utilizados`} role="progressbar" aria-valuemax={selectedOrganization.seatLimit} aria-valuemin={0} aria-valuenow={selectedOrganization.seatsUsed}><span style={{ width: `${usedProgress}%` }} /></div><small>Plazas ocupadas</small></div><div className="organization-summary-card company-metric-card"><span><Users aria-hidden="true" size={16} /> Disponibles</span><strong>{selectedOrganization.seatsAvailable}</strong><small>Plazas restantes</small></div><div className="organization-summary-card company-metric-card"><span><CheckCircle2 aria-hidden="true" size={16} /> Estado de la empresa</span><strong>{selectedOrganization.status === "active" ? "Activa" : "Suspendida"}</strong><small>{selectedOrganization.suspendedAt ? `Desde ${formatDate(selectedOrganization.suspendedAt)}` : "Empresa vigente"}</small></div></section>

      </> : activeTab === "users" ? <OrganizationUsers organization={selectedOrganization} isSaving={isSaving} onFeedback={onFeedback} onRefreshOrganizations={loadOrganizations} onSavingChange={setIsSaving} /> : <FeedbackAdminPanel onRefreshUnread={onRefreshSupportUnread} organizationId={selectedOrganization.id} organizationName={selectedOrganization.name} unreadTicketIds={supportUnreadTicketIds} />}
    {isFormOpen ? <OrganizationForm editingOrganization={editingOrganization} isSaving={isSaving} onClose={() => setIsFormOpen(false)} onSubmit={handleSave} /> : null}
    {isAccessFormOpen ? <OperationalAccessForm enabled={!selectedOrganization.operationalAccessManuallyEnabled} isSaving={isSaving} reasonCode={accessReasonCode} reasonNote={accessReasonNote} error={accessError} onClose={() => setIsAccessFormOpen(false)} onReasonCodeChange={setAccessReasonCode} onReasonNoteChange={setAccessReasonNote} onSubmit={handleOperationalAccessChange} /> : null}
   </section>
  }

  return <section className="admin-page"><header className="page-header"><div><p>Administración</p><h1>Empresas</h1><span>Administra las empresas y sus límites de usuarios.</span></div><button className="button button--primary" onClick={openCreateForm} type="button"><Plus aria-hidden="true" size={18} /> Nueva empresa</button></header>{supportUnreadOrganizations.length > 0 ? <div className="organization-support-summary" aria-label="Actividad pendiente de soporte">{supportUnreadOrganizations.map((item) => <span key={item.organizationId}><strong>{organizations.find((organization) => organization.id === item.organizationId)?.name ?? "Empresa"}</strong><em>{item.unreadCount}</em></span>)}</div> : null}{isLoading ? <div className="state-card">Cargando empresas...</div> : loadError ? <div className="state-card state-card--warning"><strong>No se pudieron cargar las empresas</strong><span>{loadError}</span></div> : organizations.length === 0 ? <div className="empty-state admin-empty-state"><Building2 aria-hidden="true" size={34} /><strong>No hay empresas registradas</strong><span>Crea la primera empresa para comenzar a organizar FleetMaster.</span><button className="button button--primary" onClick={openCreateForm} type="button"><Plus aria-hidden="true" size={18} /> Nueva empresa</button></div> : <div className="organization-list">{organizations.map((organization) => <div className="organization-row" key={organization.id} onClick={() => { setSelectedOrganizationId(organization.id); setActiveTab("summary") }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedOrganizationId(organization.id); setActiveTab("summary") } }} role="button" tabIndex={0}><span className="organization-row__icon"><Building2 aria-hidden="true" size={20} /></span><span className="organization-row__content"><strong>{organization.name}</strong><small>Usuarios: {organization.seatsUsed} de {organization.seatLimit} · Alta: {formatDate(organization.createdAt)}</small></span>{isFleetmasterAdmin ? <button aria-label="Eliminar empresa" className="organization-row__delete" onClick={(event) => { event.stopPropagation(); openDeleteModal(organization) }} onKeyDown={(event) => event.stopPropagation()} title="Eliminar empresa" type="button"><Trash2 aria-hidden="true" size={17} /></button> : null}<span className={`organization-status organization-status--${organization.status}`}>{organization.status === "active" ? "Activa" : "Suspendida"}</span><span className="organization-row__arrow" aria-hidden="true">→</span></div>)}</div>}{isFormOpen ? <OrganizationForm editingOrganization={editingOrganization} isSaving={isSaving} onClose={() => setIsFormOpen(false)} onSubmit={handleSave} /> : null}{deletingOrganization ? <OrganizationDeletionModal confirmation={deleteConfirmation} error={deleteError} isDeleting={isDeleting} onClose={closeDeleteModal} onConfirmationChange={setDeleteConfirmation} onConfirm={() => void handleDeleteOrganization()} onManage={() => { setDeletingOrganization(null); setDeleteConfirmation(""); setDeleteError(null); setSelectedOrganizationId(deletingOrganization.id); setActiveTab("summary") }} organization={deletingOrganization} /> : null}</section>
}

function OrganizationDeletionModal({ organization, confirmation, error, isDeleting, onClose, onConfirmationChange, onConfirm, onManage }: { organization: OrganizationSummary; confirmation: string; error: { message: string; correlationId: string | null } | null; isDeleting: boolean; onClose: () => void; onConfirmationChange: (value: string) => void; onConfirm: () => void; onManage: () => void }) {
  useEffect(() => {
    if (isDeleting) return
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isDeleting, onClose])
  const isSuspended = organization.status === "suspended"
  const isConfirmed = confirmation === organization.name
  return <div className="organization-delete-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}><section aria-describedby="organization-delete-description" aria-labelledby="organization-delete-title" aria-modal="true" className="organization-delete-modal" role="dialog"><header><div><p>{isSuspended ? "Eliminar empresa" : "Empresa activa"}</p><h2 id="organization-delete-title">{isSuspended ? `¿Eliminar ${organization.name}?` : "La empresa debe estar suspendida"}</h2></div><button aria-label="Cerrar" className="icon-button" disabled={isDeleting} onClick={onClose} type="button">×</button></header><div className="organization-delete-modal__body"><p id="organization-delete-description">{isSuspended ? "Se eliminarán permanentemente la empresa y sus datos asociados, incluidos usuarios, tickets, documentos y archivos." : "Para proteger la información y evitar eliminaciones accidentales, primero suspende la empresa desde Administrar empresa."}</p><div className="organization-delete-summary"><strong>{organization.name}</strong><span>Usuarios: {organization.seatsUsed} de {organization.seatLimit}</span><span>Alta: {formatDate(organization.createdAt)}</span></div>{isSuspended ? <><p className="organization-delete-warning"><strong>Esta acción no se puede deshacer.</strong></p><label className="field"><span>Para confirmar, escribe exactamente:</span><strong>{organization.name}</strong><input autoFocus disabled={isDeleting} onChange={(event) => onConfirmationChange(event.target.value)} value={confirmation} /></label></> : null}{error ? <p className="organization-delete-error" role="alert">{error.message}{error.correlationId ? <small>Referencia: {error.correlationId}</small> : null}</p> : null}</div><footer>{isSuspended ? <><button className="button button--secondary" disabled={isDeleting} onClick={onClose} type="button">Cancelar</button><button className="button organization-delete-submit" disabled={!isConfirmed || isDeleting} onClick={onConfirm} type="button">{isDeleting ? "Eliminando..." : "Eliminar empresa definitivamente"}</button></> : <><button className="button button--secondary" onClick={onClose} type="button">Cerrar</button><button className="button button--secondary" onClick={onManage} type="button">Administrar empresa</button></>}</footer></section></div>
}

function OperationalAccessForm({ enabled, isSaving, reasonCode, reasonNote, error, onClose, onReasonCodeChange, onReasonNoteChange, onSubmit }: { enabled: boolean; isSaving: boolean; reasonCode: OperationalAccessReasonCode; reasonNote: string; error: string | null; onClose: () => void; onReasonCodeChange: (value: OperationalAccessReasonCode) => void; onReasonNoteChange: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="modal-backdrop"><section aria-modal="true" className="organization-form-panel" role="dialog"><header><div><p>Acceso al sistema</p><h2>{enabled ? "Liberar acceso" : "Bloquear acceso"}</h2></div><button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">×</button></header><form onSubmit={onSubmit}><p className="form-helper">La acción cambiará el acceso operativo de los usuarios de esta empresa. La cuenta, usuarios y Feedback seguirán disponibles.</p><label className="field"><span>Motivo</span><select onChange={(event) => onReasonCodeChange(event.target.value as OperationalAccessReasonCode)} value={reasonCode}>{operationalAccessReasons.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="field"><span>Nota opcional</span><textarea maxLength={1000} onChange={(event) => onReasonNoteChange(event.target.value)} rows={4} value={reasonNote} /></label>{error ? <p className="organization-form-error" role="alert">{error}</p> : null}<footer><button className="button button--secondary" onClick={onClose} type="button">Cancelar</button><button className="button button--primary" disabled={isSaving} type="submit">{isSaving ? "Procesando..." : enabled ? "Liberar acceso" : "Bloquear acceso"}</button></footer></form></section></div>
}

function OrganizationUsers({ organization, isSaving, onFeedback, onRefreshOrganizations, onSavingChange }: { organization: OrganizationSummary; isSaving: boolean; onFeedback: (message: string) => void; onRefreshOrganizations: () => Promise<void>; onSavingChange: (value: boolean) => void }) {
  const [users, setUsers] = useState<OrganizationUserRecord[]>([]); const [isLoading, setIsLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [isInviteOpen, setIsInviteOpen] = useState(false)
  const loadUsers = async () => { setIsLoading(true); setError(null); try { setUsers(await listOrganizationUsers(organization.id)) } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los usuarios.") } finally { setIsLoading(false) } }
  useEffect(() => { void loadUsers() }, [organization.id])
  const activeManager = users.find((item) => item.recordType === "membership" && item.role === "manager" && item.status === "active"); const pendingManagerInvitation = users.find((item) => item.recordType === "invitation" && item.role === "manager" && item.status === "pending"); const manager = activeManager ?? pendingManagerInvitation; const hasAssignedManager = Boolean(manager); const otherUsers = users.filter((item) => item.role !== "manager"); const isAtLimit = organization.seatsUsed >= organization.seatLimit; const actionsDisabled = isSaving || organization.status !== "active" || isAtLimit
  const handleRevoke = async (item: OrganizationUserRecord) => { if (!window.confirm(`¿Revocar la invitación para ${item.email}?\n\nLa plaza reservada quedará disponible nuevamente.`)) return; onSavingChange(true); try { await revokeOrganizationInvitation(item.id); await Promise.all([loadUsers(), onRefreshOrganizations()]); onFeedback("Invitación revocada. La plaza está disponible nuevamente.") } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "No se pudo revocar la invitación.") } finally { onSavingChange(false) } }
  const handleDisable = async (item: OrganizationUserRecord) => { if (!window.confirm(`¿Desactivar a ${item.displayName || item.email}?`)) return; onSavingChange(true); try { await disableOrganizationMembership(item.id); await Promise.all([loadUsers(), onRefreshOrganizations()]); onFeedback("Usuario desactivado.") } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "No se pudo desactivar el usuario.") } finally { onSavingChange(false) } }
  const submitInvitation = async (name: string, email: string) => { onSavingChange(true); try { await sendManagerInvitation({ organizationId: organization.id, name, email }); setIsInviteOpen(false); await Promise.all([loadUsers(), onRefreshOrganizations()]); onFeedback("Invitación enviada correctamente. Se reservó una plaza para el usuario.") } finally { onSavingChange(false) } }
  return <section className="organization-users"><header className="users-panel-header"><div><p>Usuarios</p><h2>Personas de la empresa</h2><span>Las invitaciones registradas reservan una plaza.</span></div><div className="users-seat-count"><strong>{organization.seatsUsed} de {organization.seatLimit}</strong><span>{organization.seatsAvailable} disponibles</span></div></header>{organization.status !== "active" ? <div className="users-notice"><Ban aria-hidden="true" size={17} /> La empresa está suspendida. No se pueden registrar invitaciones.</div> : null}{isAtLimit ? <div className="users-notice users-notice--limit"><Users aria-hidden="true" size={17} /> Se alcanzó el límite de plazas.</div> : null}<section className="users-section"><header><div><p>Responsable de la empresa</p><h3>Manager principal</h3></div><button className="button button--primary" disabled={actionsDisabled || hasAssignedManager} onClick={() => setIsInviteOpen(true)} type="button"><UserPlus aria-hidden="true" size={17} /> Asignar Manager</button></header>{isLoading ? <div className="users-empty">Cargando usuarios...</div> : manager ? <UserRecord item={manager} onDisable={manager.recordType === "membership" && manager.status === "active" ? () => void handleDisable(manager) : undefined} onRevoke={manager.recordType === "invitation" && manager.status === "pending" ? () => void handleRevoke(manager) : undefined} /> : <div className="users-empty"><UserRound aria-hidden="true" size={25} /><strong>Aún no se ha asignado un responsable.</strong><span>Registra una invitación para el Manager principal.</span></div>}</section><section className="users-section"><header><div><p>Usuarios de la empresa</p><h3>Clientes y colaboradores</h3></div><span className="users-section__count">{otherUsers.length} registros</span></header>{isLoading ? <div className="users-empty">Cargando usuarios...</div> : otherUsers.length === 0 ? <div className="users-empty"><Users aria-hidden="true" size={25} /><span>Aún no hay usuarios adicionales registrados.</span></div> : <div className="user-record-list">{otherUsers.map((item) => <UserRecord item={item} key={`${item.recordType}-${item.id}`} onDisable={item.recordType === "membership" && item.status === "active" ? () => void handleDisable(item) : undefined} onRevoke={item.recordType === "invitation" && item.status === "pending" ? () => void handleRevoke(item) : undefined} />)}</div>}</section>{isInviteOpen ? <ManagerInvitationForm isSaving={isSaving} onClose={() => setIsInviteOpen(false)} onSubmit={submitInvitation} /> : null}{error ? <p className="organization-form-error" role="alert">{error}</p> : null}<button className="users-refresh" disabled={isLoading} onClick={() => void loadUsers()} type="button"><RefreshCw aria-hidden="true" size={16} /> Actualizar lista</button></section>
}

function UserRecord({ item, onDisable, onRevoke }: { item: OrganizationUserRecord; onDisable?: () => void; onRevoke?: () => void }) { const isInvitation = item.recordType === "invitation"; return <article className="user-record"><span className="user-record__icon">{isInvitation ? <Clock3 aria-hidden="true" size={19} /> : <UserRound aria-hidden="true" size={19} />}</span><div className="user-record__identity"><strong>{item.displayName || "Sin nombre registrado"}</strong><span><Mail aria-hidden="true" size={14} /> {item.email}</span></div><span className="user-record__role">{item.role === "manager" ? "Manager" : item.role === "admin" ? "Administrador" : "Usuario"}</span><span className={`user-record__status user-record__status--${isInvitation ? "pending" : item.status}`}>{isInvitation ? "Invitación pendiente" : item.status === "active" ? "Activo" : "Desactivado"}</span><small>{isInvitation ? `Registrada: ${formatDate(item.createdAt)}${item.expiresAt ? ` · Expira: ${formatDate(item.expiresAt)}` : ""}` : `Alta: ${formatDate(item.createdAt)}`}</small>{onRevoke ? <button className="icon-button user-record__action" aria-label="Revocar invitación" onClick={onRevoke} type="button"><UserX aria-hidden="true" size={17} /></button> : onDisable ? <button className="icon-button user-record__action" aria-label="Desactivar usuario" onClick={onDisable} type="button"><Ban aria-hidden="true" size={17} /></button> : null}</article> }

function ManagerInvitationForm({ isSaving, onClose, onSubmit }: { isSaving: boolean; onClose: () => void; onSubmit: (name: string, email: string) => Promise<void> }) { const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [error, setError] = useState<string | null>(null); const handleSubmit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setError(null); try { await onSubmit(name.trim(), email.trim()) } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "No se pudo enviar la invitación.") } }; return <div className="modal-backdrop"><section aria-modal="true" className="organization-form-panel" role="dialog"><header><div><p>Responsable principal</p><h2>Asignar Manager</h2></div><button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">×</button></header><form onSubmit={handleSubmit}><label className="field"><span>Nombre</span><input autoFocus onChange={(event) => setName(event.target.value)} required value={name} /></label><label className="field"><span>Correo electrónico</span><input onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label><p className="form-helper">Se enviará una invitación por correo electrónico y se reservará una plaza para este usuario.</p>{error ? <p className="organization-form-error" role="alert">{error}</p> : null}<footer><button className="button button--secondary" onClick={onClose} type="button">Cancelar</button><button className="button button--primary" disabled={isSaving} type="submit"><UserPlus aria-hidden="true" size={17} /> {isSaving ? "Enviando..." : "Enviar invitación"}</button></footer></form></section></div> }

function OrganizationForm({ editingOrganization, isSaving, onClose, onSubmit }: { editingOrganization: OrganizationSummary | null; isSaving: boolean; onClose: () => void; onSubmit: (input: CreateOrganizationInput) => Promise<void> }) { const [name, setName] = useState(editingOrganization?.name ?? ""); const [seatLimit, setSeatLimit] = useState(String(editingOrganization?.seatLimit ?? 10)); const [error, setError] = useState<string | null>(null); const handleSubmit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setError(null); try { await onSubmit({ name: name.trim(), seatLimit: Number(seatLimit) }) } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "No se pudo guardar la empresa.") } }; return <div className="modal-backdrop" role="presentation"><section aria-modal="true" className="organization-form-panel" role="dialog"><header><div><p>{editingOrganization ? "Editar empresa" : "Nueva empresa"}</p><h2>{editingOrganization ? "Información básica" : "Registrar empresa"}</h2></div><button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">×</button></header><form onSubmit={handleSubmit}><label className="field"><span>Nombre de la empresa</span><input autoFocus onChange={(event) => setName(event.target.value)} required value={name} /></label><label className="field"><span>Límite de usuarios</span><input min="1" onChange={(event) => setSeatLimit(event.target.value)} required type="number" value={seatLimit} /></label>{error ? <p className="organization-form-error" role="alert">{error}</p> : null}<footer><button className="button button--secondary" onClick={onClose} type="button">Cancelar</button><button className="button button--primary" disabled={isSaving} type="submit">{isSaving ? "Guardando..." : editingOrganization ? "Guardar cambios" : "Crear empresa"}</button></footer></form></section></div> }
