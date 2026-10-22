import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2"

const ALLOWED_ORIGINS = new Set([
  "https://app.fleetmasterii.com",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
])

const RESEND_FROM = "FleetMaster II <no-reply@fleetmasterii.com>"
const REASON_CODES = new Set(["manual", "maintenance", "administrative", "security", "payment", "other"])

interface AccessRequest {
  organization_id: string
  enabled: boolean
  reason_code: string
  reason_note: string | null
}

interface TransitionResult {
  organization_id: string
  organization_name: string
  operational_access_manually_enabled: boolean
  transitioned: boolean
}

interface ManagerRecord {
  user_id: string
  display_name: string | null
  email: string
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

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

const bearerToken = (request: Request) => {
  const value = request.headers.get("authorization") ?? ""
  const match = value.match(/^Bearer\s+([^\s]+)$/i)
  return match?.[1] ?? null
}

const createClients = (token: string) => {
  const url = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !anonKey || !serviceRoleKey) throw new Error("missing-server-config")

  const caller = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return { caller, admin }
}

const parseRequest = async (request: Request): Promise<AccessRequest | null> => {
  try {
    const body = await request.json() as Record<string, unknown>
    const organizationId = typeof body.organization_id === "string" ? body.organization_id.trim() : ""
    const reasonCode = typeof body.reason_code === "string" ? body.reason_code.trim() : ""
    const reasonNoteValue = typeof body.reason_note === "string" ? body.reason_note.trim() : ""
    if (!isUuid(organizationId) || typeof body.enabled !== "boolean" || !REASON_CODES.has(reasonCode) || reasonNoteValue.length > 1000) return null
    return { organization_id: organizationId, enabled: body.enabled, reason_code: reasonCode, reason_note: reasonNoteValue || null }
  } catch {
    return null
  }
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character)

const buildEmailHtml = (managerName: string, organizationName: string) => `<!doctype html>
<html lang="es">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f1f4f3;color:#1a2722;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f4f3;"><tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#ffffff;border:1px solid #dce5e0;border-radius:8px;">
        <tr><td style="padding:26px 34px;background:#173b34;color:#ffffff;"><p style="margin:0;font-size:22px;line-height:1.2;font-weight:700;letter-spacing:.2px;">FleetMaster II</p><p style="margin:8px 0 0;color:#b9d8ce;font-size:12px;line-height:1.4;letter-spacing:1px;text-transform:uppercase;">Seguridad de la cuenta</p></td></tr>
        <tr><td style="padding:38px 34px 20px;"><p style="margin:0 0 10px;color:#a33a3a;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Aviso de acceso</p><h1 style="margin:0;color:#1a2722;font-size:30px;line-height:1.2;">El acceso de tu empresa ha sido bloqueado</h1><p style="margin:22px 0 0;color:#34443c;font-size:16px;line-height:1.6;">Hola, ${escapeHtml(managerName)}:</p><p style="margin:10px 0 0;color:#53635b;font-size:16px;line-height:1.6;">Te informamos que el acceso de <strong style="color:#1a2722;">${escapeHtml(organizationName)}</strong> a FleetMaster II ha sido bloqueado.</p><p style="margin:14px 0 0;color:#53635b;font-size:16px;line-height:1.6;">Mientras esta restricción permanezca activa, los usuarios de tu empresa no podrán acceder a las funciones operativas de FleetMaster II.</p></td></tr>
        <tr><td style="padding:0 34px 28px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#fff5f3;border:1px solid #f0d7d2;border-left:4px solid #c65b50;"><tr><td style="padding:20px 20px;"><p style="margin:0 0 8px;color:#6d302b;font-size:17px;line-height:1.3;font-weight:700;">¿Qué significa esto?</p><p style="margin:0;color:#6c5753;font-size:14px;line-height:1.6;">Las cuentas y usuarios de tu organización continúan registrados en FleetMaster II. Sin embargo, las funciones operativas permanecerán restringidas mientras el acceso de la empresa se encuentre bloqueado.</p></td></tr></table></td></tr>
        <tr><td style="padding:0 34px 28px;"><p style="margin:0 0 8px;color:#1a2722;font-size:17px;line-height:1.3;font-weight:700;">¿Necesitas ayuda?</p><p style="margin:0;color:#53635b;font-size:14px;line-height:1.6;">Si consideras que esto es un error o necesitas más información, comunícate con el equipo de FleetMaster II.</p></td></tr>
        <tr><td style="padding:24px 34px 30px;background:#f7faf8;border-top:1px solid #e1e9e5;"><p style="margin:0;color:#1a2722;font-size:16px;line-height:1.4;font-weight:700;">Gracias por ser parte de FleetMaster II.</p><p style="margin:8px 0 0;color:#0f766e;font-size:12px;line-height:1.5;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Tu flota, siempre contigo.</p><p style="margin:22px 0 0;color:#7b8983;font-size:12px;line-height:1.5;">FleetMaster II · Este es un mensaje automático.</p></td></tr>
      </table>
    </td></tr></table>
  </body>
</html>`

