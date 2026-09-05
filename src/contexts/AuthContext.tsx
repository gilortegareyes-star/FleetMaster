import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js"
import { getSupabaseClient, isSupabaseConfigured } from "../services/supabase"
import { getMyOrganizationAccess } from "../services/organizations"
import type { OrganizationAccess } from "../types/organization"

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  authorizationLoading: boolean
  isInviteSession: boolean
  clearInviteSessionContext: () => void
  isFleetmasterAdmin: boolean
  organizationAccess: OrganizationAccess | null
  organizationAccessLoading: boolean
  refreshOrganizationAccess: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const inviteContextKey = "fleetmaster.invite-context"
const invitationPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface InviteContext {
  invitationId: string
  isInvite: true
}

export const getStoredInviteContext = (): InviteContext | null => {
  if (typeof window === "undefined") return null
  try {
    const value = window.sessionStorage.getItem(inviteContextKey)
    if (!value) return null
    const context = JSON.parse(value) as Partial<InviteContext>
    return context.isInvite === true && typeof context.invitationId === "string" && invitationPattern.test(context.invitationId)
      ? { invitationId: context.invitationId, isInvite: true }
      : null
  } catch {
    return null
  }
}

// Capture invite context before Supabase can consume the callback URL.
const captureInviteContext = () => {
  if (typeof window === "undefined") return null
  const invitationId = new URLSearchParams(window.location.search).get("invitation")
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""))
  if (!invitationId || !invitationPattern.test(invitationId) || hashParams.get("type") !== "invite") return getStoredInviteContext()
  const context: InviteContext = { invitationId, isInvite: true }
  window.sessionStorage.setItem(inviteContextKey, JSON.stringify(context))
  return context
}

const initialInviteContext = captureInviteContext()

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [authorizationLoading, setAuthorizationLoading] = useState(true)
  const [inviteSessionUserId, setInviteSessionUserId] = useState<string | null>(null)
  const [isFleetmasterAdmin, setIsFleetmasterAdmin] = useState(false)
  const [organizationAccess, setOrganizationAccess] = useState<OrganizationAccess | null>(null)
  const [organizationAccessLoading, setOrganizationAccessLoading] = useState(true)
  const currentUserIdRef = useRef<string | null>(null)
  const authorizationResolvedRef = useRef(false)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false)
      setAuthorizationLoading(false)
      return
    }

    const supabase = getSupabaseClient()
    let isActive = true
    let sessionCheckId = 0

    const updateSession = async (event: AuthChangeEvent, nextSession: Session | null) => {
      const currentCheckId = ++sessionCheckId
      const isBackgroundEvent = event === "TOKEN_REFRESHED" || event === "SIGNED_IN" || event === "USER_UPDATED"
      const isSameResolvedUser = Boolean(
        isBackgroundEvent &&
        nextSession &&
        authorizationResolvedRef.current &&
        currentUserIdRef.current === nextSession.user.id,
      )

      currentUserIdRef.current = nextSession?.user.id ?? null
      setSession(nextSession)
      if (nextSession && initialInviteContext) setInviteSessionUserId((current) => current ?? nextSession.user.id)

      if (!nextSession) {
        authorizationResolvedRef.current = false
        setLoading(false)
        setInviteSessionUserId(null)
        setIsFleetmasterAdmin(false)
        setOrganizationAccess(null)
        setAuthorizationLoading(false)
        setOrganizationAccessLoading(false)
        return
      }

      if (!isSameResolvedUser) {
        authorizationResolvedRef.current = false
        setLoading(true)
        setAuthorizationLoading(true)
        setOrganizationAccessLoading(true)
        setIsFleetmasterAdmin(false)
        setOrganizationAccess(null)
      }

      const { data, error } = await supabase.rpc("is_fleetmaster_admin")

      if (isSameResolvedUser) {
        if (error || !isActive || currentCheckId !== sessionCheckId) return

        if (data === true) {
          setIsFleetmasterAdmin(true)
          setOrganizationAccess(null)
          return
        }

        try {
          const access = await getMyOrganizationAccess()
          if (isActive && currentCheckId === sessionCheckId) {
            setIsFleetmasterAdmin(false)
            setOrganizationAccess(access)
          }
        } catch {
          // Keep the last known authorization during a transient revalidation failure.
        }
        return
      }

      if (isActive && currentCheckId === sessionCheckId) {
        const isAdmin = !error && data === true
        setIsFleetmasterAdmin(isAdmin)
        setAuthorizationLoading(false)
        if (isAdmin) {
          setOrganizationAccess(null)
          setOrganizationAccessLoading(false)
        } else {
          void getMyOrganizationAccess()
            .then((access) => {
              if (isActive && currentCheckId === sessionCheckId) setOrganizationAccess(access)
            })
            .catch(() => {
              if (isActive && currentCheckId === sessionCheckId) setOrganizationAccess(null)
            })
            .finally(() => {
              if (isActive && currentCheckId === sessionCheckId) {
                authorizationResolvedRef.current = true
                setOrganizationAccessLoading(false)
                setLoading(false)
              }
            })
        }
        if (isAdmin) {
          authorizationResolvedRef.current = true
          setLoading(false)
        }
      }
    }

    const restoreSession = async () => {
      const code = new URLSearchParams(window.location.search).get("code")
      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code)
        } catch {
          // The regular invite callback may already be processed from the URL hash.
        }
      }
      const { data } = await supabase.auth.getSession()
      if (isActive) void updateSession("INITIAL_SESSION", data.session)
    }

    void restoreSession()

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      window.setTimeout(() => {
        if (isActive) void updateSession(event, nextSession)
      }, 0)
    })

    return () => {
      isActive = false
      data.subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    const { error } = await getSupabaseClient().auth.signOut()
    if (error) throw error
  }

  const refreshOrganizationAccess = async () => {
    const access = await getMyOrganizationAccess()
    setOrganizationAccess(access)
  }

  const clearInviteSessionContext = () => {
    window.sessionStorage.removeItem(inviteContextKey)
    setInviteSessionUserId(null)
  }

  return (
    <AuthContext.Provider
      value={{
        authorizationLoading,
        clearInviteSessionContext,
        isInviteSession: Boolean(session && inviteSessionUserId === session.user.id),
        isFleetmasterAdmin,
        loading,
        organizationAccess,
        organizationAccessLoading,
        refreshOrganizationAccess,
        session,
        signIn,
        signOut,
        user: session?.user ?? null,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider")
  }

  return context
}
