import {
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  LockKeyhole,
  MessageSquare,
  Search,
  Send,
  Tag,
  UserRound,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  addFeedbackTicketMessage,
  cancelFeedbackTicketClose,
  getFeedbackTicketMessages,
  getPendingFeedbackTicketCloseRequest,
  listPendingFeedbackTicketCloseRequests,
  listOrganizationFeedbackTickets,
  markFeedbackTicketRead,
  requestFeedbackTicketClose,
  respondFeedbackTicketClose,
} from "../services/feedback";
import { getSupabaseClient } from "../services/supabase";
import type {
  FeedbackCloseRequestStatus,
  FeedbackStatus,
  FeedbackTicket,
  FeedbackTicketCloseRequest,
  FeedbackTicketMessage,
} from "../types/feedback";

const categoryLabels = {
  problem: "Problema",
  improvement: "Mejora",
  suggestion: "Sugerencia",
  support: "Soporte",
} as const;
const statusLabels: Record<FeedbackStatus, string> = {
  open: "Abierto",
  in_review: "En revisión",
  in_progress: "En proceso",
  resolved: "Resuelto",
  closed: "Cerrado",
};
const priorityLabels = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
} as const;
const filterOptions: Array<{ value: "all" | FeedbackStatus; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "open", label: "Abiertos" },
  { value: "in_progress", label: "En proceso" },
  { value: "resolved", label: "Resueltos" },
  { value: "closed", label: "Cerrados" },
];
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const getInitials = (name: string | null, fallback: string) => {
  const source = name?.trim() || fallback;
  const parts = source.split(/\s+/).filter(Boolean);
  return parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : source.slice(0, 2).toUpperCase();
};
type SupportTimelineItem =
  | { kind: "message"; at: string; item: FeedbackTicketMessage; order: number }
  | { kind: "close-request"; at: string; item: FeedbackTicketCloseRequest; order: number }
  | { kind: "closed"; at: string; order: number };

