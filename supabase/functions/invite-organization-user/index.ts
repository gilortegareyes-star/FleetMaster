import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2"

const ALLOWED_ORIGINS = new Set([
  "https://app.fleetmasterii.com",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
])

const APP_URL = Deno.env.get("FLEETMASTER_APP_URL") ?? "https://app.fleetmasterii.com"
const RESEND_FROM = "FleetMaster II <no-reply@fleetmasterii.com>"
const DRY_RUN = Deno.env.get("INVITATIONS_DRY_RUN") === "true"

type InvitationRole = "manager" | "client"

interface InviteRequest {
  organization_id: string
  name: string
  email: string
  role: InvitationRole
}

interface InvitationRow {
  id: string
  organization_id: string
  email: string
  invitee_name: string | null
  role: InvitationRole
  expires_at: string
}

interface OrganizationRow {
  name: string
  status: "active" | "suspended"
}

interface AuthUserSummary {
  id: string
  email?: string
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

const log = (correlationId: string, fields: Record<string, string | null | undefined>) => {
  console.info(JSON.stringify({ correlation_id: correlationId, ...fields }))
}

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

const normalizeEmail = (value: unknown) =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
    ? value.trim().toLowerCase()
    : null

const parseRequest = (body: unknown): InviteRequest | null => {
  if (!body || typeof body !== "object") return null
  const input = body as Record<string, unknown>
  const organizationId = typeof input.organization_id === "string" ? input.organization_id.trim() : ""
  const name = typeof input.name === "string" ? input.name.trim() : ""
  const email = normalizeEmail(input.email)
  const role = input.role

  if (!isUuid(organizationId) || !name || name.length > 160 || !email) return null
  if (role !== "manager" && role !== "client") return null

  return { organization_id: organizationId, name, email, role }
}

const bearerToken = (request: Request) => {
  const value = request.headers.get("authorization") ?? ""
  const match = value.match(/^Bearer\s+([^\s]+)$/i)
  return match?.[1] ?? null
}

const safeErrorCode = (message: string) => {
  const value = message.toLowerCase()
  if (value.includes("seat limit") || value.includes("seat")) return "no_seats_available"
  if (value.includes("pending invitation") || value.includes("already exists")) return "pending_invitation_exists"
  if (value.includes("active manager")) return "manager_already_exists"
  if (value.includes("belongs to") || value.includes("not eligible")) return "user_not_eligible"
  if (value.includes("not active") || value.includes("suspended")) return "organization_suspended"
  return "internal_error"
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character)

const roleLabel = (role: InvitationRole) => role === "manager" ? "Manager" : "Cliente"

const buildEmailHtml = (input: InviteRequest, organization: OrganizationRow, expiresAtValue: string, actionLink: string, userExists: boolean) => {
  const expiresAt = new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(new Date(expiresAtValue))

  const actionLabel = userExists ? "Acceder a FleetMaster II →" : "Activar mi acceso →"
  const actionCopy = userExists
    ? "Ya cuentas con acceso a FleetMaster II. Ingresa a la plataforma para continuar con el proceso de incorporación de la empresa."
    : "Para comenzar, activa tu acceso mediante el botón anterior."

  return `<!doctype html>
<html lang="es">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#eef3f6;color:#17202a;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef3f6;"><tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border:1px solid #dfe7eb;">
        <tr><td style="padding:28px 34px;background:#123247;color:#ffffff;"><p style="margin:0;font-size:22px;line-height:1.2;font-weight:700;letter-spacing:.2px;">FleetMaster II</p><p style="margin:8px 0 0;color:#b9dce7;font-size:13px;line-height:1.4;">Control. Mantenimiento. Información.</p></td></tr>
        <tr><td style="padding:38px 34px 22px;"><p style="margin:0 0 10px;color:#16849d;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Invitación empresarial</p><h1 style="margin:0;color:#173448;font-size:30px;line-height:1.2;">Bienvenido a FleetMaster II</h1><p style="margin:22px 0 0;color:#344c5b;font-size:16px;line-height:1.6;">Hola, ${escapeHtml(input.name)}:</p><p style="margin:10px 0 0;color:#526773;font-size:16px;line-height:1.6;">Se ha generado una invitación para que ${escapeHtml(organization.name)} forme parte de FleetMaster II.</p><p style="margin:14px 0 0;color:#526773;font-size:16px;line-height:1.6;">FleetMaster II centraliza la información y el seguimiento operativo de la flota, facilitando la administración de unidades, mantenimientos, documentación y servicios.</p></td></tr>
        <tr><td style="padding:0 34px 28px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f8fa;border:1px solid #dce8ed;"><tr><td style="padding:18px 20px;border-bottom:1px solid #dce8ed;"><p style="margin:0 0 5px;color:#6b7d87;font-size:12px;line-height:1.4;">Empresa</p><p style="margin:0;color:#173448;font-size:16px;line-height:1.4;font-weight:700;">${escapeHtml(organization.name)}</p></td></tr><tr><td style="padding:18px 20px;border-bottom:1px solid #dce8ed;"><p style="margin:0 0 5px;color:#6b7d87;font-size:12px;line-height:1.4;">Rol asignado</p><p style="margin:0;color:#173448;font-size:16px;line-height:1.4;font-weight:700;">${roleLabel(input.role)}</p></td></tr><tr><td style="padding:18px 20px;"><p style="margin:0 0 5px;color:#6b7d87;font-size:12px;line-height:1.4;">Correo</p><p style="margin:0;color:#173448;font-size:15px;line-height:1.4;word-break:break-word;">${escapeHtml(input.email)}</p></td></tr></table></td></tr>
        <tr><td align="center" style="padding:0 34px 10px;"><a href="${escapeHtml(actionLink)}" style="display:inline-block;background:#16849d;color:#ffffff;text-decoration:none;font-size:16px;line-height:1.2;font-weight:700;padding:16px 25px;border-radius:4px;">${actionLabel}</a></td></tr>
        <tr><td style="padding:10px 34px 30px;text-align:center;"><p style="margin:0;color:#60737e;font-size:13px;line-height:1.55;">${actionCopy}</p></td></tr>
        <tr><td style="padding:24px 34px;background:#f5f8fb;border-top:1px solid #dce8ed;border-bottom:1px solid #dce8ed;"><p style="margin:0 0 10px;color:#173448;font-size:17px;line-height:1.3;font-weight:700;">Desarrollo y evolución</p><p style="margin:0;color:#526773;font-size:14px;line-height:1.6;">FleetMaster II se encuentra actualmente en una etapa activa de desarrollo y evolución. Tu experiencia y retroalimentación serán importantes para continuar mejorando la plataforma y desarrollar funcionalidades alineadas con las necesidades reales de operación.</p><p style="margin:14px 0 0;color:#526773;font-size:14px;line-height:1.6;">Agradecemos tu participación en esta etapa de desarrollo y evolución de FleetMaster II.</p></td></tr>
        <tr><td style="padding:24px 34px 30px;"><p style="margin:0;color:#7b8b94;font-size:12px;line-height:1.55;">Esta invitación es personal y fue enviada exclusivamente a ${escapeHtml(input.email)}.</p><p style="margin:6px 0 0;color:#7b8b94;font-size:12px;line-height:1.55;">Si no esperabas recibir esta invitación, puedes ignorar este mensaje.</p><p style="margin:6px 0 0;color:#7b8b94;font-size:12px;line-height:1.55;">La invitación vence el ${escapeHtml(expiresAt)}.</p><p style="margin:24px 0 0;color:#173448;font-size:13px;line-height:1.5;font-weight:700;">FleetMaster II</p><p style="margin:3px 0 0;color:#7b8b94;font-size:12px;line-height:1.5;">Control. Mantenimiento. Información.</p><p style="margin:3px 0 0;color:#16849d;font-size:12px;line-height:1.5;">fleetmasterii.com</p></td></tr>
      </table>
    </td></tr></table>
  </body>
</html>`
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

const findAuthUser = async (admin: SupabaseClient, email: string) => {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error("auth-lookup-failed")
    const user = (data.users as AuthUserSummary[]).find((candidate) => candidate.email?.toLowerCase() === email)
    if (user) return user
    if (data.users.length < 1000) break
  }
  return null
}

const assertTargetEligible = async (admin: SupabaseClient, email: string) => {
  const user = await findAuthUser(admin, email)
  if (!user) return null

  const { data: adminRecord, error: adminError } = await admin
    .from("fleetmaster_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (adminError) throw new Error("eligibility-check-failed")
  if (adminRecord) throw new Error("user-not-eligible")

  const { data: memberships, error: membershipsError } = await admin
    .from("organization_memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
  if (membershipsError) throw new Error("eligibility-check-failed")
  if (memberships?.length) throw new Error("user-not-eligible")

  return user
}

const createInvitation = async (caller: SupabaseClient, input: InviteRequest) => {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const rpc = input.role === "manager" ? "create_manager_invitation" : "create_organization_invitation"
  const args = input.role === "manager"
    ? {
        p_organization_id: input.organization_id,
        p_invitee_name: input.name,
        p_email: input.email,
        p_expires_at: expiresAt,
      }
    : {
        p_organization_id: input.organization_id,
        p_email: input.email,
        p_role: "client",
        p_expires_at: expiresAt,
      }

  const { data, error } = await caller.rpc(rpc, args)
  if (error || !data) throw new Error(error?.message ?? "invitation-create-failed")
  return data as InvitationRow
}

const compensateInvitation = async (admin: SupabaseClient, invitationId: string, correlationId: string) => {
  const { data, error } = await admin
    .from("organization_invitations")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle()

  if (error || !data) {
    log(correlationId, { stage: "invitation_compensation_failed", invitation_id: invitationId })
    return false
  }

  log(correlationId, { stage: "invitation_compensated", invitation_id: invitationId })
  return true
}

const generateActionLink = async (
  admin: SupabaseClient,
  email: string,
  userExists: boolean,
  invitationId: string,
) => {
  const redirectTo = `${APP_URL.replace(/\/$/, "")}/?invitation=${encodeURIComponent(invitationId)}`
  if (userExists) return redirectTo

  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  })
  if (error || !data.properties?.action_link) throw new Error("auth-link-failed")
  return data.properties.action_link
}

const sendInvitationEmail = async (
  input: InviteRequest,
  organization: OrganizationRow,
  invitation: InvitationRow,
  actionLink: string,
  userExists: boolean,
) => {
  const apiKey = Deno.env.get("RESEND_API_KEY")
  if (!apiKey) throw new Error("resend-not-configured")

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `fleetmaster-invite/${invitation.id}`,
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [input.email],
      subject: `Acceso a FleetMaster II | ${organization.name}`,
      html: buildEmailHtml(input, organization, invitation.expires_at, actionLink, userExists),
    }),
  })

  if (!response.ok) throw new Error("resend-delivery-failed")
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin")
  const correlationId = crypto.randomUUID()

  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return json({ ok: false, code: "permission_denied" }, 403, origin)
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  if (request.method !== "POST") {
    return json({ ok: false, code: "invalid_request" }, 405, origin)
  }

  const token = bearerToken(request)
  if (!token) return json({ ok: false, code: "unauthorized" }, 401, origin)

  let input: InviteRequest | null
  try {
    input = parseRequest(await request.json())
  } catch {
    input = null
  }
  if (!input) return json({ ok: false, code: "invalid_request" }, 400, origin)

  let caller: SupabaseClient
  let admin: SupabaseClient
  let callerId: string
  try {
    ({ caller, admin } = createClients(token))
    const { data: userData, error: userError } = await caller.auth.getUser(token)
    if (userError || !userData.user) return json({ ok: false, code: "unauthorized" }, 401, origin)
    callerId = userData.user.id
  } catch {
    return json({ ok: false, code: "internal_error" }, 500, origin)
  }

  log(correlationId, { stage: "authenticated", caller_user_id: callerId, organization_id: input.organization_id })

  try {
    const { data: isAdmin, error: adminCheckError } = await caller.rpc("is_fleetmaster_admin")
    if (adminCheckError) throw new Error("authorization-check-failed")

    if (DRY_RUN) {
      if (!isAdmin) throw new Error("permission-denied")
      log(correlationId, { stage: "dry_run_validated", caller_user_id: callerId, organization_id: input.organization_id })
      return json({ ok: true, dry_run: true }, 200, origin)
    }

    if (!isAdmin) {
      const { data: isManager, error: managerCheckError } = await caller.rpc("has_organization_role", {
        p_organization_id: input.organization_id,
        p_roles: ["manager"],
      })
      if (managerCheckError) throw new Error("authorization-check-failed")
      if (!isManager) throw new Error("permission-denied")
      input = { ...input, role: "client" }
    }

    if (!Deno.env.get("RESEND_API_KEY")) throw new Error("missing-server-config")

    const { data: organization, error: organizationError } = await admin
      .from("organizations")
      .select("name,status")
      .eq("id", input.organization_id)
      .maybeSingle()
    if (organizationError || !organization) throw new Error("organization-not-found")
    if (organization.status !== "active") throw new Error("organization-suspended")

    const existingUser = await assertTargetEligible(admin, input.email)

    const invitation = await createInvitation(caller, input)
    log(correlationId, { stage: "invitation_created", caller_user_id: callerId, organization_id: input.organization_id, invitation_id: invitation.id })

    let actionLink: string
    try {
      actionLink = await generateActionLink(admin, input.email, Boolean(existingUser), invitation.id)
    } catch {
      log(correlationId, { stage: "auth_link_failed", caller_user_id: callerId, organization_id: input.organization_id, invitation_id: invitation.id })
      await compensateInvitation(admin, invitation.id, correlationId)
      return json({ ok: false, code: "auth-link-failed" }, 502, origin)
    }

    try {
      await sendInvitationEmail(input, organization as OrganizationRow, invitation, actionLink, Boolean(existingUser))
    } catch {
      log(correlationId, { stage: "resend_failed", caller_user_id: callerId, organization_id: input.organization_id, invitation_id: invitation.id })
      await compensateInvitation(admin, invitation.id, correlationId)
      return json({ ok: false, code: "resend-delivery-failed" }, 502, origin)
    }

    log(correlationId, { stage: "delivery_succeeded", caller_user_id: callerId, organization_id: input.organization_id, invitation_id: invitation.id })
    return json({ ok: true }, 200, origin)
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    log(correlationId, { stage: "failed", caller_user_id: callerId, organization_id: input.organization_id, error_code: safeErrorCode(message) })
    if (message === "permission-denied") return json({ ok: false, code: "permission_denied" }, 403, origin)
    if (message === "user-not-eligible") return json({ ok: false, code: "user_not_eligible" }, 409, origin)
    if (message.includes("belongs to") || message.includes("not eligible")) {
      return json({ ok: false, code: "user_not_eligible" }, 409, origin)
    }
    if (message === "organization-suspended") return json({ ok: false, code: "organization_suspended" }, 409, origin)
    if (message === "missing-server-config") return json({ ok: false, code: "missing-server-config" }, 500, origin)
    if (message === "organization-not-found") return json({ ok: false, code: "internal_error" }, 404, origin)
    return json({ ok: false, code: safeErrorCode(message) }, 409, origin)
  }
})
