export const vehicleDocumentTypes = [
  "insurance_policy",
  "registration_card",
  "vehicle_inspection",
  "other",
] as const

export const allowedVehicleDocumentMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const

export type VehicleDocumentType = (typeof vehicleDocumentTypes)[number]
export type VehicleDocumentMimeType = (typeof allowedVehicleDocumentMimeTypes)[number]

export type VehicleInspectionResult = "approved" | "rejected" | "not_applicable"

export interface VehicleDocumentDetails {
  plateNumber?: string | null
  issuingState?: string | null
  verificationResult?: VehicleInspectionResult | null
}

export interface VehicleDocument {
  id: string
  vehicleId: string
  documentType: VehicleDocumentType
  documentNumber: string | null
  issuer: string | null
  validFrom: string | null
  validUntil: string | null
  cost: number | null
  contactName: string | null
  contactPhone: string | null
  notes: string | null
  details: VehicleDocumentDetails
  storageBucket: string
  storagePath: string
  originalFilename: string
  mimeType: VehicleDocumentMimeType
  fileSize: number
  isCurrent: boolean
  createdAt: string
  updatedAt: string
}

export interface InsurancePolicyFormValues {
  issuer: string
  documentNumber: string
  validFrom: string
  validUntil: string
  cost: string
  contactName: string
  contactPhone: string
  notes: string
  file: File | null
}

export interface VehicleDocumentPayload {
  vehicleId: string
  documentType: VehicleDocumentType
  issuer: string
  documentNumber: string
  validFrom: string | null
  validUntil: string | null
  cost: number | null
  contactName: string | null
  contactPhone: string | null
  notes: string | null
  details?: VehicleDocumentDetails
  file: File
}

export type InsurancePolicyPayload = Omit<VehicleDocumentPayload, "documentType" | "details">

export interface RegistrationCardFormValues {
  documentNumber: string
  plateNumber: string
  issuingState: string
  validFrom: string
  validUntil: string
  notes: string
  file: File | null
}

export interface RegistrationCardPayload {
  vehicleId: string
  documentNumber: string
  plateNumber: string | null
  issuingState: string | null
  validFrom: string | null
  validUntil: string | null
  notes: string | null
  file: File
}

export interface VehicleInspectionFormValues {
  validFrom: string
  verificationResult: VehicleInspectionResult | ""
  documentNumber: string
  issuer: string
  validUntil: string
  cost: string
  notes: string
  file: File | null
}

export interface VehicleInspectionPayload {
  vehicleId: string
  validFrom: string
  verificationResult: VehicleInspectionResult
  documentNumber: string | null
  issuer: string | null
  validUntil: string | null
  cost: number | null
  notes: string | null
  file: File
}
