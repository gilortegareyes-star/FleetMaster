import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, CarFront, ChevronLeft, ChevronRight, Headphones, LayoutGrid, List, LogOut, Plus, Search, Settings2, UserRound, Wrench } from "lucide-react"
import "./App.css"
import { VehicleCard } from "./components/VehicleCard"
import { VehicleTable } from "./components/VehicleTable"
import { VehicleDetail } from "./components/VehicleDetail"
import { VehicleForm } from "./components/VehicleForm"
import { getVehicleDocumentAlerts } from "./services/vehicleDocuments"
import { createVehicle, listVehicles, updateVehicle } from "./services/vehicles"
import { isSupabaseConfigured } from "./services/supabase"
import type { Vehicle, VehiclePayload } from "./types/vehicle"
import { useAuth } from "./contexts/AuthContext"
import { AdminOrganizationsPage } from "./components/AdminOrganizationsPage"
import { useOrganization } from "./contexts/OrganizationContext"
import { MaintenanceProvidersPage } from "./components/MaintenanceProvidersPage"
import { FeedbackPanel } from "./components/FeedbackPanel"
import type { FeedbackAdminUnreadOrganization, FeedbackUnreadTicket } from "./types/feedback"

type ActiveView = "inicio" | "unidades" | "administracion" | "proveedores" | "soporte"
type FleetViewMode = "cards" | "table"
type FormState = { mode: "create" } | { mode: "edit"; vehicle: Vehicle } | null

const navigationStorageKey = "fleetmaster.navigation.v1"
const fleetViewStorageKey = "fleetmaster:fleet-view"
const fleetPageSize = 12
const validActiveViews = new Set<ActiveView>(["inicio", "unidades", "administracion", "proveedores", "soporte"])

interface StoredNavigation {
  userId: string
  organizationId: string | null
  activeView: ActiveView
  selectedVehicleId?: string | null
  isVehicleCenterOpen?: boolean
}

