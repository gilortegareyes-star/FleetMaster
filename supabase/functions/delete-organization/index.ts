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

const json = (body: Record<string, unknown>, status: number, origin: string | null) => {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  })

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin)
    headers.set("Vary", "Origin")
  }

  return new Response(JSON.stringify(body), { status, headers })
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

const assertOrganizationExists = async (admin: SupabaseClient, organizationId: string) => {
  const { data, error } = await admin
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle()

  if (error) throw new DeletionError("organization_lookup_failed", 500)
  if (!data) throw new DeletionError("organization_not_found", 404)
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
    if (error) throw new DeletionError("storage_remove_failed", 500)
  }

  const remaining = await listTenantObjects(admin, organizationId)
  if (remaining.length > 0) throw new DeletionError("storage_not_empty", 500)
  log(correlationId, { stage: "storage_verified_empty", organization_id: organizationId })
}

const callDeletionRpc = async (admin: SupabaseClient, organizationId: string, deletedBy: string) => {
  const { data, error } = await admin.rpc("delete_organization_permanently", {
    p_organization_id: organizationId,
    p_deleted_by: deletedBy,
    p_registration_email: null,
  })

  if (error) {
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

  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ ok: false, code: "permission_denied" }, 403, origin)
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (request.method !== "POST") return json({ ok: false, code: "invalid_request" }, 405, origin)

  const token = bearerToken(request)
  if (!token) return json({ ok: false, code: "unauthorized" }, 401, origin)

  let organizationId: string
  try {
    organizationId = parseOrganizationId(await request.json())
  } catch (error) {
    if (error instanceof DeletionError) return json({ ok: false, code: error.code }, error.status, origin)
    return json({ ok: false, code: "invalid_request" }, 400, origin)
  }

  let callerId: string
  let caller: SupabaseClient
  try {
    caller = createCallerClient(token)
    const { data: userData, error: userError } = await caller.auth.getUser(token)
    if (userError || !userData.user) return json({ ok: false, code: "unauthorized" }, 401, origin)
    callerId = userData.user.id

    const { data: isAdmin, error: adminCheckError } = await caller.rpc("is_fleetmaster_admin")
    if (adminCheckError) return json({ ok: false, code: "authorization_check_failed" }, 500, origin)
    if (!isAdmin) return json({ ok: false, code: "permission_denied" }, 403, origin)
  } catch (error) {
    if (error instanceof DeletionError) return json({ ok: false, code: error.code }, error.status, origin)
    return json({ ok: false, code: "internal_error" }, 500, origin)
  }

  log(correlationId, { stage: "authenticated_authorized", caller_user_id: callerId, organization_id: organizationId })

  try {
    const admin = createAdminClient()
    await assertOrganizationExists(admin, organizationId)
    await cleanTenantStorage(admin, organizationId, correlationId)
    const result = await callDeletionRpc(admin, organizationId, callerId)
    log(correlationId, { stage: "database_deleted", organization_id: organizationId })
    return json({
      ok: true,
      organizationId: result.deleted_organization_id,
      organizationName: result.deleted_organization_name,
    }, 200, origin)
  } catch (error) {
    const deletionError = error instanceof DeletionError ? error : new DeletionError("internal_error", 500)
    log(correlationId, { stage: "failed", organization_id: organizationId, error_code: deletionError.code })
    return json({ ok: false, code: deletionError.code }, deletionError.status, origin)
  }
})
