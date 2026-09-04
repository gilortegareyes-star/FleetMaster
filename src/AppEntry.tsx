import { LogIn } from "lucide-react"
import { Login } from "./components/Login"
import { useAuth } from "./contexts/AuthContext"
import App from "./App"
import "./App.css"

function AuthLoading() {
  return (
    <main className="auth-shell auth-shell--loading" aria-live="polite">
      <div className="auth-loading-mark">FM</div>
      <span>Verificando acceso...</span>
    </main>
  )
}

function AccessDenied() {
  const { signOut } = useAuth()

  return (
    <main className="auth-shell">
      <section className="access-denied-panel">
        <div className="auth-loading-mark"><LogIn aria-hidden="true" size={22} /></div>
        <p>Acceso privado</p>
        <h1>Tu cuenta aún no tiene acceso habilitado a FleetMaster.</h1>
        <button className="button button--secondary" onClick={() => void signOut()} type="button">
          Cerrar sesión
        </button>
      </section>
    </main>
  )
}

export default function AppEntry() {
  const { authorizationLoading, isFleetmasterAdmin, loading, session } = useAuth()

  if (loading || (session && authorizationLoading)) return <AuthLoading />
  if (!session) return <Login />
  if (!isFleetmasterAdmin) return <AccessDenied />
  return <App />
}
