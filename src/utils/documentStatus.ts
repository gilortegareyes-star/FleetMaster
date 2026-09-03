import type { VehicleDocument } from "../types/vehicleDocument"

export type DocumentStatusTone = "neutral" | "current" | "warning" | "expired"

export interface DocumentStatus {
  label: string
  tone: DocumentStatusTone
}

const expirationWarningDays = 30
const dayInMilliseconds = 24 * 60 * 60 * 1000

const todayUtc = () => {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
}

export const getDocumentStatus = (document: VehicleDocument | null): DocumentStatus => {
  if (!document) {
    return { label: "Sin registrar", tone: "neutral" }
  }

  if (!document.validUntil) {
    return { label: "Registrado", tone: "neutral" }
  }

  const validUntilTime = Date.parse(`${document.validUntil}T00:00:00Z`)

  if (Number.isNaN(validUntilTime)) {
    return { label: "Registrado", tone: "neutral" }
  }

  const daysUntilExpiration = Math.ceil((validUntilTime - todayUtc()) / dayInMilliseconds)

  if (daysUntilExpiration < 0) {
    return { label: "Vencido", tone: "expired" }
  }

  if (daysUntilExpiration <= expirationWarningDays) {
    return { label: "Próximo a vencer", tone: "warning" }
  }

  return { label: "Vigente", tone: "current" }
}
