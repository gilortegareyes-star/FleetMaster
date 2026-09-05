import { Building2, Check, Edit3, Plus, Search, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { useOrganization } from "../contexts/OrganizationContext"
import { createMaintenanceProvider, listMaintenanceProviders, setMaintenanceProviderActive, updateMaintenanceProvider } from "../services/maintenanceProviders"
import { maintenanceProviderTypes, type MaintenanceProvider, type MaintenanceProviderType } from "../types/maintenanceProvider"

const typeLabels: Record<MaintenanceProviderType, string> = {
  agency: "Agencia",
  workshop: "Taller",
  tire_shop: "Llantera",
  specialist: "Especialista",
  other: "Otro",
}

type ProviderFilter = "all" | "active" | "inactive"

export function MaintenanceProvidersPage({ onGoToAdministration }: { onGoToAdministration: () => void }) {
  const { isFleetmasterAdmin, organizationAccess } = useAuth()
  const { activeOrganization } = useOrganization()
  const [providers, setProviders] = useState<MaintenanceProvider[]>([])
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<ProviderFilter>("active")
  const [isLoading, setIsLoading] = useState(Boolean(activeOrganization))
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [editingProvider, setEditingProvider] = useState<MaintenanceProvider | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const canManage = isFleetmasterAdmin || organizationAccess?.role === "manager"

  const loadProviders = async () => {
    if (!activeOrganization) {
      setProviders([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      setProviders(await listMaintenanceProviders(activeOrganization.id))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los proveedores.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void loadProviders() }, [activeOrganization?.id])

  const filteredProviders = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es-MX")
    return providers.filter((provider) => {
      const matchesFilter = filter === "all" || (filter === "active" ? provider.isActive : !provider.isActive)
      const matchesQuery = !normalizedQuery || provider.name.toLocaleLowerCase("es-MX").includes(normalizedQuery) || typeLabels[provider.type].toLocaleLowerCase("es-MX").includes(normalizedQuery)
      return matchesFilter && matchesQuery
    })
  }, [filter, providers, query])

  const openNewProvider = () => { setEditingProvider(null); setError(null); setIsFormOpen(true) }
  const openEditProvider = (provider: MaintenanceProvider) => { setEditingProvider(provider); setError(null); setIsFormOpen(true) }

  const saveProvider = async (name: string, type: MaintenanceProviderType) => {
    if (!activeOrganization) return
    if (providers.some((provider) => provider.isActive && provider.name.trim().toLocaleLowerCase("es-MX") === name.trim().toLocaleLowerCase("es-MX") && provider.id !== editingProvider?.id)) {
      throw new Error("Ya existe un proveedor activo con ese nombre.")
    }
    setIsSaving(true)
    setError(null)
    try {
      const saved = editingProvider
        ? await updateMaintenanceProvider(editingProvider.id, activeOrganization.id, name, type)
        : await createMaintenanceProvider(activeOrganization.id, name, type)
      setProviders((current) => editingProvider ? current.map((provider) => provider.id === saved.id ? saved : provider) : [...current, saved])
      setIsFormOpen(false)
      setFeedback(editingProvider ? "Proveedor actualizado." : "Proveedor registrado.")
    } catch (saveError) {
      throw saveError instanceof Error ? saveError : new Error("No se pudo guardar el proveedor.")
    } finally {
      setIsSaving(false)
    }
  }

  const toggleProvider = async (provider: MaintenanceProvider) => {
    if (!activeOrganization) return
    const nextActive = !provider.isActive
    if (!nextActive && !window.confirm(`${provider.name} dejará de aparecer como opción para nuevos registros de ingreso. Las órdenes existentes conservarán su información. ¿Deseas continuar?`)) return
    setIsSaving(true)
    setError(null)
    try {
      const updated = await setMaintenanceProviderActive(provider.id, activeOrganization.id, nextActive)
      setProviders((current) => current.map((item) => item.id === updated.id ? updated : item))
      setFeedback(nextActive ? "Proveedor reactivado." : "Proveedor desactivado.")
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "No se pudo actualizar el proveedor.")
    } finally {
      setIsSaving(false)
    }
  }

  if (!activeOrganization) return <section className="providers-page"><div className="providers-no-organization"><Building2 aria-hidden="true" size={32} /><h1>Talleres y proveedores</h1><p>Selecciona una empresa para administrar sus talleres y proveedores.</p><button className="button button--secondary" onClick={onGoToAdministration} type="button">Ir a Empresas</button></div></section>

  return <section className="providers-page">
    <header className="page-header providers-page__header"><div><p>Configuración operativa</p><h1>Talleres y proveedores</h1><span>Administra los lugares donde se realizan los mantenimientos de {activeOrganization.name}.</span></div>{canManage ? <button className="button button--primary" onClick={openNewProvider} type="button"><Plus aria-hidden="true" size={18} />Nuevo proveedor</button> : null}</header>
    {feedback ? <div className="form-banner providers-page__feedback" role="status"><Check aria-hidden="true" size={17} />{feedback}</div> : null}
    {error ? <div className="form-banner providers-page__error" role="alert">{error}</div> : null}
    <section className="providers-panel">
      <div className="providers-toolbar"><label className="search-box"><Search aria-hidden="true" size={18} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Buscar taller o proveedor..." value={query} /></label><div className="providers-filter" aria-label="Filtrar proveedores"><button className={filter === "active" ? "is-selected" : ""} onClick={() => setFilter("active")} type="button">Activos</button><button className={filter === "all" ? "is-selected" : ""} onClick={() => setFilter("all")} type="button">Todos</button><button className={filter === "inactive" ? "is-selected" : ""} onClick={() => setFilter("inactive")} type="button">Inactivos</button></div></div>
      {isLoading ? <div className="state-card">Cargando proveedores...</div> : filteredProviders.length === 0 ? <div className="providers-empty"><Building2 aria-hidden="true" size={32} /><strong>{providers.length === 0 ? "No hay talleres o proveedores registrados." : "No hay proveedores para este filtro."}</strong><span>{providers.length === 0 ? "Agrega los lugares donde esta empresa realiza sus mantenimientos." : "Prueba con otro filtro o término de búsqueda."}</span>{canManage && providers.length === 0 ? <button className="button button--primary" onClick={openNewProvider} type="button"><Plus aria-hidden="true" size={18} />Nuevo proveedor</button> : null}</div> : <div className="providers-list">{filteredProviders.map((provider) => <article className="provider-row" key={provider.id}><div className="provider-row__identity"><span className="provider-row__icon"><Building2 aria-hidden="true" size={19} /></span><div><strong>{provider.name}</strong><span>{typeLabels[provider.type]}</span></div></div><span className={`provider-status provider-status--${provider.isActive ? "active" : "inactive"}`}>{provider.isActive ? "Activo" : "Inactivo"}</span>{canManage ? <div className="provider-row__actions"><button aria-label={`Editar ${provider.name}`} className="icon-button" onClick={() => openEditProvider(provider)} title="Editar proveedor" type="button"><Edit3 aria-hidden="true" size={17} /></button><button className="button button--secondary" disabled={isSaving} onClick={() => void toggleProvider(provider)} type="button">{provider.isActive ? "Desactivar proveedor" : "Reactivar proveedor"}</button></div> : null}</article>)}</div>}
    </section>
    {isFormOpen ? <ProviderForm editingProvider={editingProvider} isSaving={isSaving} onClose={() => setIsFormOpen(false)} onSubmit={saveProvider} /> : null}
  </section>
}

