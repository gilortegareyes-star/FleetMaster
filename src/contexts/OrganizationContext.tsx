import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { useAuth } from "./AuthContext"

export interface ActiveOrganization {
  id: string
  name: string
  status: "active" | "suspended"
}

interface StoredOrganizationContext {
  userId: string
  organization: ActiveOrganization
}

interface OrganizationContextValue {
  activeOrganization: ActiveOrganization | null
  setActiveOrganization: (organization: ActiveOrganization) => void
  clearActiveOrganization: () => void
}

const organizationContextKey = "fleetmaster.active-organization.v1"
const validStatuses = new Set<ActiveOrganization["status"]>(["active", "suspended"])

const readStoredOrganization = (userId: string): ActiveOrganization | null => {
  try {
    const stored = window.sessionStorage.getItem(organizationContextKey)
    if (!stored) return null

    const parsed = JSON.parse(stored) as Partial<StoredOrganizationContext>
    const organization = parsed.organization
    if (
      parsed.userId !== userId ||
      !organization ||
      typeof organization.id !== "string" ||
      typeof organization.name !== "string" ||
      !validStatuses.has(organization.status as ActiveOrganization["status"]) ||
      organization.status !== "active"
    ) {
      window.sessionStorage.removeItem(organizationContextKey)
      return null
    }

    return organization as ActiveOrganization
  } catch {
    window.sessionStorage.removeItem(organizationContextKey)
    return null
  }
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { isFleetmasterAdmin, organizationAccess, user } = useAuth()
  const [activeOrganization, setActiveOrganizationState] = useState<ActiveOrganization | null>(null)

  useEffect(() => {
    if (!user) {
      window.sessionStorage.removeItem(organizationContextKey)
      setActiveOrganizationState(null)
      return
    }

    if (!isFleetmasterAdmin && organizationAccess) {
      setActiveOrganizationState({
        id: organizationAccess.organizationId,
        name: organizationAccess.organizationName,
        status: "active",
      })
      return
    }

    setActiveOrganizationState(readStoredOrganization(user.id))
  }, [isFleetmasterAdmin, organizationAccess, user?.id])

  const setActiveOrganization = (organization: ActiveOrganization) => {
    if (!user || organization.status !== "active") return

    setActiveOrganizationState(organization)
    const stored: StoredOrganizationContext = { userId: user.id, organization }
    window.sessionStorage.setItem(organizationContextKey, JSON.stringify(stored))
  }

  const clearActiveOrganization = () => {
    window.sessionStorage.removeItem(organizationContextKey)
    setActiveOrganizationState(null)
  }

  return (
    <OrganizationContext.Provider value={{ activeOrganization, clearActiveOrganization, setActiveOrganization }}>
      {children}
    </OrganizationContext.Provider>
  )
}

const OrganizationContext = createContext<OrganizationContextValue | undefined>(undefined)

export function useOrganization() {
  const context = useContext(OrganizationContext)
  if (!context) throw new Error("useOrganization must be used within OrganizationProvider")
  return context
}
