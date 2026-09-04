import { useState, type FormEvent } from "react"
import { ArrowRight, LockKeyhole, Mail } from "lucide-react"
import { useAuth } from "../contexts/AuthContext"

export function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await signIn(email.trim(), password)
    } catch {
      setError("No se pudo iniciar sesión. Verifica tu correo y contraseña.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <div className="brand-mark__badge">FM</div>
          <span>FleetMaster II</span>
        </div>
        <div className="login-heading">
          <p>Acceso privado</p>
          <h1 id="login-title">Bienvenido de nuevo</h1>
          <span>Ingresa para continuar con la gestión de tu flota.</span>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span>Correo electrónico</span>
            <div className="login-field__control">
              <Mail aria-hidden="true" size={18} />
              <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
            </div>
          </label>
          <label className="login-field">
            <span>Contraseña</span>
            <div className="login-field__control">
              <LockKeyhole aria-hidden="true" size={18} />
              <input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
            </div>
          </label>
          {error ? <p className="login-error" role="alert">{error}</p> : null}
          <button className="button button--primary login-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Iniciando sesión..." : "Iniciar sesión"}
            <ArrowRight aria-hidden="true" size={18} />
          </button>
        </form>
      </section>
    </main>
  )
}