function ProviderForm({ editingProvider, isSaving, onClose, onSubmit }: { editingProvider: MaintenanceProvider | null; isSaving: boolean; onClose: () => void; onSubmit: (name: string, type: MaintenanceProviderType) => Promise<void> }) {
  const [name, setName] = useState(editingProvider?.name ?? "")
  const [type, setType] = useState<MaintenanceProviderType>(editingProvider?.type ?? "agency")
  const [error, setError] = useState<string | null>(null)
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!name.trim()) { setError("Escribe el nombre del proveedor."); return }; setError(null); try { await onSubmit(name.trim(), type) } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "No se pudo guardar el proveedor.") } }
  return <div className="modal-backdrop" role="presentation"><section aria-modal="true" className="provider-form-panel" role="dialog"><header><div><p>{editingProvider ? "Editar proveedor" : "Nuevo proveedor"}</p><h2>{editingProvider ? "Información del proveedor" : "Registrar proveedor"}</h2></div><button aria-label="Cerrar" className="icon-button" onClick={onClose} type="button"><X aria-hidden="true" size={20} /></button></header><form onSubmit={(event) => void submit(event)}><label className="field"><span>Nombre</span><input autoFocus onChange={(event) => setName(event.target.value)} required value={name} /></label><label className="field"><span>Tipo</span><select onChange={(event) => setType(event.target.value as MaintenanceProviderType)} value={type}>{maintenanceProviderTypes.map((providerType) => <option key={providerType} value={providerType}>{typeLabels[providerType]}</option>)}</select></label>{error ? <p className="organization-form-error" role="alert">{error}</p> : null}<footer><button className="button button--secondary" onClick={onClose} type="button">Cancelar</button><button className="button button--primary" disabled={isSaving} type="submit">{isSaving ? "Guardando..." : "Guardar proveedor"}</button></footer></form></section></div>
}
