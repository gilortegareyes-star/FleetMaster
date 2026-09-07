import { Check, Gauge, MessageSquareText, ShieldCheck } from "lucide-react"
import { useState, type FormEvent } from "react"
import welcomeImage from "../assets/fleetmaster-welcome.png"
import { markMyWelcomeSeen } from "../services/profile"

export function WelcomeModal({ onComplete }: { onComplete: () => void }) {
  const [hasConfirmed, setHasConfirmed] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!hasConfirmed || isSaving) return
    setIsSaving(true)
    setError(null)
    try {
      await markMyWelcomeSeen()
      onComplete()
    } catch {
      setError("No pudimos guardar tu confirmación. Intenta nuevamente.")
      setIsSaving(false)
    }
  }

  return <div className="welcome-modal-overlay"><section aria-labelledby="welcome-modal-title" aria-modal="true" className="welcome-modal" role="dialog"><div className="welcome-modal__visual"><img alt="Flotilla de vehículos FleetMaster II" src={welcomeImage} /><div className="welcome-modal__visual-content"><p className="welcome-modal__brand">FleetMaster II</p><p className="welcome-modal__eyebrow">Tu flota, en movimiento</p><h2>Hoy construimos<br />el mañana de tu operación</h2><div className="welcome-modal__benefits"><span><Gauge aria-hidden="true" size={17} />Más control <small>para tu flota</small></span><span><ShieldCheck aria-hidden="true" size={17} />Mayor eficiencia <small>en tu operación</small></span><span><Check aria-hidden="true" size={17} />Una solución <small>hecha a tu medida</small></span></div></div></div><div className="welcome-modal__content"><p className="welcome-modal__kicker">¡Bienvenido a</p><h1 id="welcome-modal-title">FleetMaster II!</h1><p className="welcome-modal__lead">Gracias por ser parte de esta primera etapa.</p><p>FleetMaster II se encuentra actualmente en fase de diseño, desarrollo y mejora continua, con un objetivo muy claro: <strong>construir un sistema que se adapte al 100% a las necesidades y forma de trabajo de cada empresa.</strong></p><div className="welcome-modal__sections"><article><MessageSquareText aria-hidden="true" size={19} /><div><h3>Tu experiencia es muy importante</h3><p>Sabemos que cada operación es diferente. Tus comentarios nos ayudan a perfeccionar la plataforma y a desarrollar nuevas funciones.</p></div></article><article><MessageSquareText aria-hidden="true" size={19} /><div><h3>Comunícate mediante Tickets</h3><p>Si detectas algo que podamos mejorar, necesitas una función adicional o tienes una idea, utiliza el sistema de Tickets de Soporte y Mejora.</p></div></article><article><Check aria-hidden="true" size={19} /><div><h3>Juntos construimos FleetMaster II</h3><p>Tu participación es parte fundamental del desarrollo. Queremos que esta herramienta sea cada vez más completa, práctica y adaptada a tu operación.</p></div></article></div><aside className="welcome-modal__highlight"><strong>Gracias por ayudarnos a mejorar FleetMaster II.</strong><span>Tu opinión nos impulsa.</span></aside><form className="welcome-modal__form" onSubmit={handleSubmit}><label><input checked={hasConfirmed} onChange={(event) => setHasConfirmed(event.target.checked)} type="checkbox" /> <span>He leído y entendido este mensaje.</span></label><small>Tu opinión es muy valiosa para nosotros.</small>{error ? <p className="welcome-modal__error" role="alert">{error}</p> : null}<button className="button button--primary" disabled={!hasConfirmed || isSaving} type="submit">{isSaving ? "Guardando..." : "Continuar →"}</button></form></div></section></div>
}
