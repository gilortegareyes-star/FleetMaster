import { Check, ChevronDown, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  fuelTypes,
  transmissionTypes,
  vehicleStatuses,
  vehicleTypes,
  type FuelType,
  type Vehicle,
  type VehicleFormValues,
  type VehiclePayload,
} from "../types/vehicle"

type VehicleFormErrors = Partial<Record<keyof VehicleFormValues, string>>

interface VehicleFormProps {
  mode: "create" | "edit"
  vehicle?: Vehicle
  vehicles: Vehicle[]
  isSaving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (payload: VehiclePayload) => Promise<void>
}

const currentYear = new Date().getFullYear()
const minVehicleYear = 1950
const maxVehicleYear = currentYear + 1
const tankFuelTypes = new Set<FuelType>(["Gasolina", "Diésel", "Gas LP", "Gas Natural"])

const emptyValues: VehicleFormValues = {
  internalCode: "", brand: "", model: "", version: "", year: "", vin: "", licensePlate: "",
  stateLicensePlate: "", federalLicensePlate: "", engineNumber: "", color: "", fuelType: "", fuelTypes: [],
  tankCapacityLiters: "", acquisitionDate: "", acquisitionPrice: "", vehicleType: "", transmissionType: "",
  loadCapacityKg: "", currentMileage: "", status: "Activo",
}

const valuesFromVehicle = (vehicle?: Vehicle): VehicleFormValues => {
  if (!vehicle) return emptyValues
  return {
    ...emptyValues,
    internalCode: vehicle.internalCode, brand: vehicle.brand, model: vehicle.model, version: vehicle.version ?? "",
    year: String(vehicle.year), vin: vehicle.vin, licensePlate: vehicle.licensePlate ?? "",
    stateLicensePlate: vehicle.stateLicensePlate ?? vehicle.licensePlate ?? "", federalLicensePlate: vehicle.federalLicensePlate ?? "",
    engineNumber: vehicle.engineNumber ?? "", color: vehicle.color ?? "", fuelType: vehicle.fuelType ?? "", fuelTypes: vehicle.fuelTypes,
    tankCapacityLiters: vehicle.tankCapacityLiters === null ? "" : String(vehicle.tankCapacityLiters), acquisitionDate: vehicle.acquisitionDate ?? "",
    acquisitionPrice: vehicle.acquisitionPrice === null ? "" : String(vehicle.acquisitionPrice), vehicleType: vehicle.vehicleType ?? "",
    transmissionType: vehicle.transmissionType ?? "", loadCapacityKg: vehicle.loadCapacityKg === null ? "" : String(vehicle.loadCapacityKg),
    currentMileage: String(vehicle.currentMileage), status: vehicle.status,
  }
}

const normalize = (value: string) => value.trim().toLowerCase()
const parseNumber = (value: string) => (value.trim() === "" ? null : Number(value))

