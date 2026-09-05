import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import AppEntry from "./AppEntry"
import { AuthProvider } from "./contexts/AuthContext"
import { OrganizationProvider } from "./contexts/OrganizationContext"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <OrganizationProvider>
        <AppEntry />
      </OrganizationProvider>
    </AuthProvider>
  </StrictMode>,
)
