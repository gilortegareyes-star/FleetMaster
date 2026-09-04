import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import AppEntry from "./AppEntry"
import { AuthProvider } from "./contexts/AuthContext"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <AppEntry />
    </AuthProvider>
  </StrictMode>,
)
