import { getSupabaseClient } from "./supabase"
import {
  allowedVehicleDocumentMimeTypes,
  type InsurancePolicyPayload,
  type RegistrationCardPayload,
  type VehicleDocument,
  type VehicleDocumentDetails,
  type VehicleDocumentMimeType,
  type VehicleDocumentPayload,
  type VehicleDocumentType,
  type VehicleInspectionPayload,
  type CirculationType,
} from "../types/vehicleDocument"
import type { Vehicle } from "../types/vehicle"
import { getDocumentStatus } from "../utils/documentStatus"

interface VehicleDocumentRow {
  id: string
  vehicle_id: string
  document_type: VehicleDocumentType
  circulation_type: CirculationType | null
  document_number: string | null
  issuer: string | null
  valid_from: string | null
  valid_until: string | null
  cost: number | null
  contact_name: string | null
  contact_phone: string | null
  notes: string | null
  details: VehicleDocumentDetails | null
  storage_bucket: string
  storage_path: string
  original_filename: string
  mime_type: VehicleDocumentMimeType
  file_size: number
  is_current: boolean
  created_at: string
  updated_at: string
}

const vehicleDocumentsBucket = "vehicle-documents"
const maxVehicleDocumentFileSize = 10 * 1024 * 1024

const toVehicleDocument = (row: VehicleDocumentRow): VehicleDocument => ({
  id: row.id,
  vehicleId: row.vehicle_id,
  documentType: row.document_type,
  circulationType: row.circulation_type,
  documentNumber: row.document_number,
  issuer: row.issuer,
  validFrom: row.valid_from,
  validUntil: row.valid_until,
  cost: row.cost,
  contactName: row.contact_name,
  contactPhone: row.contact_phone,
  notes: row.notes,
  details: row.details ?? {},
  storageBucket: row.storage_bucket,
  storagePath: row.storage_path,
  originalFilename: row.original_filename,
  mimeType: row.mime_type,
  fileSize: row.file_size,
  isCurrent: row.is_current,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const friendlyDocumentError = (message: string) => {
  const normalized = message.toLowerCase()

  if (normalized.includes("missing-supabase-config")) {
    return "Configura la conexión a Supabase para administrar documentos."
  }

  if (normalized.includes("vehicle_documents_insurance_required_fields")) {
    return "Aseguradora, número de póliza y fin de vigencia son obligatorios."
  }

  if (normalized.includes("vehicle_documents_vehicle_id_fkey")) {
    return "La unidad seleccionada no existe o no está disponible."
  }

  if (normalized.includes("mime_type") || normalized.includes("not allowed") || normalized.includes("invalid mime")) {
    return "El archivo debe ser PDF, JPG, JPEG o PNG."
  }

  if (normalized.includes("file_size") || normalized.includes("exceeded")) {
    return "El archivo no debe superar 10 MB."
  }

  if (normalized.includes("duplicate") || normalized.includes("already exists")) {
    return "No se pudo guardar el archivo porque ya existe una ruta de almacenamiento igual."
  }

  return "No se pudo completar la operación documental. Intenta de nuevo."
}

const storageFolderByDocumentType: Record<VehicleDocumentType, string> = {
  insurance_policy: "insurance_policy",
  registration_card: "registration_card",
  vehicle_inspection: "vehicle_inspection",
  other: "other",
}

const getFileExtension = (file: File) => {
  const extensionFromName = file.name.split(".").pop()?.toLowerCase()

  if (extensionFromName && ["pdf", "jpg", "jpeg", "png"].includes(extensionFromName)) {
    return extensionFromName
  }

  if (file.type === "application/pdf") {
    return "pdf"
  }

  if (file.type === "image/png") {
    return "png"
  }

  return "jpg"
}

export const validateVehicleDocumentFile = (file: File) => {
  if (!allowedVehicleDocumentMimeTypes.includes(file.type as VehicleDocumentMimeType)) {
    throw new Error("El archivo debe ser PDF, JPG, JPEG o PNG.")
  }

  if (file.size <= 0 || file.size > maxVehicleDocumentFileSize) {
    throw new Error("El archivo no debe superar 10 MB.")
  }
}

export const getCurrentVehicleDocuments = async (vehicleId: string) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("vehicle_documents")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .eq("is_current", true)

    if (error) {
      throw error
    }

    return (data ?? []).map((row) => toVehicleDocument(row as VehicleDocumentRow))
  } catch (error) {
    throw new Error(friendlyDocumentError(error instanceof Error ? error.message : String(error)))
  }
}

