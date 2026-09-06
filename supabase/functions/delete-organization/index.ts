import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2"

const ALLOWED_ORIGINS = new Set([
  "https://app.fleetmasterii.com",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
])

const STORAGE_BUCKET = "vehicle-documents"
const STORAGE_PAGE_SIZE = 100
const STORAGE_REMOVE_BATCH_SIZE = 100

class DeletionError extends Error {
  status: number
  code: string

  constructor(code: string, status: number) {
    super(code)
    this.code = code
    this.status = status
  }
}

const SAFE_MESSAGES: Record<string, string> = {
  invalid_request: "No se pudo identificar la empresa seleccionada.",
  unauthorized: "Tu sesión ya no es válida. Inicia sesión nuevamente.",
  permission_denied: "No tienes autorización para eliminar esta empresa.",
  authorization_check_failed: "No fue posible validar la autorización. Inténtalo nuevamente.",
  organization_not_found: "La empresa ya no está disponible.",
  organization_already_deleted: "Esta empresa ya fue eliminada.",
  organization_must_be_suspended: "La empresa debe estar suspendida antes de poder eliminarla.",
  storage_list_failed: "No fue posible preparar los documentos de la empresa para su eliminación.",
  organization_lookup_failed: "No fue posible consultar la empresa. Inténtalo nuevamente.",
  storage_cleanup_failed: "No fue posible limpiar los documentos de la empresa. Inténtalo nuevamente.",
  storage_remove_failed: "No fue posible limpiar los documentos de la empresa. Inténtalo nuevamente.",
  storage_verification_failed: "No se pudo verificar la limpieza de documentos. Inténtalo nuevamente.",
  storage_not_empty: "No se pudo verificar la limpieza de documentos. Inténtalo nuevamente.",
  database_deletion_failed: "No fue posible eliminar la empresa. Inténtalo nuevamente.",
  missing_server_config: "No fue posible completar la eliminación. Inténtalo nuevamente.",
  internal_error: "No fue posible completar la eliminación. Inténtalo nuevamente.",
}

const json = (body: Record<string, unknown>, status: number, origin: string | null, correlationId: string) => {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  })

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin)
    headers.set("Vary", "Origin")
  }

  const code = typeof body.code === "string" ? body.code : status >= 400 ? "internal_error" : "organization_deleted"
  const message = typeof body.message === "string" ? body.message : status < 400 ? "Empresa eliminada correctamente." : SAFE_MESSAGES[code] ?? SAFE_MESSAGES.internal_error
  return new Response(JSON.stringify({ success: status < 400, ...body, code, message, correlationId }), { status, headers })
}

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
})

const log = (correlationId: string, fields: Record<string, string | number | null | undefined>) => {
  console.info(JSON.stringify({ correlation_id: correlationId, ...fields }))
}

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

const bearerToken = (request: Request) => {
  const value = request.headers.get("authorization") ?? ""
  const match = value.match(/^Bearer\s+([^\s]+)$/i)
  return match?.[1] ?? null
}

const parseOrganizationId = (body: unknown) => {
  if (!body || typeof body !== "object") throw new DeletionError("invalid_request", 400)
  const value = (body as Record<string, unknown>).organizationId
  if (typeof value !== "string" || !isUuid(value.trim())) throw new DeletionError("invalid_request", 400)
  return value.trim().toLowerCase()
}