const sendBlockedAccessEmail = async (email: string, managerName: string, organizationName: string) => {
  const apiKey = Deno.env.get("RESEND_API_KEY")
  if (!apiKey) throw new Error("resend-not-configured")
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [email],
      subject: `El acceso de ${organizationName} ha sido bloqueado | FleetMaster II`,
      html: buildEmailHtml(managerName, organizationName),
    }),
  })
  if (!response.ok) throw new Error("resend-delivery-failed")
}

const resolveActiveManager = async (admin: SupabaseClient, organizationId: string): Promise<ManagerRecord | null> => {
  const { data, error } = await admin
    .from("organization_memberships")
    .select("user_id,profiles(display_name)")
    .eq("organization_id", organizationId)
    .eq("role", "manager")
    .eq("status", "active")
    .maybeSingle()
  if (error) throw new Error("manager-lookup-failed")
  if (!data) return null

  const row = data as unknown as { user_id: string; profiles: { display_name: string | null } | Array<{ display_name: string | null }> | null }
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(row.user_id)
  if (authError || !authUser.user?.email) throw new Error("manager-lookup-failed")
  return { user_id: row.user_id, display_name: profile?.display_name ?? null, email: authUser.user.email }
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin")
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ success: false, code: "permission_denied" }, 403, origin)
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (request.method !== "POST") return json({ success: false, code: "invalid_request" }, 405, origin)

  const token = bearerToken(request)
  const input = await parseRequest(request)
  if (!token || !input) return json({ success: false, code: "invalid_request" }, 400, origin)

  try {
    const { caller, admin } = createClients(token)
    const { data: userData, error: userError } = await caller.auth.getUser()
    if (userError || !userData.user) return json({ success: false, code: "unauthorized" }, 401, origin)

    const { data: isAdmin, error: adminCheckError } = await caller.rpc("is_fleetmaster_admin")
    if (adminCheckError || isAdmin !== true) return json({ success: false, code: "permission_denied" }, 403, origin)

    const { data: result, error: accessError } = await caller.rpc("set_organization_operational_access_atomic", {
      p_organization_id: input.organization_id,
      p_enabled: input.enabled,
      p_reason_code: input.reason_code,
      p_reason_note: input.reason_note,
    })
    const transition = result as TransitionResult | null
    if (accessError || !transition || transition.organization_id !== input.organization_id || typeof transition.organization_name !== "string" || transition.operational_access_manually_enabled !== input.enabled || typeof transition.transitioned !== "boolean") {
      return json({ success: false, code: "operational_access_update_failed" }, 500, origin)
    }

    if (!transition.transitioned || input.enabled) {
      return json({ success: true, accessChanged: transition.transitioned, transitioned: transition.transitioned, emailSent: false, notificationStatus: "not_required" }, 200, origin)
    }

    try {
      const manager = await resolveActiveManager(admin, input.organization_id)
      if (!manager) return json({ success: true, accessChanged: true, transitioned: true, emailSent: false, notificationStatus: "no_recipient" }, 200, origin)
      await sendBlockedAccessEmail(manager.email, manager.display_name || manager.email, transition.organization_name)
      return json({ success: true, accessChanged: true, transitioned: true, emailSent: true, notificationStatus: "sent" }, 200, origin)
    } catch {
      return json({ success: true, accessChanged: true, transitioned: true, emailSent: false, notificationStatus: "failed" }, 200, origin)
    }
  } catch {
    return json({ success: false, code: "internal_error" }, 500, origin)
  }
})
