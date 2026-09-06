import { MessageSquare, Send, X } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { addFeedbackTicketMessage, getFeedbackTicketMessages, listOrganizationFeedbackTickets } from "../services/feedback"
import { getSupabaseClient } from "../services/supabase"
import type { FeedbackStatus, FeedbackTicket, FeedbackTicketMessage } from "../types/feedback"

const categoryLabels = { problem: "Problema", improvement: "Mejora", suggestion: "Sugerencia", support: "Soporte" } as const
const statusLabels: Record<FeedbackStatus, string> = { open: "Abierto", in_review: "En revisión", in_progress: "En proceso", resolved: "Resuelto", closed: "Cerrado" }
const priorityLabels = { low: "Baja", normal: "Normal", high: "Alta", urgent: "Urgente" } as const
const formatDate = (value: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))

export function FeedbackAdminPanel({ organizationId }: { organizationId: string }) {
  const [tickets, setTickets] = useState<FeedbackTicket[]>([]); const [selected, setSelected] = useState<FeedbackTicket | null>(null); const [messages, setMessages] = useState<FeedbackTicketMessage[]>([]); const [loading, setLoading] = useState(true); const [loadingMessages, setLoadingMessages] = useState(false); const [error, setError] = useState<string | null>(null); const [reply, setReply] = useState(""); const [sendingReply, setSendingReply] = useState(false)
  const refresh = async () => { setLoading(true); setError(null); try { setTickets(await listOrganizationFeedbackTickets(organizationId)) } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los tickets.") } finally { setLoading(false) } }
  useEffect(() => { void refresh(); setSelected(null) }, [organizationId])
  const openTicket = (ticket: FeedbackTicket) => { setSelected(ticket); setMessages([]); setError(null) }
  useEffect(() => {
    if (!selected) return
    let active = true
    setLoadingMessages(true)
    const mergeMessages = (incoming: FeedbackTicketMessage[]) => {
      setMessages((current) => [...new Map([...current, ...incoming].map((item) => [item.id, item])).values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt)))
    }
    const channel = getSupabaseClient().channel(`feedback-admin-ticket-${selected.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "feedback_ticket_messages", filter: `ticket_id=eq.${selected.id}` }, (payload) => {
        const row = payload.new as { id?: string; ticket_id?: string; organization_id?: string; author_id?: string; message?: string; created_at?: string }
        if (!row.id || !row.ticket_id || !row.organization_id || !row.author_id || !row.message || !row.created_at) return
        mergeMessages([{ id: row.id, ticketId: row.ticket_id, organizationId: row.organization_id, authorId: row.author_id, authorName: null, message: row.message, createdAt: row.created_at }])
      })
    channel.subscribe((status) => { if (status === "SUBSCRIBED") void getFeedbackTicketMessages(selected.id).then((loaded) => { if (active) mergeMessages(loaded) }).catch(() => { if (active) setError("No se pudo actualizar la conversación.") }) })
    void getFeedbackTicketMessages(selected.id).then((loaded) => { if (active) mergeMessages(loaded) }).catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la conversación.") }).finally(() => { if (active) setLoadingMessages(false) })
    return () => { active = false; void getSupabaseClient().removeChannel(channel) }
  }, [selected])
  const submitMessage = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selected || selected.status === "closed" || sendingReply) return; const message = reply.trim(); if (!message) return; setError(null); setSendingReply(true); try { await addFeedbackTicketMessage(selected.id, message); setReply(""); setMessages(await getFeedbackTicketMessages(selected.id)); setTickets(await listOrganizationFeedbackTickets(organizationId)) } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "No se pudo enviar la respuesta.") } finally { setSendingReply(false) } }
  return <section className="feedback-admin-panel" aria-labelledby="admin-feedback-title"><header className="feedback-admin-panel__header"><div><p>Tickets</p><h2 id="admin-feedback-title">Feedback y soporte</h2><span>Seguimiento de solicitudes de esta empresa.</span></div><strong>{tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}</strong></header><div className="feedback-admin-panel__body"><div className="feedback-list">{loading ? <p className="feedback-empty">Cargando tickets...</p> : tickets.length === 0 ? <div className="feedback-empty"><MessageSquare aria-hidden="true" size={25} /><strong>Esta empresa todavía no tiene tickets.</strong></div> : tickets.map((ticket) => <button className={`feedback-ticket-row${selected?.id === ticket.id ? " feedback-ticket-row--selected" : ""}`} key={ticket.id} onClick={() => void openTicket(ticket)} type="button"><span><strong>{ticket.folio}</strong><b>{ticket.title}</b></span><span><small>{categoryLabels[ticket.category]} · {priorityLabels[ticket.priority]}</small><em className={`feedback-status feedback-status--${ticket.status}`}>{statusLabels[ticket.status]}</em></span><time>{formatDate(ticket.updatedAt)}</time></button>)}</div>{selected ? <article className="feedback-thread"><header><div><span>{selected.folio}</span><h3>{selected.title}</h3><small>{categoryLabels[selected.category]} · {priorityLabels[selected.priority]} · {selected.creatorName || "Usuario de la empresa"}</small></div><button className="icon-button" aria-label="Cerrar detalle" onClick={() => setSelected(null)} type="button"><X aria-hidden="true" size={18} /></button></header><div className="feedback-thread__messages">{loadingMessages ? <p className="feedback-empty">Cargando conversación...</p> : messages.map((item) => <div className="feedback-message" key={item.id}><div><strong>{item.authorName || "Usuario de FleetMaster"}</strong><time>{formatDate(item.createdAt)}</time></div><p>{item.message}</p></div>)}</div>{selected.status === "closed" ? <p className="feedback-thread__closed">Este ticket está cerrado y no acepta nuevas respuestas.</p> : <form className="feedback-reply" onSubmit={submitMessage}><textarea name="message" onChange={(event) => setReply(event.target.value)} placeholder="Escribe una respuesta..." required rows={3} value={reply} /><button className="button button--primary" disabled={sendingReply} type="submit"><Send aria-hidden="true" size={16} />{sendingReply ? "Enviando..." : "Enviar"}</button></form>}</article> : null}</div>{error ? <p className="feedback-error" role="alert">{error}</p> : null}</section>
}
