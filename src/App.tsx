import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, CarFront, Home, LogOut, Plus, Search, Settings2, SlidersHorizontal, UserRound } from "lucide-react"
import "./App.css"
import { VehicleCard } from "./components/VehicleCard"
import { VehicleDetail } from "./components/VehicleDetail"
import { VehicleForm } from "./components/VehicleForm"
import { getVehiclesWithPendingRequiredDocuments } from "./services/vehicleDocuments"
import { createVehicle, listVehicles, updateVehicle } from "./services/vehicles"
import { isSupabaseConfigured } from "./services/supabase"
import { vehicleStatuses, type Vehicle, type VehicleFilters, type VehiclePayload } from "./types/vehicle"
import { useAuth } from "./contexts/AuthContext"
import { AdminOrganizationsPage } from "./components/AdminOrganizationsPage"
import { useOrganization } from "./contexts/OrganizationContext"

type ActiveView = "inicio" | "unidades" | "administracion"
type FormState = { mode: "create" } | { mode: "edit"; vehicle: Vehicle } | null

const initialFilters: VehicleFilters = {
  query: "",
  status: "Todos",
  brand: "Todas",
  year: "Todos",
}

function App() {
  const { signOut, user } = useAuth()
  const { activeOrganization, clearActiveOrganization } = useOrganization()
  const [activeView, setActiveView] = useState<ActiveView>("unidades")
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [isVehicleCenterOpen, setIsVehicleCenterOpen] = useState(false)
  const [filters, setFilters] = useState<VehicleFilters>(initialFilters)
  const [formState, setFormState] = useState<FormState>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [pendingDocumentVehicleIds, setPendingDocumentVehicleIds] = useState<Set<string> | null>(null)

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
        setSelectedVehicleId((current) => current ?? items[0]?.id ?? null)
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
    setFilters(initialFilters)
    setFormState(null)
    setLoadError(null)
    setSaveError(null)
    setFeedback(null)
    setPendingDocumentVehicleIds(null)
  }, [activeOrganization?.id])

  const vehicleIdsKey = useMemo(() => vehicles.map((vehicle) => vehicle.id).join(","), [vehicles])

  useEffect(() => {
    let isActive = true
    const vehicleIds = vehicleIdsKey ? vehicleIdsKey.split(",") : []

    setPendingDocumentVehicleIds(null)

    if (vehicleIds.length === 0) {
      setPendingDocumentVehicleIds(new Set())
      return () => {
        isActive = false
      }
    }

    const loadDocumentStatus = async () => {
      try {
        const pendingVehicleIds = await getVehiclesWithPendingRequiredDocuments(vehicles)
        if (isActive) {
          setPendingDocumentVehicleIds(pendingVehicleIds)
        }
      } catch {
        if (isActive) {
          setPendingDocumentVehicleIds(new Set())
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

  const filterOptions = useMemo(() => {
    const brands = Array.from(new Set(vehicles.map((vehicle) => vehicle.brand))).sort((a, b) => a.localeCompare(b))
    const years = Array.from(new Set(vehicles.map((vehicle) => String(vehicle.year)))).sort((a, b) => Number(b) - Number(a))

    return { brands, years }
  }, [vehicles])

  const filteredVehicles = useMemo(() => {
    const query = filters.query.trim().toLowerCase()

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
      const matchesStatus = filters.status === "Todos" || vehicle.status === filters.status
      const matchesBrand = filters.brand === "Todas" || vehicle.brand === filters.brand
      const matchesYear = filters.year === "Todos" || String(vehicle.year) === filters.year

      return matchesQuery && matchesStatus && matchesBrand && matchesYear
    })
  }, [filters, vehicles])

  const selectedVehicle = useMemo(() => {
    return vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null
  }, [vehicles, selectedVehicleId])

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
            className={activeView === "inicio" ? "nav-item nav-item--active" : "nav-item"}
            onClick={() => setActiveView("inicio")}
            type="button"
          >
            <Home aria-hidden="true" size={19} />
            Inicio
          </button>
          <button
            className={activeView === "unidades" ? "nav-item nav-item--active" : "nav-item"}
            onClick={() => {
              setActiveView("unidades")
              setIsVehicleCenterOpen(false)
            }}
            type="button"
          >
            <CarFront aria-hidden="true" size={19} />
            Flota
          </button>
          <button
            className={activeView === "administracion" ? "nav-item nav-item--active" : "nav-item"}
            onClick={() => setActiveView("administracion")}
            type="button"
          >
            <Settings2 aria-hidden="true" size={19} />
            Administración
          </button>
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
        {activeOrganization ? <div className="active-organization-bar"><span>Administrando: <strong>{activeOrganization.name}</strong></span><button className="button button--secondary" onClick={() => { setActiveView("administracion"); clearActiveOrganization() }} type="button"><ArrowLeft aria-hidden="true" size={16} /> Empresas</button></div> : null}
        {activeView === "administracion" ? (
          <AdminOrganizationsPage onEnterOrganization={() => setActiveView("unidades")} onFeedback={setFeedback} />
        ) : activeView === "inicio" ? (
          <section className="home-panel">
            <p>Inicio</p>
            <h1>FleetMaster II</h1>
            <span>La administracion de tu flotilla comenzara desde el expediente de cada unidad.</span>
          </section>
        ) : (
          <section className={isVehicleCenterOpen && selectedVehicle ? "unit-center-page" : "units-page"}>
            {isVehicleCenterOpen && selectedVehicle ? (
              <VehicleDetail
                onBackToFleet={() => setIsVehicleCenterOpen(false)}
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
            </section>

            <div className="fleet-layout">
              <section className="units-panel">
                <div className="search-panel">
                  <label className="search-box">
                    <Search aria-hidden="true" size={18} />
                    <input
                      onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                      placeholder="Buscar por codigo, marca, modelo, placas o VIN"
                      value={filters.query}
                    />
                  </label>
                  <div className="filters-row" aria-label="Filtros de unidades">
                    <SlidersHorizontal aria-hidden="true" size={18} />
                    <select
                      onChange={(event) =>
                        setFilters((current) => ({ ...current, status: event.target.value as VehicleFilters["status"] }))
                      }
                      value={filters.status}
                    >
                      <option value="Todos">Todos los estatus</option>
                      {vehicleStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <select
                      onChange={(event) => setFilters((current) => ({ ...current, brand: event.target.value }))}
                      value={filters.brand}
                    >
                      <option value="Todas">Todas las marcas</option>
                      {filterOptions.brands.map((brand) => (
                        <option key={brand} value={brand}>
                          {brand}
                        </option>
                      ))}
                    </select>
                    <select
                      onChange={(event) => setFilters((current) => ({ ...current, year: event.target.value }))}
                      value={filters.year}
                    >
                      <option value="Todos">Todos los años</option>
                      {filterOptions.years.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
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
                  <div className="vehicles-list">
                    {filteredVehicles.map((vehicle) => (
                      <VehicleCard
                        hasPendingDocuments={pendingDocumentVehicleIds?.has(vehicle.id) ?? false}
                        isSelected={selectedVehicleId === vehicle.id}
                        key={vehicle.id}
                        onSelect={() => {
                          setSelectedVehicleId(vehicle.id)
                          setIsVehicleCenterOpen(true)
                        }}
                        vehicle={vehicle}
                      />
                    ))}
                  </div>
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