const createCallerClient = (token: string) => {
  const url = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
  if (!url || !anonKey) throw new DeletionError("missing_server_config", 500)

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

const createAdminClient = () => {
  const url = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !serviceRoleKey) throw new DeletionError("missing_server_config", 500)

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const loadOrganization = async (admin: SupabaseClient, organizationId: string) => {
  const { data, error } = await admin
    .from("organizations")
    .select("id, name, status")
    .eq("id", organizationId)
    .maybeSingle()

  if (error) throw new DeletionError("organization_lookup_failed", 500)
  if (!data) throw new DeletionError("organization_not_found", 404)
  return data as { id: string; name: string; status: string }
}

const safeObjectPath = (path: string, prefix: string) => {
  if (!path.startsWith(prefix) || path === prefix) return false
  const segments = path.split("/")
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
}

interface StorageEntry {
  id: string | null
  name: string
}

const listTenantObjects = async (admin: SupabaseClient, organizationId: string) => {
  const prefix = `${organizationId}/`
  const folders = [organizationId]
  const objectPaths: string[] = []

  while (folders.length > 0) {
    const currentPath = folders.shift()!
    let offset = 0

    while (true) {
      const { data, error } = await admin.storage.from(STORAGE_BUCKET).list(currentPath, {
        limit: STORAGE_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      })

      if (error) throw new DeletionError("storage_list_failed", 500)

      for (const entry of (data ?? []) as StorageEntry[]) {
        if (!entry.name || entry.name === "." || entry.name === "..") {
          throw new DeletionError("storage_invalid_entry", 500)
        }

        const fullPath = `${currentPath}/${entry.name}`
        if (!safeObjectPath(fullPath, prefix)) throw new DeletionError("storage_prefix_violation", 500)

        if (entry.id === null) {
          folders.push(fullPath)
        } else {
          objectPaths.push(fullPath)
        }
      }

      if (!data || data.length < STORAGE_PAGE_SIZE) break
      offset += data.length
    }
  }

  return objectPaths
}

const cleanTenantStorage = async (admin: SupabaseClient, organizationId: string, correlationId: string) => {
  const prefix = `${organizationId}/`
  const objectPaths = await listTenantObjects(admin, organizationId)
  log(correlationId, { stage: "storage_enumerated", organization_id: organizationId, object_count: objectPaths.length })

  for (let index = 0; index < objectPaths.length; index += STORAGE_REMOVE_BATCH_SIZE) {
    const batch = objectPaths.slice(index, index + STORAGE_REMOVE_BATCH_SIZE)
    if (batch.some((path) => !safeObjectPath(path, prefix))) {
      throw new DeletionError("storage_prefix_violation", 500)
    }

    const { error } = await admin.storage.from(STORAGE_BUCKET).remove(batch)
    if (error) throw new DeletionError("storage_cleanup_failed", 500)
    log(correlationId, { stage: "storage_deleted", organization_id: organizationId, object_count: batch.length })
  }

  const remaining = await listTenantObjects(admin, organizationId)
  if (remaining.length > 0) throw new DeletionError("storage_verification_failed", 500)
  log(correlationId, { stage: "storage_verified_empty", organization_id: organizationId })
}

const callDeletionRpc = async (admin: SupabaseClient, organizationId: string, deletedBy: string, correlationId: string) => {
  const { data, error } = await admin.rpc("delete_organization_permanently", {
    p_organization_id: organizationId,
    p_deleted_by: deletedBy,
    p_registration_email: null,
  })

  if (error) {
    log(correlationId, {
      stage: "database_deletion",
      organization_id: organizationId,
      actor_id: deletedBy,
      error_code: error.code ?? null,
      error_message: error.message ?? null,
      error_details: error.details ?? null,
      error_hint: error.hint ?? null,
    })
    if (error.message.includes("already been deleted")) throw new DeletionError("organization_already_deleted", 409)
    if (error.message.includes("not found")) throw new DeletionError("organization_not_found", 404)
    throw new DeletionError("database_deletion_failed", 500)
  }

  const result = Array.isArray(data) ? data[0] : data
  if (!result) throw new DeletionError("database_deletion_failed", 500)
  return result as { deleted_organization_id: string; deleted_organization_name: string }
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin")
  const correlationId = crypto.randomUUID()

  log(correlationId, { stage: "request_received", organization_id: null })
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ ok: false, code: "permission_denied" }, 403, origin, correlationId)
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (request.method !== "POST") return json({ ok: false, code: "invalid_request" }, 405, origin, correlationId)

  const token = bearerToken(request)
  if (!token) return json({ ok: false, code: "unauthorized" }, 401, origin, correlationId)

  let organizationId: string
  try {
    organizationId = parseOrganizationId(await request.json())
  } catch (error) {
    if (error instanceof DeletionError) return json({ ok: false, code: error.code }, error.status, origin, correlationId)
    return json({ ok: false, code: "invalid_request" }, 400, origin, correlationId)
  }

  let callerId: string | null = null
  let caller: SupabaseClient
  try {
    caller = createCallerClient(token)
    const { data: userData, error: userError } = await caller.auth.getUser(token)
    if (userError || !userData.user) return json({ ok: false, code: "unauthorized" }, 401, origin, correlationId)
    callerId = userData.user.id
    log(correlationId, { stage: "authenticated", actor_id: callerId, organization_id: organizationId })

    const { data: isAdmin, error: adminCheckError } = await caller.rpc("is_fleetmaster_admin")
    if (adminCheckError) return json({ ok: false, code: "authorization_check_failed" }, 500, origin, correlationId)
    if (!isAdmin) return json({ ok: false, code: "permission_denied" }, 403, origin, correlationId)
    log(correlationId, { stage: "authorized", actor_id: callerId, organization_id: organizationId })
  } catch (error) {
    if (error instanceof DeletionError) return json({ ok: false, code: error.code }, error.status, origin, correlationId)
    return json({ ok: false, code: "internal_error" }, 500, origin, correlationId)
  }

  log(correlationId, { stage: "authenticated_authorized", caller_user_id: callerId, organization_id: organizationId })

  try {
    const admin = createAdminClient()
    const organization = await loadOrganization(admin, organizationId)
    log(correlationId, { stage: "organization_loaded", actor_id: callerId, organization_id: organization.id })
    if (organization.status !== "suspended") {
      log(correlationId, { stage: "organization_status_checked", actor_id: callerId, organization_id: organization.id, error_code: "organization_must_be_suspended" })
      return json({ ok: false, code: "organization_must_be_suspended" }, 409, origin, correlationId)
    }
    log(correlationId, { stage: "organization_status_checked", actor_id: callerId, organization_id: organization.id })
    await cleanTenantStorage(admin, organizationId, correlationId)
    log(correlationId, { stage: "rpc_started", actor_id: callerId, organization_id: organizationId })
    const result = await callDeletionRpc(admin, organizationId, callerId!, correlationId)
    log(correlationId, { stage: "rpc_completed", actor_id: callerId, organization_id: organizationId })
    return json({
      ok: true,
      message: "Empresa eliminada correctamente.",
      organizationId: result.deleted_organization_id,
      organizationName: result.deleted_organization_name,
    }, 200, origin, correlationId)
  } catch (error) {
    const deletionError = error instanceof DeletionError ? error : new DeletionError("internal_error", 500)
    log(correlationId, { stage: "failed", actor_id: callerId, organization_id: organizationId, error_code: deletionError.code })
    return json({ ok: false, code: deletionError.code }, deletionError.status, origin, correlationId)
  }
})
