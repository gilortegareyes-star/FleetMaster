import { Edit3, Fuel, Gauge, Hash, Palette, ReceiptText } from "lucide-react"
import { StatusBadge } from "./StatusBadge"
import type { Vehicle } from "../types/vehicle"
import { displayValue, formatCurrency, formatDate, formatMileage } from "../utils/formatters"

interface VehicleDetailProps {
  vehicle: Vehicle
  onEdit: () => void
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function VehicleDetail({ vehicle, onEdit }: VehicleDetailProps) {
  const fullName = [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(" ")

  return (
    <article className="vehicle-detail">
      <header className="vehicle-detail__hero">
        <div>
          <div className="vehicle-detail__eyebrow">
            <span>Unidades</span>
            <span>/</span>
            <strong>{vehicle.internalCode}</strong>
          </div>
          <h2>{vehicle.internalCode}</h2>
          <p>{fullName}</p>
          <span>{vehicle.year}</span>
        </div>
        <div className="vehicle-detail__summary">
          <StatusBadge status={vehicle.status} />
          <strong>{formatMileage(vehicle.currentMileage)} km</strong>
          <button className="button button--secondary" onClick={onEdit} type="button">
            <Edit3 aria-hidden="true" size={17} />
            Editar
          </button>
        </div>
      </header>

      <div className="detail-grid">
        <section className="detail-section">
          <div className="section-title">
            <Hash aria-hidden="true" size={18} />
            <h3>Datos generales</h3>
          </div>
          <DetailItem label="Código interno" value={vehicle.internalCode} />
          <DetailItem label="Marca" value={vehicle.brand} />
          <DetailItem label="Modelo" value={vehicle.model} />
          <DetailItem label="Versión" value={displayValue(vehicle.version)} />
          <DetailItem label="Año" value={String(vehicle.year)} />
          <DetailItem label="VIN / número de serie" value={vehicle.vin} />
          <DetailItem label="Placas" value={displayValue(vehicle.licensePlate)} />
          <DetailItem label="Número de motor" value={displayValue(vehicle.engineNumber)} />
          <DetailItem label="Color" value={displayValue(vehicle.color)} />
        </section>

        <section className="detail-section">
          <div className="section-title">
            <Fuel aria-hidden="true" size={18} />
            <h3>Características</h3>
          </div>
          <DetailItem label="Tipo de combustible" value={vehicle.fuelType} />
          <DetailItem
            label="Capacidad del tanque"
            value={displayValue(vehicle.tankCapacityLiters, " L")}
          />
        </section>

        <section className="detail-section">
          <div className="section-title">
            <ReceiptText aria-hidden="true" size={18} />
            <h3>Adquisicion</h3>
          </div>
          <DetailItem label="Fecha de adquisición" value={formatDate(vehicle.acquisitionDate)} />
          <DetailItem label="Precio de adquisición" value={formatCurrency(vehicle.acquisitionPrice)} />
        </section>

        <section className="detail-section">
          <div className="section-title">
            <Gauge aria-hidden="true" size={18} />
            <h3>Operación</h3>
          </div>
          <DetailItem label="Kilometraje actual" value={`${formatMileage(vehicle.currentMileage)} km`} />
          <DetailItem label="Estatus" value={vehicle.status} />
        </section>

        <section className="detail-section detail-section--soft">
          <div className="section-title">
            <Palette aria-hidden="true" size={18} />
            <h3>Identificación visual</h3>
          </div>
          <p>
            {displayValue(vehicle.color)} · {displayValue(vehicle.licensePlate)} ·{" "}
            {displayValue(vehicle.engineNumber)}
          </p>
        </section>
      </div>
    </article>
  )
}
