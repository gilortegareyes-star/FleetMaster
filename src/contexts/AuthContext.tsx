import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { getSupabaseClient, isSupabaseConfigured } from "../services/supabase"

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  authorizationLoading: boolean
  isFleetmasterAdmin: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [authorizationLoading, setAuthorizationLoading] = useState(true)
  const [isFleetmasterAdmin, setIsFleetmasterAdmin] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false)
      setAuthorizationLoading(false)
      return
    }

    const supabase = getSupabaseClient()
    let isActive = true
    let sessionCheckId = 0

    const updateSession = async (nextSession: Session | null) => {
      const currentCheckId = ++sessionCheckId
      setSession(nextSession)
      setLoading(false)

      if (!nextSession) {
        setIsFleetmasterAdmin(false)
        setAuthorizationLoading(false)
        return
      }

      setAuthorizationLoading(true)
      const { data, error } = await supabase.rpc("is_fleetmaster_admin")

      if (isActive && currentCheckId === sessionCheckId) {
        setIsFleetmasterAdmin(!error && data === true)
        setAuthorizationLoading(false)
      }
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (isActive) void updateSession(data.session)
    })

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

  return (
    <AuthContext.Provider
      value={{
        authorizationLoading,
        isFleetmasterAdmin,
        loading,
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
