import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { getSupabaseClient, isSupabaseConfigured } from "../services/supabase"
import { getMyOrganizationAccess } from "../services/organizations"
import type { OrganizationAccess } from "../types/organization"

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  authorizationLoading: boolean
  isInviteSession: boolean
  isFleetmasterAdmin: boolean
  organizationAccess: OrganizationAccess | null
  organizationAccessLoading: boolean
  refreshOrganizationAccess: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [authorizationLoading, setAuthorizationLoading] = useState(true)
  const [isInviteSession, setIsInviteSession] = useState(false)
  const [isFleetmasterAdmin, setIsFleetmasterAdmin] = useState(false)
  const [organizationAccess, setOrganizationAccess] = useState<OrganizationAccess | null>(null)
  const [organizationAccessLoading, setOrganizationAccessLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false)
      setAuthorizationLoading(false)
      return
    }

    const supabase = getSupabaseClient()
    let isActive = true
    let sessionCheckId = 0

    const hasInviteCallback = () => {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""))
      return hashParams.get("type") === "invite"
    }
    const inviteCallbackPresent = hasInviteCallback()

    const updateSession = async (nextSession: Session | null) => {
      const currentCheckId = ++sessionCheckId
      setSession(nextSession)
      setLoading(false)
      if (inviteCallbackPresent) setIsInviteSession(true)

      if (!nextSession) {
        setIsInviteSession(false)
        setIsFleetmasterAdmin(false)
        setOrganizationAccess(null)
        setAuthorizationLoading(false)
        setOrganizationAccessLoading(false)
        return
      }

      setAuthorizationLoading(true)
      setOrganizationAccessLoading(true)
      const { data, error } = await supabase.rpc("is_fleetmaster_admin")

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
              if (isActive && currentCheckId === sessionCheckId) setOrganizationAccessLoading(false)
            })
        }
      }
    }

    const restoreSession = async () => {
      const code = new URLSearchParams(window.location.search).get("code")
      if (inviteCallbackPresent) setIsInviteSession(true)
      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code)
        } catch {
          // The regular invite callback may already be processed from the URL hash.
        }
      }
      const { data } = await supabase.auth.getSession()
      if (isActive) void updateSession(data.session)
    }

    void restoreSession()

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => {
        if (isActive) void updateSession(nextSession)
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

  return (
    <AuthContext.Provider
      value={{
        authorizationLoading,
        isInviteSession,
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
