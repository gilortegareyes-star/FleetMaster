import { getSupabaseClient } from "./supabase"

export const getMyWelcomeSeenAt = async (): Promise<string | null> => {
  const supabase = getSupabaseClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!authData.user) throw new Error("missing-auth-user")

  const { data, error } = await supabase
    .from("profiles")
    .select("welcome_seen_at")
    .eq("id", authData.user.id)
    .maybeSingle()

  if (error) throw error
  return (data as { welcome_seen_at: string | null } | null)?.welcome_seen_at ?? null
}

export const markMyWelcomeSeen = async (): Promise<void> => {
  const supabase = getSupabaseClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!authData.user) throw new Error("missing-auth-user")

  const { error } = await supabase
    .from("profiles")
    .update({ welcome_seen_at: new Date().toISOString() })
    .eq("id", authData.user.id)

  if (error) throw error
}