function App({ onRefreshSupportUnread, supportUnreadOrganizations, supportUnreadTickets }: { onRefreshSupportUnread: () => Promise<void>; supportUnreadOrganizations: FeedbackAdminUnreadOrganization[]; supportUnreadTickets: FeedbackUnreadTicket[] }) {
  const { isFleetmasterAdmin, signOut, user } = useAuth()
  const { activeOrganization, clearActiveOrganization } = useOrganization()
  const [activeView, setActiveView] = useState<ActiveView>("unidades")
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [isVehicleCenterOpen, setIsVehicleCenterOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [formState, setFormState] = useState<FormState>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [documentAlertsByVehicle, setDocumentAlertsByVehicle] = useState<Map<string, import("./services/vehicleDocuments").DocumentAlert[]> | null>(null)
  const [fleetView, setFleetView] = useState<FleetViewMode>(() => {
    const stored = window.sessionStorage.getItem(fleetViewStorageKey)
    return stored === "table" ? "table" : "cards"
  })
  const [currentPage, setCurrentPage] = useState(1)

  const storeNavigation = (
    view: ActiveView,
    organizationId = activeOrganization?.id ?? null,
    selectedVehicleId: string | null = null,
    isVehicleCenterOpen = false,
  ) => {
    if (!user) return
    const stored: StoredNavigation = { userId: user.id, organizationId, activeView: view, selectedVehicleId, isVehicleCenterOpen }
    window.sessionStorage.setItem(navigationStorageKey, JSON.stringify(stored))
  }

  const navigateTo = (view: ActiveView, clearVehicle = false) => {
    const nextView = view === "administracion" && !isFleetmasterAdmin ? "unidades" : view
    setActiveView(nextView)
    storeNavigation(nextView, activeOrganization?.id ?? null, clearVehicle ? null : selectedVehicleId, clearVehicle ? false : isVehicleCenterOpen)
  }

  useEffect(() => {
    if (!user) {
      window.sessionStorage.removeItem(navigationStorageKey)
      setActiveView("unidades")
      return
    }

    const raw = window.sessionStorage.getItem(navigationStorageKey)
    if (!raw) return

    try {
      const stored = JSON.parse(raw) as Partial<StoredNavigation>
      if (
        stored.userId !== user.id ||
        typeof stored.activeView !== "string" ||
        !validActiveViews.has(stored.activeView as ActiveView) ||
        (stored.organizationId !== null && typeof stored.organizationId !== "string") ||
        (stored.selectedVehicleId !== undefined && stored.selectedVehicleId !== null && typeof stored.selectedVehicleId !== "string") ||
        (stored.isVehicleCenterOpen !== undefined && typeof stored.isVehicleCenterOpen !== "boolean")
      ) {
        window.sessionStorage.removeItem(navigationStorageKey)
        setActiveView("unidades")
        return
      }

      if (activeOrganization?.id) {
        if (stored.organizationId === activeOrganization.id) {
          setActiveView(stored.activeView === "administracion" && !isFleetmasterAdmin ? "unidades" : stored.activeView as ActiveView)
        } else {
          window.sessionStorage.removeItem(navigationStorageKey)
          setActiveView("unidades")
        }
      } else if (stored.organizationId === null) {
        setActiveView(stored.activeView === "administracion" && !isFleetmasterAdmin ? "unidades" : stored.activeView as ActiveView)
      }
    } catch {
      window.sessionStorage.removeItem(navigationStorageKey)
      setActiveView("unidades")
    }
  }, [activeOrganization?.id, isFleetmasterAdmin, user?.id])

  useEffect(() => {
    let isActive = true
    const loadVehicles = async () => {
      setIsLoading(true)
      setLoadError(null)

      if (!activeOrganization) {
        setVehicles([])
        setSelectedVehicleId(null)
        setIsLoading(false)
        return
      }

      if (!isSupabaseConfigured()) {
        setVehicles([])
        setLoadError("Configura Supabase para cargar y registrar unidades.")
        setIsLoading(false)
        return
      }

      try {
        const items = await listVehicles(activeOrganization.id)
        if (!isActive) return
        setVehicles(items)

        let storedVehicleId: string | null = null
        let shouldRestoreVehicle = false
        const storedNavigation = window.sessionStorage.getItem(navigationStorageKey)
        if (storedNavigation) {
          try {
            const parsed = JSON.parse(storedNavigation) as Partial<StoredNavigation>
            if (
              parsed.userId === user?.id &&
              parsed.organizationId === activeOrganization.id &&
              parsed.isVehicleCenterOpen === true &&
              typeof parsed.selectedVehicleId === "string" &&
              items.some((item) => item.id === parsed.selectedVehicleId)
            ) {
              storedVehicleId = parsed.selectedVehicleId
              shouldRestoreVehicle = true
            }
          } catch {
            window.sessionStorage.removeItem(navigationStorageKey)
          }
        }

        setSelectedVehicleId((current) => current ?? storedVehicleId ?? items[0]?.id ?? null)
        setIsVehicleCenterOpen(shouldRestoreVehicle)
        if (storedNavigation && !shouldRestoreVehicle) {
          try {
            const parsed = JSON.parse(storedNavigation) as Partial<StoredNavigation>
            if (parsed.userId === user?.id && parsed.organizationId === activeOrganization.id && parsed.isVehicleCenterOpen === true) {
              window.sessionStorage.setItem(
                navigationStorageKey,
                JSON.stringify({ ...parsed, selectedVehicleId: null, isVehicleCenterOpen: false }),
              )
            }
          } catch {
            window.sessionStorage.removeItem(navigationStorageKey)
          }
        }
      } catch (error) {
        if (!isActive) return
        setLoadError(error instanceof Error ? error.message : "No se pudieron cargar las unidades.")
      } finally {
        if (isActive) setIsLoading(false)
      }
    }

    void loadVehicles()
    return () => {
      isActive = false
    }
  }, [activeOrganization?.id])

  useEffect(() => {
    setVehicles([])
    setSelectedVehicleId(null)
    setIsVehicleCenterOpen(false)
    setSearchQuery("")
    setFormState(null)
    setLoadError(null)
    setSaveError(null)
    setFeedback(null)
    setDocumentAlertsByVehicle(null)
  }, [activeOrganization?.id])

  const vehicleIdsKey = useMemo(() => vehicles.map((vehicle) => vehicle.id).join(","), [vehicles])

  useEffect(() => {
    let isActive = true
    const vehicleIds = vehicleIdsKey ? vehicleIdsKey.split(",") : []

    setDocumentAlertsByVehicle(null)

    if (vehicleIds.length === 0) {
      setDocumentAlertsByVehicle(new Map())
      return () => {
        isActive = false
      }
    }

    const loadDocumentStatus = async () => {
      try {
        const alertsByVehicle = await getVehicleDocumentAlerts(vehicles)
        if (isActive) {
          setDocumentAlertsByVehicle(alertsByVehicle)
        }
      } catch {
        if (isActive) {
          setDocumentAlertsByVehicle(new Map())
        }
      }
    }

    void loadDocumentStatus()
    return () => {
      isActive = false
    }
  }, [vehicleIdsKey])

  useEffect(() => {
    if (!feedback) {
      return
    }

    const timeoutId = window.setTimeout(() => setFeedback(null), 2800)
    return () => window.clearTimeout(timeoutId)
  }, [feedback])

  const filteredVehicles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return vehicles.filter((vehicle) => {
      const matchesQuery =
        !query ||
        [
          vehicle.internalCode,
          vehicle.brand,
          vehicle.model,
          vehicle.licensePlate ?? "",
          vehicle.stateLicensePlate ?? "",
          vehicle.federalLicensePlate ?? "",
          ...vehicle.fuelTypes,
          vehicle.vin,
        ].some((value) => value.toLowerCase().includes(query))
      return matchesQuery
    })
  }, [searchQuery, vehicles])

  const selectedVehicle = useMemo(() => {
    return vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null
  }, [vehicles, selectedVehicleId])

  const vehiclesWithDocumentAlerts = useMemo(() => {
    if (!documentAlertsByVehicle) {
      return 0
    }

    return vehicles.reduce(
      (count, vehicle) => count + (documentAlertsByVehicle.get(vehicle.id)?.length ? 1 : 0),
      0,
    )
  }, [documentAlertsByVehicle, vehicles])

  const totalPages = Math.max(1, Math.ceil(filteredVehicles.length / fleetPageSize))
  const paginatedVehicles = useMemo(() => {
    const startIndex = (currentPage - 1) * fleetPageSize
    return filteredVehicles.slice(startIndex, startIndex + fleetPageSize)
  }, [currentPage, filteredVehicles])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages))
  }, [totalPages])

  const pageItems = useMemo<(number | "ellipsis")[]>(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1)
    if (currentPage <= 4) return [1, 2, 3, 4, 5, "ellipsis", totalPages]
    if (currentPage >= totalPages - 3) return [1, "ellipsis", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages]
  }, [currentPage, totalPages])

  const selectFleetView = (view: FleetViewMode) => {
    setFleetView(view)
    window.sessionStorage.setItem(fleetViewStorageKey, view)
  }

  const openVehicle = (vehicle: Vehicle) => {
    setSelectedVehicleId(vehicle.id)
    setIsVehicleCenterOpen(true)
    storeNavigation("unidades", activeOrganization?.id ?? null, vehicle.id, true)
  }

  const fleetStats = useMemo(() => {
    return {
      total: vehicles.length,
      active: vehicles.filter((vehicle) => vehicle.status === "Activo").length,
      maintenance: vehicles.filter((vehicle) => vehicle.status === "En mantenimiento").length,
      offline: vehicles.filter((vehicle) => vehicle.status === "Fuera de servicio").length,
    }
  }, [vehicles])

  const handleCreateVehicle = async (payload: VehiclePayload) => {
    setIsSaving(true)
    setSaveError(null)

    try {
      if (!activeOrganization) {
        throw new Error("Entra a una empresa activa para registrar una unidad.")
      }

      const createdVehicle = await createVehicle(payload, activeOrganization.id)
      setVehicles((current) => [...current, createdVehicle].sort((a, b) => a.internalCode.localeCompare(b.internalCode)))
      setSelectedVehicleId(createdVehicle.id)
      setIsVehicleCenterOpen(true)
      storeNavigation("unidades", activeOrganization.id, createdVehicle.id, true)
      setFormState(null)
      setFeedback("Unidad registrada correctamente.")
      setLoadError(null)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar la unidad.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdateVehicle = async (vehicleId: string, payload: VehiclePayload) => {
    setIsSaving(true)
    setSaveError(null)

    try {
      const updatedVehicle = await updateVehicle(vehicleId, payload)
      setVehicles((current) =>
        current
          .map((vehicle) => (vehicle.id === vehicleId ? updatedVehicle : vehicle))
          .sort((a, b) => a.internalCode.localeCompare(b.internalCode)),
      )
      setSelectedVehicleId(updatedVehicle.id)
      setFormState(null)
      setFeedback("Cambios guardados correctamente.")
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudieron guardar los cambios.")
    } finally {
      setIsSaving(false)
    }
  }

  const openCreateForm = () => {
    setSaveError(null)
    setFormState({ mode: "create" })
  }

  const openEditForm = (vehicle: Vehicle) => {
    setSaveError(null)
    setFormState({ mode: "edit", vehicle })
  }

  const syncVehicleMileage = (vehicleId: string, mileage: number) => {
    setVehicles((current) =>
      current.map((vehicle) =>
        vehicle.id === vehicleId && mileage > vehicle.currentMileage
          ? { ...vehicle, currentMileage: mileage }
          : vehicle,
      ),
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">
          <div>FM</div>
          <span>FleetMaster II</span>
        </div>
        <nav aria-label="Principal">
          <button
            className={activeView === "unidades" ? "nav-item nav-item--active" : "nav-item"}
            onClick={() => {
              navigateTo("unidades", true)
              setIsVehicleCenterOpen(false)
            }}
            type="button"
          >
            <CarFront aria-hidden="true" size={19} />
            Flota
          </button>
          {isFleetmasterAdmin ? <button
            className={activeView === "administracion" ? "nav-item nav-item--active" : "nav-item"}
            onClick={() => navigateTo("administracion")}
            type="button"
          >
            <Settings2 aria-hidden="true" size={19} />
            Administración{supportUnreadTickets.length > 0 ? <span className="nav-item__badge">{supportUnreadTickets.length}</span> : null}
          </button> : null}
          <button
            className={activeView === "proveedores" ? "nav-item nav-item--active" : "nav-item"}
            onClick={() => navigateTo("proveedores")}
            type="button"
          >
            <Wrench aria-hidden="true" size={19} />
            Talleres y proveedores
          </button>
          {!isFleetmasterAdmin ? <button
            className={activeView === "soporte" ? "nav-item nav-item--active" : "nav-item"}
            onClick={() => navigateTo("soporte", true)}
            type="button"
          >
            <Headphones aria-hidden="true" size={19} />
            Soporte{supportUnreadTickets.length > 0 ? <span className="nav-item__badge">{supportUnreadTickets.length}</span> : null}
          </button> : null}
        </nav>
        <div className="sidebar__footer">
          <div className="sidebar__account">
            <UserRound aria-hidden="true" size={17} />
            <span>{user?.user_metadata?.display_name || user?.email || "Cuenta"}</span>
          </div>
          <button className="nav-item sidebar__logout" onClick={() => void signOut()} type="button">
            <LogOut aria-hidden="true" size={18} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="content-shell">
        {activeOrganization ? <div className="active-organization-bar"><span>Administrando: <strong>{activeOrganization.name}</strong></span><button className="button button--secondary" onClick={() => { clearActiveOrganization(); setActiveView("administracion"); storeNavigation("administracion", null, null, false) }} type="button"><ArrowLeft aria-hidden="true" size={16} /> Empresas</button></div> : null}
        {activeView === "administracion" && isFleetmasterAdmin ? (
          <AdminOrganizationsPage onEnterOrganization={() => navigateTo("unidades", true)} onFeedback={setFeedback} onRefreshSupportUnread={onRefreshSupportUnread} supportUnreadOrganizations={supportUnreadOrganizations} supportUnreadTicketIds={supportUnreadTickets.map((ticket) => ticket.ticketId)} />
        ) : activeView === "proveedores" ? (
          <MaintenanceProvidersPage onGoToAdministration={() => navigateTo("administracion")} />
        ) : activeView === "soporte" ? (
          <FeedbackPanel onRefreshUnread={onRefreshSupportUnread} unreadTickets={supportUnreadTickets} />
        ) : (
          <section className={isVehicleCenterOpen && selectedVehicle ? "unit-center-page" : "units-page"}>
            {isVehicleCenterOpen && selectedVehicle ? (
              <VehicleDetail
                onBackToFleet={() => {
                  setIsVehicleCenterOpen(false)
                  storeNavigation("unidades", activeOrganization?.id ?? null, null, false)
                }}
                onEdit={() => openEditForm(selectedVehicle)}
                onFeedback={setFeedback}
                onVehicleMileageSynced={syncVehicleMileage}
                vehicle={selectedVehicle}
              />
            ) : (
              <>
            <header className="page-header">
              <div>
                <p>Gestion operativa</p>
                <h1>Flota</h1>
                <span>Administra y supervisa las unidades de tu flotilla.</span>
              </div>
              <button className="button button--primary" onClick={openCreateForm} type="button">
                <Plus aria-hidden="true" size={18} />
                Nueva unidad
              </button>
            </header>

            <section className="fleet-summary" aria-label="Resumen de flota">
              <div className="fleet-metric">
                <span>Total unidades</span>
                <strong>{fleetStats.total}</strong>
              </div>
              <div className="fleet-metric">
                <span>Activas</span>
                <strong>{fleetStats.active}</strong>
              </div>
              <div className="fleet-metric">
                <span>En mantenimiento</span>
                <strong>{fleetStats.maintenance}</strong>
              </div>
              <div className="fleet-metric">
                <span>Fuera de servicio</span>
                <strong>{fleetStats.offline}</strong>
              </div>
              <div className={vehiclesWithDocumentAlerts > 0 ? "fleet-metric fleet-metric--warning" : "fleet-metric"}>
                <span>Documentos pendientes</span>
                <strong>{vehiclesWithDocumentAlerts}</strong>
              </div>
            </section>

            <div className="fleet-layout">
              <section className="units-panel">
                <div className="search-panel">
                  <label className="search-box">
                    <Search aria-hidden="true" size={18} />
                    <input
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Buscar por codigo, marca, modelo, placas o VIN"
                      value={searchQuery}
                    />
                  </label>
                </div>

                <div className="fleet-results-toolbar">
                  <span>{filteredVehicles.length} {filteredVehicles.length === 1 ? "unidad" : "unidades"}</span>
                  <div aria-label="Vista de resultados" className="view-switcher" role="group">
                    <button
                      aria-pressed={fleetView === "cards"}
                      className={fleetView === "cards" ? "view-switcher__button view-switcher__button--active" : "view-switcher__button"}
                      onClick={() => selectFleetView("cards")}
                      type="button"
                    >
                      <LayoutGrid aria-hidden="true" size={16} />
                      Tarjetas
                    </button>
                    <button
                      aria-pressed={fleetView === "table"}
                      className={fleetView === "table" ? "view-switcher__button view-switcher__button--active" : "view-switcher__button"}
                      onClick={() => selectFleetView("table")}
                      type="button"
                    >
                      <List aria-hidden="true" size={16} />
                      Tabla
                    </button>
                  </div>
                </div>

                {isLoading ? (
                  <div className="state-card">Cargando unidades...</div>
                ) : loadError ? (
                  <div className="state-card state-card--warning">
                    <strong>No se pudieron cargar las unidades</strong>
                    <span>{loadError}</span>
                  </div>
                ) : vehicles.length === 0 ? (
                  <div className="empty-state">
                    <CarFront aria-hidden="true" size={34} />
                    <strong>No hay unidades registradas</strong>
                    <span>Agrega la primera unidad de tu flotilla para comenzar.</span>
                    <button className="button button--primary" onClick={openCreateForm} type="button">
                      <Plus aria-hidden="true" size={18} />
                      Nueva unidad
                    </button>
                  </div>
                ) : filteredVehicles.length === 0 ? (
                  <div className="state-card">
                    <strong>Sin resultados</strong>
                    <span>Ajusta la busqueda o los filtros para encontrar la unidad.</span>
                  </div>
                ) : (
                  <>
                    {fleetView === "cards" ? (
                      <div className="vehicles-list">
                        {paginatedVehicles.map((vehicle) => (
                          <VehicleCard
                            documentAlerts={documentAlertsByVehicle?.get(vehicle.id) ?? []}
                            isSelected={selectedVehicleId === vehicle.id}
                            key={vehicle.id}
                            onSelect={() => openVehicle(vehicle)}
                            vehicle={vehicle}
                          />
                        ))}
                      </div>
                    ) : (
                      <VehicleTable
                        documentAlertsByVehicle={documentAlertsByVehicle ?? new Map()}
                        isSelected={(vehicleId) => selectedVehicleId === vehicleId}
                        onSelect={openVehicle}
                        vehicles={paginatedVehicles}
                      />
                    )}
                    <div className="fleet-pagination" aria-label="Paginación de unidades">
                      <span>
                        Mostrando {(currentPage - 1) * fleetPageSize + 1}–{Math.min(currentPage * fleetPageSize, filteredVehicles.length)} de {filteredVehicles.length} unidades
                      </span>
                      <div className="fleet-pagination__controls">
                        <button aria-label="Página anterior" className="icon-button" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} type="button">
                          <ChevronLeft aria-hidden="true" size={17} />
                        </button>
                        {pageItems.map((item, index) => item === "ellipsis" ? <span className="fleet-pagination__ellipsis" key={`ellipsis-${index}`}>…</span> : <button aria-current={currentPage === item ? "page" : undefined} className={currentPage === item ? "fleet-pagination__page fleet-pagination__page--active" : "fleet-pagination__page"} key={item} onClick={() => setCurrentPage(item)} type="button">{item}</button>)}
                        <button aria-label="Página siguiente" className="icon-button" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} type="button">
                          <ChevronRight aria-hidden="true" size={17} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </section>
            </div>
              </>
            )}
          </section>
        )}
      </main>

      {feedback ? <div className="toast">{feedback}</div> : null}

      {formState ? (
        <VehicleForm
          error={saveError}
          isSaving={isSaving}
          mode={formState.mode}
          onClose={() => setFormState(null)}
          onSubmit={(payload) =>
            formState.mode === "create" ? handleCreateVehicle(payload) : handleUpdateVehicle(formState.vehicle.id, payload)
          }
          vehicle={formState.mode === "edit" ? formState.vehicle : undefined}
          vehicles={vehicles}
        />
      ) : null}
    </div>
  )
}

export default App