export function VehicleForm({ mode, vehicle, vehicles, isSaving, error, onClose, onSubmit }: VehicleFormProps) {
  const [values, setValues] = useState<VehicleFormValues>(() => valuesFromVehicle(vehicle))
  const [errors, setErrors] = useState<VehicleFormErrors>({})
  const [isFuelMenuOpen, setIsFuelMenuOpen] = useState(false)
  const fuelMenuRef = useRef<HTMLDivElement>(null)
  const isCreate = mode === "create"
  const usesTank = useMemo(() => values.fuelTypes.some((fuel) => tankFuelTypes.has(fuel)), [values.fuelTypes])

  useEffect(() => {
    if (!isFuelMenuOpen) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!fuelMenuRef.current?.contains(event.target as Node)) setIsFuelMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFuelMenuOpen(false)
    }
    document.addEventListener("mousedown", closeOnOutsideClick)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [isFuelMenuOpen])

  const updateValue = <K extends keyof VehicleFormValues>(field: K, value: VehicleFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const toggleFuel = (fuel: FuelType) => {
    const next = values.fuelTypes.includes(fuel) ? values.fuelTypes.filter((item) => item !== fuel) : [...values.fuelTypes, fuel]
    setValues((current) => ({ ...current, fuelTypes: next, tankCapacityLiters: next.some((item) => tankFuelTypes.has(item)) ? current.tankCapacityLiters : "" }))
    setErrors((current) => ({ ...current, fuelTypes: undefined, tankCapacityLiters: undefined }))
  }

  const validate = () => {
    const next: VehicleFormErrors = {}
    const year = Number(values.year)
    const mileage = parseNumber(values.currentMileage)
    const tank = parseNumber(values.tankCapacityLiters)
    const load = parseNumber(values.loadCapacityKg)
    const duplicateCode = vehicles.some((item) => item.id !== vehicle?.id && normalize(item.internalCode) === normalize(values.internalCode))
    const duplicateVin = vehicles.some((item) => item.id !== vehicle?.id && normalize(item.vin) === normalize(values.vin))
    if (!values.internalCode.trim()) next.internalCode = "El número económico es obligatorio."
    else if (duplicateCode) next.internalCode = "Ya existe una unidad con este número económico."
    if (!values.vin.trim()) next.vin = "El VIN / número de serie es obligatorio."
    else if (duplicateVin) next.vin = "Ya existe una unidad con este VIN."
    if (!values.brand.trim()) next.brand = "La marca es obligatoria."
    if (!values.model.trim()) next.model = "El modelo es obligatorio."
    if (!values.year.trim()) next.year = "El año es obligatorio."
    else if (!Number.isInteger(year) || year < minVehicleYear || year > maxVehicleYear) next.year = `Usa un año entre ${minVehicleYear} y ${maxVehicleYear}.`
    if (isCreate && !values.vehicleType) next.vehicleType = "Selecciona el tipo de vehículo."
    if (isCreate && values.fuelTypes.length === 0) next.fuelTypes = "Selecciona al menos una fuente de energía."
    if (isCreate && !values.transmissionType) next.transmissionType = "Selecciona la transmisión."
    if (!values.currentMileage.trim()) next.currentMileage = "El kilometraje inicial es obligatorio."
    else if (mileage === null || !Number.isInteger(mileage) || mileage < 0) next.currentMileage = "Ingresa un kilometraje entero mayor o igual a 0."
    if (usesTank && tank !== null && (!Number.isFinite(tank) || tank < 0)) next.tankCapacityLiters = "La capacidad debe ser mayor o igual a 0."
    if (load !== null && (!Number.isInteger(load) || load < 0)) next.loadCapacityKg = "La capacidad debe ser un entero mayor o igual a 0."
    if (!values.status) next.status = "Selecciona el estatus."
    setErrors(next)
    return next
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next = validate()
    if (Object.keys(next).length > 0 || !values.status) return
    const selectedFuelTypes = isCreate ? values.fuelTypes : values.fuelTypes.length ? values.fuelTypes : values.fuelType ? [values.fuelType] : []
    await onSubmit({
      internalCode: values.internalCode, brand: values.brand, model: values.model, version: values.version.trim() || null,
      year: Number(values.year), vin: values.vin, ...(isCreate ? {} : { licensePlate: values.licensePlate.trim() || null }),
      stateLicensePlate: values.stateLicensePlate.trim() || null, federalLicensePlate: values.federalLicensePlate.trim() || null,
      engineNumber: values.engineNumber.trim() || null, color: values.color.trim() || null, ...(isCreate ? {} : { fuelType: values.fuelType || null }),
      fuelTypes: selectedFuelTypes, tankCapacityLiters: usesTank ? parseNumber(values.tankCapacityLiters) : null,
      acquisitionDate: values.acquisitionDate || null, acquisitionPrice: parseNumber(values.acquisitionPrice), vehicleType: values.vehicleType || null,
      transmissionType: values.transmissionType || null, loadCapacityKg: parseNumber(values.loadCapacityKg), currentMileage: Number(values.currentMileage), status: values.status,
    })
  }

  return (
    <div aria-modal="true" className={`modal-backdrop ${isCreate ? "modal-backdrop--wide" : ""}`} role="dialog">
      <form className={`vehicle-form ${isCreate ? "vehicle-form--registration" : ""}`} onSubmit={handleSubmit}>
        <header className="vehicle-form__header"><div><p>{isCreate ? "Expediente maestro de la unidad" : "Unidades"}</p><h2>{isCreate ? "Registrar nueva unidad" : `Editar ${vehicle?.internalCode ?? "unidad"}`}</h2></div><button aria-label="Cerrar formulario" className="icon-button" onClick={onClose} type="button"><X aria-hidden="true" size={20} /></button></header>
        {error ? <div className="form-banner">{error}</div> : null}
        <section className="form-section"><h3>{isCreate ? "Datos de la unidad" : "Identificación"}</h3>{isCreate ? <p className="form-section__hint">Los campos con * son obligatorios.</p> : null}<div className="form-grid">
          <Field error={errors.internalCode} hint={isCreate ? "Identificador único de la unidad" : undefined} label={isCreate ? "Número económico *" : "Código interno *"}><input autoFocus onChange={(event) => updateValue("internalCode", event.target.value)} placeholder="G1" value={values.internalCode} /></Field>
          <Field error={errors.vin} label="VIN / Número de serie *"><input onChange={(event) => updateValue("vin", event.target.value)} value={values.vin} /></Field>
          {isCreate ? <><Field label="Placa estatal"><input onChange={(event) => updateValue("stateLicensePlate", event.target.value)} placeholder="ABC-123-A" value={values.stateLicensePlate} /></Field><Field label="Placa federal"><input onChange={(event) => updateValue("federalLicensePlate", event.target.value)} placeholder="000-AA-0" value={values.federalLicensePlate} /></Field></> : <Field label="Placas"><input onChange={(event) => updateValue("licensePlate", event.target.value)} value={values.licensePlate} /></Field>}
          <Field error={errors.brand} label="Marca *"><input onChange={(event) => updateValue("brand", event.target.value)} placeholder="Mazda" value={values.brand} /></Field><Field error={errors.model} label="Modelo *"><input onChange={(event) => updateValue("model", event.target.value)} placeholder="3" value={values.model} /></Field><Field error={errors.year} label="Año *"><input inputMode="numeric" onChange={(event) => updateValue("year", event.target.value)} placeholder="2026" value={values.year} /></Field>
          {isCreate ? <Field error={errors.vehicleType} label="Tipo de vehículo *"><select onChange={(event) => updateValue("vehicleType", event.target.value as VehicleFormValues["vehicleType"])} value={values.vehicleType}><option value="">Seleccionar</option>{vehicleTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field> : <Field label="Color"><input onChange={(event) => updateValue("color", event.target.value)} value={values.color} /></Field>}
        </div></section>
        <section className="form-section"><h3>{isCreate ? "Especificaciones técnicas" : "Características"}</h3>{isCreate ? <div className="form-grid"><Field error={errors.fuelTypes} label="Tipo de combustible / energía *"><div className="fuel-combobox" ref={fuelMenuRef}><button aria-expanded={isFuelMenuOpen} aria-haspopup="listbox" className={`fuel-trigger ${isFuelMenuOpen ? "fuel-trigger--open" : ""}`} onClick={() => setIsFuelMenuOpen((current) => !current)} type="button"><span>{values.fuelTypes.length ? values.fuelTypes.join(", ") : "Seleccionar combustible"}</span><ChevronDown aria-hidden="true" size={17} /></button>{isFuelMenuOpen ? <div aria-label="Opciones de combustible" className="fuel-menu" role="listbox">{fuelTypes.map((fuel) => { const selected = values.fuelTypes.includes(fuel); return <button aria-selected={selected} className={`fuel-menu__option ${selected ? "fuel-menu__option--selected" : ""}`} key={fuel} onClick={() => toggleFuel(fuel)} role="option" type="button"><span>{fuel}</span>{selected ? <Check aria-hidden="true" size={16} /> : null}</button> })}</div> : null}</div></Field>{usesTank ? <Field error={errors.tankCapacityLiters} label="Capacidad del tanque (L)"><div className="with-unit"><input inputMode="decimal" onChange={(event) => updateValue("tankCapacityLiters", event.target.value)} placeholder="51" value={values.tankCapacityLiters} /><span>L</span></div></Field> : null}<Field error={errors.transmissionType} label="Tipo de transmisión *"><select onChange={(event) => updateValue("transmissionType", event.target.value as VehicleFormValues["transmissionType"])} value={values.transmissionType}><option value="">Seleccionar transmisión</option>{transmissionTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field><Field error={errors.loadCapacityKg} label="Capacidad de carga"><div className="with-unit"><input inputMode="numeric" onChange={(event) => updateValue("loadCapacityKg", event.target.value)} placeholder="1500" value={values.loadCapacityKg} /><span>kg</span></div></Field></div> : <div className="form-grid"><Field error={errors.fuelType} label="Tipo de combustible *"><select onChange={(event) => updateValue("fuelType", event.target.value as VehicleFormValues["fuelType"])} value={values.fuelType}><option value="">Seleccionar</option>{fuelTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field><Field error={errors.tankCapacityLiters} label="Capacidad de tanque"><input inputMode="decimal" onChange={(event) => updateValue("tankCapacityLiters", event.target.value)} value={values.tankCapacityLiters} /></Field></div>}</section>
        {isCreate ? <section className="form-section"><h3>Estado inicial</h3><div className="form-grid"><Field error={errors.currentMileage} label="Kilometraje inicial *"><div className="with-unit"><input inputMode="numeric" onChange={(event) => updateValue("currentMileage", event.target.value)} placeholder="70250" value={values.currentMileage} /><span>km</span></div></Field><Field error={errors.status} label="Estatus *"><select onChange={(event) => updateValue("status", event.target.value as VehicleFormValues["status"])} value={values.status}><option value="Activo">Activo</option><option value="Inactivo">Inactivo</option></select></Field></div></section> : <section className="form-section"><h3>Operación</h3><div className="form-grid"><Field error={errors.currentMileage} label="Kilometraje actual *"><input inputMode="numeric" onChange={(event) => updateValue("currentMileage", event.target.value)} value={values.currentMileage} /></Field><Field error={errors.status} label="Estatus *"><select onChange={(event) => updateValue("status", event.target.value as VehicleFormValues["status"])} value={values.status}>{vehicleStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field></div></section>}
        <footer className="vehicle-form__footer"><button className="button button--secondary" onClick={onClose} type="button">Cancelar</button><button className="button button--primary" disabled={isSaving} type="submit">{isSaving ? "Guardando..." : isCreate ? "Registrar unidad" : "Guardar unidad"}</button></footer>
      </form>
    </div>
  )
}

function Field({ children, error, hint, label }: { children: React.ReactNode; error?: string; hint?: string; label: string }) {
  return <label className="field"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}{error ? <em>{error}</em> : null}</label>
}