export const getVehiclesWithPendingRequiredDocuments = async (vehicles: Vehicle[]) => {
  if (vehicles.length === 0) {
    return new Set<string>()
  }

  try {
    const vehicleIds = vehicles.map((vehicle) => vehicle.id)
    const { data, error } = await getSupabaseClient()
      .from("vehicle_documents")
      .select("*")
      .in("vehicle_id", vehicleIds)
      .in("document_type", ["insurance_policy", "registration_card"])
      .eq("is_current", true)

    if (error) {
      throw error
    }

    const completeDocumentsByVehicle = new Map<string, Set<string>>()

    for (const row of (data ?? []) as VehicleDocumentRow[]) {
      const document = toVehicleDocument(row)
      if (document.documentType !== "insurance_policy" && document.documentType !== "registration_card") {
        continue
      }

      const status = getDocumentStatus(document)
      const isComplete =
        document.documentType === "insurance_policy"
          ? ["Vigente", "Próximo a vencer"].includes(status.label)
          : status.label !== "Vencido"

      if (isComplete) {
        const completeDocuments = completeDocumentsByVehicle.get(row.vehicle_id) ?? new Set()
        completeDocuments.add(
          document.documentType === "insurance_policy"
            ? "insurance_policy"
            : document.circulationType ?? "legacy",
        )
        completeDocumentsByVehicle.set(row.vehicle_id, completeDocuments)
      }
    }

    return new Set(
      vehicles
        .filter((vehicle) => {
          const insuranceComplete = completeDocumentsByVehicle.get(vehicle.id)?.has("insurance_policy") ?? false
          const requiredCirculationTypes = [
            vehicle.stateLicensePlate?.trim() ? "state" : null,
            vehicle.federalLicensePlate?.trim() ? "federal" : null,
          ].filter((type): type is "state" | "federal" => type !== null)
          const registrationComplete =
            requiredCirculationTypes.length > 0 &&
            requiredCirculationTypes.every((type) => completeDocumentsByVehicle.get(vehicle.id)?.has(type) ?? false)

          return !insuranceComplete || !registrationComplete
        })
        .map((vehicle) => vehicle.id),
    )
  } catch (error) {
    throw new Error(friendlyDocumentError(error instanceof Error ? error.message : String(error)))
  }
}

export const createVehicleDocument = async (payload: VehicleDocumentPayload) => {
  try {
    validateVehicleDocumentFile(payload.file)

    const extension = getFileExtension(payload.file)
    const storagePath = `${payload.vehicleId}/${storageFolderByDocumentType[payload.documentType]}/${crypto.randomUUID()}.${extension}`
    const supabase = getSupabaseClient()

    const { error: uploadError } = await supabase.storage
      .from(vehicleDocumentsBucket)
      .upload(storagePath, payload.file, {
        contentType: payload.file.type,
        upsert: false,
      })

    if (uploadError) {
      throw uploadError
    }

    const { data, error } = await supabase
      .rpc("create_vehicle_document_version", {
        p_vehicle_id: payload.vehicleId,
        p_document_type: payload.documentType,
        p_document_number: payload.documentNumber,
        p_issuer: payload.issuer,
        p_valid_from: payload.validFrom,
        p_valid_until: payload.validUntil,
        p_cost: payload.cost,
        p_contact_name: payload.contactName,
        p_contact_phone: payload.contactPhone,
        p_notes: payload.notes,
        p_storage_path: storagePath,
        p_original_filename: payload.file.name,
        p_mime_type: payload.file.type,
        p_file_size: payload.file.size,
        p_details: payload.details ?? {},
        p_circulation_type: payload.circulationType ?? null,
      })
      .single()

    if (error) {
      throw error
    }

    return toVehicleDocument(data as VehicleDocumentRow)
  } catch (error) {
    throw new Error(friendlyDocumentError(error instanceof Error ? error.message : String(error)))
  }
}

export const createInsurancePolicy = async (payload: InsurancePolicyPayload) => {
  return createVehicleDocument({
    ...payload,
    documentType: "insurance_policy",
    details: {},
  })
}

export const createRegistrationCard = async (payload: RegistrationCardPayload) => {
  return createVehicleDocument({
    vehicleId: payload.vehicleId,
    documentType: "registration_card",
    circulationType: payload.circulationType,
    documentNumber: payload.documentNumber,
    issuer: payload.issuingState ?? "",
    validFrom: payload.validFrom,
    validUntil: payload.validUntil ?? "",
    cost: null,
    contactName: null,
    contactPhone: null,
    notes: payload.notes,
    details: {
      plateNumber: payload.plateNumber,
      issuingState: payload.issuingState,
    },
    file: payload.file,
  })
}

export const createVehicleInspection = async (payload: VehicleInspectionPayload) => {
  return createVehicleDocument({
    vehicleId: payload.vehicleId,
    documentType: "vehicle_inspection",
    documentNumber: payload.documentNumber ?? "",
    issuer: payload.issuer ?? "",
    validFrom: payload.validFrom,
    validUntil: payload.validUntil ?? "",
    cost: payload.cost,
    contactName: null,
    contactPhone: null,
    notes: payload.notes,
    details: {
      verificationResult: payload.verificationResult,
    },
    file: payload.file,
  })
}

export const createVehicleDocumentSignedUrl = async (storagePath: string) => {
  try {
    const { data, error } = await getSupabaseClient()
      .storage
      .from(vehicleDocumentsBucket)
      .createSignedUrl(storagePath, 10 * 60)

    if (error) {
      throw error
    }

    return data.signedUrl
  } catch (error) {
    throw new Error(friendlyDocumentError(error instanceof Error ? error.message : String(error)))
  }
}