export function FeedbackAdminPanel({
  onRefreshUnread,
  organizationId,
  organizationName,
  unreadTicketIds,
}: {
  onRefreshUnread: () => Promise<void>;
  organizationId: string;
  organizationName: string;
  unreadTicketIds: string[];
}) {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<FeedbackTicket[]>([]);
  const [selected, setSelected] = useState<FeedbackTicket | null>(null);
  const [messages, setMessages] = useState<FeedbackTicketMessage[]>([]);
  const [pendingClose, setPendingClose] =
    useState<FeedbackTicketCloseRequest | null>(null);
  const [pendingCloseByTicket, setPendingCloseByTicket] = useState<Map<string, FeedbackTicketCloseRequest>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingClose, setLoadingClose] = useState(false);
  const [closeConfirmation, setCloseConfirmation] = useState<
    "request" | "confirm" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [filter, setFilter] = useState<"all" | FeedbackStatus>("all");
  const [search, setSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const markSelectedTicketRead = async (ticketId: string) => {
    await markFeedbackTicketRead(ticketId);
    await onRefreshUnread();
  };
  const timeline = useMemo<SupportTimelineItem[]>(() => {
    const items: SupportTimelineItem[] = messages.map((item, order) => ({ kind: "message", at: item.createdAt, item, order }));
    if (pendingClose) items.push({ kind: "close-request", at: pendingClose.requestedAt, item: pendingClose, order: items.length });
    if (selected?.status === "closed") items.push({ kind: "closed", at: selected.closedAt ?? selected.updatedAt, order: items.length });
    return items.sort((left, right) => {
      const leftTime = Date.parse(left.at);
      const rightTime = Date.parse(right.at);
      const leftInvalid = Number.isNaN(leftTime);
      const rightInvalid = Number.isNaN(rightTime);
      if (leftInvalid || rightInvalid) {
        if (leftInvalid !== rightInvalid) return leftInvalid ? 1 : -1;
        return left.order - right.order;
      }
      return leftTime - rightTime || left.order - right.order;
    });
  }, [messages, pendingClose, selected]);
  useEffect(() => {
    if (!loadingMessages && stickToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [loadingMessages, timeline.length]);
  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setTickets(await listOrganizationFeedbackTickets(organizationId));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar los tickets.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    setSelected(null);
  }, [organizationId]);
  useEffect(() => {
    void listPendingFeedbackTicketCloseRequests()
      .then((requests) => setPendingCloseByTicket(new Map(requests.filter((request) => request.organizationId === organizationId).map((request) => [request.ticketId, request]))))
      .catch(() => undefined);
  }, [organizationId, tickets.length]);
  const openTicket = async (ticket: FeedbackTicket) => {
    if (selected?.id === ticket.id) return;
    setSelected(ticket);
    stickToBottomRef.current = true;
    setMessages([]);
    setError(null);
  };
  useEffect(() => {
    if (!selected) {
      setPendingClose(null);
      return;
    }
    let active = true;
    setPendingClose(null);
    void getPendingFeedbackTicketCloseRequest(selected.id)
      .then((request) => {
        if (active) setPendingClose(request);
      })
      .catch(() => {
        if (active) setError("No se pudo consultar el estado de cierre.");
      });
    return () => {
      active = false;
    };
  }, [selected]);
  const refreshAfterCloseAction = async () => {
    if (!selected) return;
    const [nextTickets, nextRequests] = await Promise.all([
      listOrganizationFeedbackTickets(organizationId),
      listPendingFeedbackTicketCloseRequests(),
    ]);
    const nextSelected =
      nextTickets.find((ticket) => ticket.id === selected.id) ?? null;
    setTickets(nextTickets);
    setSelected(nextSelected && (filter === "all" || nextSelected.status === filter) ? nextSelected : null);
    setPendingClose(
      nextSelected
        ? await getPendingFeedbackTicketCloseRequest(nextSelected.id)
        : null,
    );
    setPendingCloseByTicket(new Map(nextRequests.filter((request) => request.organizationId === organizationId).map((request) => [request.ticketId, request])));
  };
  const runCloseAction = async (
    action: "request" | "confirm" | "reject" | "cancel",
  ) => {
    if (!selected || loadingClose) return;
    setLoadingClose(true);
    setError(null);
    try {
      if (action === "request") await requestFeedbackTicketClose(selected.id);
      else if (action === "cancel")
        await cancelFeedbackTicketClose(selected.id);
      else await respondFeedbackTicketClose(selected.id, action);
      await refreshAfterCloseAction();
      setCloseConfirmation(null);
    } catch (closeError) {
      setError(
        closeError instanceof Error
          ? closeError.message
          : "No se pudo actualizar el cierre del ticket.",
      );
    } finally {
      setLoadingClose(false);
    }
  };
  const runCloseActionForTicket = async (ticketId: string) => {
    if (loadingClose) return;
    setLoadingClose(true);
    setError(null);
    try {
      await cancelFeedbackTicketClose(ticketId);
      const [nextTickets, nextRequests] = await Promise.all([listOrganizationFeedbackTickets(organizationId), listPendingFeedbackTicketCloseRequests()]);
      setTickets(nextTickets);
      setPendingCloseByTicket(new Map(nextRequests.filter((request) => request.organizationId === organizationId).map((request) => [request.ticketId, request])));
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "No se pudo cancelar la solicitud de cierre.");
    } finally {
      setLoadingClose(false);
    }
  };
  const requestCloseForTicket = (ticketId: string) => { const ticket = tickets.find((item) => item.id === ticketId); if (ticket) { setSelected(ticket); setCloseConfirmation("request"); } };
  const filteredTickets = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return tickets.filter(
      (ticket) =>
        (filter === "all" || ticket.status === filter) &&
        (!normalized ||
          `${ticket.folio} ${ticket.title} ${categoryLabels[ticket.category]} ${statusLabels[ticket.status]} ${priorityLabels[ticket.priority]} ${ticket.creatorName ?? ""}`
            .toLowerCase()
            .includes(normalized)),
    );
  }, [filter, search, tickets]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setLoadingMessages(true);
    const mergeMessages = (incoming: FeedbackTicketMessage[]) => {
      setMessages((current) =>
        [
          ...new Map(
            [...current, ...incoming].map((item) => [item.id, item]),
          ).values(),
        ].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
      );
    };
    const channel = getSupabaseClient()
      .channel(`feedback-admin-ticket-${selected.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "feedback_ticket_messages",
          filter: `ticket_id=eq.${selected.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            ticket_id?: string;
            organization_id?: string;
            author_id?: string;
            message?: string;
            created_at?: string;
          };
          if (
            !row.id ||
            !row.ticket_id ||
            !row.organization_id ||
            !row.author_id ||
            !row.message ||
            !row.created_at
          )
            return;
          mergeMessages([
            {
              id: row.id,
              ticketId: row.ticket_id,
              organizationId: row.organization_id,
              authorId: row.author_id,
              authorName: null,
              message: row.message,
              createdAt: row.created_at,
            },
          ]);
          if (stickToBottomRef.current) {
            void markSelectedTicketRead(selected.id).catch(() => undefined);
          }
        },
      );
    const refreshCloseState = () => {
      void refreshAfterCloseAction().then(() => {
        if (stickToBottomRef.current) return markSelectedTicketRead(selected.id);
      }).catch(() => {
        if (active) setError("No se pudo actualizar el estado de cierre.");
      });
    };
    channel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "feedback_ticket_close_requests", filter: `ticket_id=eq.${selected.id}` },
        refreshCloseState,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "feedback_ticket_close_requests", filter: `ticket_id=eq.${selected.id}` },
        refreshCloseState,
      );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED")
        void getFeedbackTicketMessages(selected.id)
          .then((loaded) => {
            if (active) mergeMessages(loaded);
          })
          .catch(() => {
            if (active) setError("No se pudo actualizar la conversación.");
          });
    });
    void getFeedbackTicketMessages(selected.id)
      .then((loaded) => {
        if (!active) return;
        mergeMessages(loaded);
        if (stickToBottomRef.current) {
          void markSelectedTicketRead(selected.id).catch(() => undefined);
        }
      })
      .catch((loadError) => {
        if (active)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No se pudo cargar la conversación.",
          );
      })
      .finally(() => {
        if (active) setLoadingMessages(false);
      });
    return () => {
      active = false;
      void getSupabaseClient().removeChannel(channel);
    };
  }, [selected]);
  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || selected.status === "closed" || sendingReply) return;
    const message = reply.trim();
    if (!message) return;
    setError(null);
    setSendingReply(true);
    try {
      await addFeedbackTicketMessage(selected.id, message);
      setReply("");
      setMessages(await getFeedbackTicketMessages(selected.id));
      setTickets(await listOrganizationFeedbackTickets(organizationId));
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo enviar la respuesta.",
      );
    } finally {
      setSendingReply(false);
    }
  };
  return (
    <section
      className="support-center support-center--admin"
      aria-labelledby="admin-feedback-title"
    >
      <header className="support-center__header">
        <div className="support-center__heading">
          <div>
            <p className="support-center__kicker">
              Mesa de soporte FleetMaster
            </p>
            <h2 id="admin-feedback-title">Centro de soporte</h2>
            <span>
              Seguimiento ejecutivo de las solicitudes de la empresa
              seleccionada.
            </span>
          </div>
        </div>
        <span className="support-admin-context">
          <Building2 aria-hidden="true" size={16} /> Organización actual
        </span>
      </header>
      <div className="support-center__toolbar">
        <div className="support-center__filters" aria-label="Filtrar tickets">
          {filterOptions.map((option) => (
            <button
              className={filter === option.value ? "is-active" : ""}
              key={option.value}
              onClick={() => setFilter(option.value)}
              type="button"
            >
              {option.label}
              {option.value === "all" ? ` ${tickets.length}` : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="support-workspace">
        <section
          className="support-list-panel"
          aria-labelledby="admin-ticket-list-title"
        >
          <header>
            <div>
              <p className="support-eyebrow">Bandeja administrativa</p>
              <h3 id="admin-ticket-list-title">Tickets de la empresa</h3>
            </div>
            <span>
              {filteredTickets.length}{" "}
              {filteredTickets.length === 1 ? "resultado" : "resultados"}
            </span>
          </header>
          <label className="support-search">
            <Search aria-hidden="true" size={17} />
            <span className="sr-only">Buscar tickets</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar folio, título o creador"
              value={search}
            />
          </label>
          {loading ? (
            <p className="support-empty">Cargando tickets...</p>
          ) : filteredTickets.length === 0 ? (
            <div className="support-empty">
              <MessageSquare aria-hidden="true" size={27} />
              <strong>
                {tickets.length === 0
                  ? "Esta empresa todavía no tiene tickets"
                  : "No hay coincidencias"}
              </strong>
              <span>
                {tickets.length === 0
                  ? "Las solicitudes aparecerán aquí cuando la empresa cree un ticket."
                  : "Prueba con otro filtro o término de búsqueda."}
              </span>
            </div>
          ) : (
            <div className="support-ticket-list">
              {filteredTickets.map((ticket) => (
                <button
                  className={`support-ticket${selected?.id === ticket.id ? " is-selected" : ""}`}
                  key={ticket.id}
                  onClick={() => void openTicket(ticket)}
                  type="button"
                >
                  <span className="support-ticket__top">
                    <strong>{ticket.folio}</strong>
                    {unreadTicketIds.includes(ticket.id) ? (
                      <em className="support-ticket__unread">Nuevo</em>
                    ) : null}
                    <time>{formatDate(ticket.updatedAt)}</time>
                  </span>
                  <b>{ticket.title}</b>
                  <span className="support-ticket__meta">
                    <em
                      className={`feedback-status feedback-status--${ticket.status}`}
                    >
                      {statusLabels[ticket.status]}
                    </em>
                    <small>
                      <Tag aria-hidden="true" size={13} />{" "}
                      {priorityLabels[ticket.priority]} ·{" "}
                      {categoryLabels[ticket.category]}
                    </small>
                  </span>
                  <span className="support-ticket__creator">
                    <UserRound aria-hidden="true" size={13} />{" "}
                    {ticket.creatorName || "Usuario de la empresa"}
                    <span className="support-ticket__actions" onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}>
                    {ticket.status === "closed" ? <span className="support-ticket__action-icon" title="Ticket cerrado" aria-label="Ticket cerrado"><LockKeyhole aria-hidden="true" size={17} /></span> : pendingCloseByTicket.get(ticket.id)?.requestedSide === "fleetmaster" ? <><span className="support-ticket__action-icon" title="Esperando confirmación del cliente" aria-label="Esperando confirmación del cliente"><Clock3 aria-hidden="true" size={17} /></span><span role="button" tabIndex={0} className="support-ticket__action-icon" title="Cancelar solicitud de cierre" aria-label="Cancelar solicitud de cierre" onClick={() => void runCloseActionForTicket(ticket.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); void runCloseActionForTicket(ticket.id); } }}><X aria-hidden="true" size={17} /></span></> : pendingCloseByTicket.has(ticket.id) ? <span className="support-ticket__action-icon" title="El cliente solicita cerrar este ticket" aria-label="El cliente solicita cerrar este ticket"><CircleAlert aria-hidden="true" size={17} /></span> : <span role="button" tabIndex={0} className="support-ticket__action-icon" title="Solicitar cierre" aria-label="Solicitar cierre" onClick={() => requestCloseForTicket(ticket.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); requestCloseForTicket(ticket.id); } }}><CheckCircle2 aria-hidden="true" size={17} /></span>}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
        <section
          className="support-conversation"
          aria-labelledby="admin-conversation-title"
        >
          {selected ? (
            <>
              <header className="support-conversation__header">
                <div>
                  <p className="support-eyebrow">Conversación</p>
                  <span className="support-conversation__folio">
                    {selected.folio}
                  </span>
                  <h3 id="admin-conversation-title">{selected.title}</h3>
                  <div className="support-conversation__meta">
                    <em
                      className={`feedback-status feedback-status--${selected.status}`}
                    >
                      {statusLabels[selected.status]}
                    </em>
                    <span>{priorityLabels[selected.priority]}</span>
                    <span>{categoryLabels[selected.category]}</span>
                    <span>
                      <CalendarDays aria-hidden="true" size={14} />{" "}
                      {formatDate(selected.createdAt)}
                    </span>
                  </div>
                </div>
                <button
                  className="icon-button"
                  aria-label="Cerrar detalle"
                  onClick={() => setSelected(null)}
                  type="button"
                >
                  <X aria-hidden="true" size={18} />
                </button>
              </header>
              <div className="support-messages" onScroll={(event) => { const node = event.currentTarget; stickToBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80; }}>
                {loadingMessages ? (
                  <p className="support-empty">Cargando conversación...</p>
                ) : timeline.length === 0 ? (
                  <p className="support-empty">
                    Aún no hay mensajes en esta conversación.
                  </p>
                ) : (
                  timeline.map((entry) => entry.kind === "message" ? (
                    <article
                      className={`support-message ${entry.item.authorId === user?.id ? "support-message--outgoing" : ""}`}
                      key={entry.item.id}
                    >
                      <div className={`support-message__avatar ${entry.item.authorId === user?.id ? "support-message__avatar--own" : "support-message__avatar--team"}`} aria-hidden="true">
                        {getInitials(entry.item.authorName, entry.item.authorId === user?.id ? "FM" : "Usuario")}
                      </div>
                      <div className="support-message__body">
                        <header>
                          <strong>{entry.item.authorId === user?.id ? "Equipo FleetMaster" : entry.item.authorName || "Usuario de la empresa"}</strong>
                          <time><Clock3 aria-hidden="true" size={13} /> {formatDate(entry.item.createdAt)}</time>
                        </header>
                        <p>{entry.item.message}</p>
                      </div>
                    </article>
                  ) : entry.kind === "close-request" ? (
                    <section className="support-close-event" aria-label="Solicitud de cierre" key={`close-request-${entry.item.id}`}>
                      <strong>El cliente solicita finalizar este ticket</strong>
                      <span>{entry.item.requestedSide === "organization" ? "La persona que abrió el caso considera completada la solicitud." : "Esperando confirmación de la persona que creó el ticket."}</span>
                      {entry.item.requestedSide === "organization" ? (
                        <div>
                          <button className="button button--primary" disabled={loadingClose} onClick={() => setCloseConfirmation("confirm")} type="button">Confirmar y cerrar ticket</button>
                          <button className="button button--secondary" disabled={loadingClose} onClick={() => void runCloseAction("reject")} type="button">Continuar trabajando</button>
                        </div>
                      ) : null}
                    </section>
                  ) : (
                    <section className="support-close-event support-close-event--historical" aria-label="Evento de cierre" key="closed-event">
                      <strong>✓ Ticket cerrado</strong>
                      <span>Cierre confirmado por ambas partes{selected.closedAt ? ` · ${formatDate(selected.closedAt)}` : ""}</span>
                    </section>
                  ))
                )}
                <div ref={messagesEndRef} aria-hidden="true" />
              </div>
              {selected.status === "closed" ? (
                <p className="support-closed">
                  Ticket cerrado · conversación de solo lectura
                </p>
              ) : (
                <form className="support-composer" onSubmit={submitMessage}>
                  <label className="sr-only" htmlFor="admin-ticket-reply">
                    Escribe un mensaje
                  </label>
                  <textarea
                    id="admin-ticket-reply"
                    onChange={(event) => setReply(event.target.value)}
                    placeholder="Escribe una respuesta..."
                    required
                    rows={3}
                    value={reply}
                  />
                  <button
                    className="button button--primary"
                    disabled={sendingReply}
                    type="submit"
                  >
                    <Send aria-hidden="true" size={16} />{" "}
                    {sendingReply ? "Enviando..." : "Enviar"}
                  </button>
                </form>
              )}
            </>
          ) : (
            <div className="support-no-selection">
              <span className="support-no-selection__icon">
                <MessageSquare aria-hidden="true" size={27} />
              </span>
              <h3 id="admin-conversation-title">Selecciona un ticket</h3>
              <p>Abre una solicitud para revisar la conversación completa.</p>
            </div>
          )}
        </section>
        <aside className="support-details-panel">
          <header>
            <span className="support-details-panel__icon">
              <CheckCircle2 aria-hidden="true" size={18} />
            </span>
            <div>
              <h3>Detalles del ticket</h3>
            </div>
          </header>
          {selected ? (
            <>
              <dl>
                <div>
                  <dt>Folio</dt>
                  <dd>{selected.folio}</dd>
                </div>
                <div>
                  <dt>Estado</dt>
                  <dd>
                    <em
                      className={`feedback-status feedback-status--${selected.status}`}
                    >
                      {statusLabels[selected.status]}
                    </em>
                  </dd>
                </div>
                <div>
                  <dt>Prioridad</dt>
                  <dd>{priorityLabels[selected.priority]}</dd>
                </div>
                <div>
                  <dt>Categoría</dt>
                  <dd>{categoryLabels[selected.category]}</dd>
                </div>
                <div>
                  <dt>Creado por</dt>
                  <dd>{selected.creatorName || "Usuario de la empresa"}</dd>
                </div>
                <div>
                  <dt>Organización</dt>
                  <dd>{organizationName}</dd>
                </div>
                <div>
                  <dt>Creado</dt>
                  <dd>{formatDate(selected.createdAt)}</dd>
                </div>
                <div>
                  <dt>Última actividad</dt>
                  <dd>{formatDate(selected.updatedAt)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="support-details-panel__empty">
              Los detalles del ticket seleccionado aparecerán aquí.
            </p>
          )}
        </aside>
      </div>
      {error ? (
        <p className="feedback-error" role="alert">
          {error}
        </p>
      ) : null}
      {closeConfirmation ? (
        <div className="support-confirmation-overlay">
          <section
            className="support-confirmation"
            aria-labelledby="admin-close-ticket-title"
            aria-modal="true"
            role="dialog"
          >
            <h2 id="admin-close-ticket-title">
              {closeConfirmation === "request"
                ? "Solicitar cierre"
                : "Cerrar ticket"}
            </h2>
            <p>
              {closeConfirmation === "request"
                ? "La organización deberá confirmar antes de que el ticket se cierre."
                : "Ambas partes consideran terminado este caso. Después de cerrarlo, la conversación quedará disponible como historial de sólo lectura."}
            </p>
            <footer>
              <button
                className="button button--secondary"
                disabled={loadingClose}
                onClick={() => setCloseConfirmation(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                disabled={loadingClose}
                onClick={() => void runCloseAction(closeConfirmation)}
                type="button"
              >
                {loadingClose
                  ? "Actualizando..."
                  : closeConfirmation === "request"
                    ? "Solicitar cierre"
                    : "Confirmar cierre"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
