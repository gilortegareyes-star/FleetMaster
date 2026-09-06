import {
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  LockKeyhole,
  MessageSquare,
  Plus,
  Search,
  Send,
  Tag,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  addFeedbackTicketMessage,
  cancelFeedbackTicketClose,
  createFeedbackTicket,
  getFeedbackTicketMessages,
  getPendingFeedbackTicketCloseRequest,
  listPendingFeedbackTicketCloseRequests,
  listFeedbackUnreadTickets,
  listMyFeedbackTickets,
  markFeedbackTicketRead,
  requestFeedbackTicketClose,
  respondFeedbackTicketClose,
} from "../services/feedback";
import { getSupabaseClient } from "../services/supabase";
import {
  feedbackCategories,
  type FeedbackCategory,
  type FeedbackStatus,
  type FeedbackTicket,
  type FeedbackTicketCloseRequest,
  type FeedbackTicketMessage,
  type FeedbackUnreadTicket,
} from "../types/feedback";

const categoryLabels: Record<FeedbackCategory, string> = {
  problem: "Problema",
  improvement: "Mejora",
  suggestion: "Sugerencia",
  support: "Soporte",
};
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
const formatDay = (value: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(
    new Date(value),
  );
const getInitials = (name: string | null, fallback: string) => {
  const source = name?.trim() || fallback;
  const parts = source.split(/\s+/).filter(Boolean);
  return parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : source.slice(0, 2).toUpperCase();
};

export function FeedbackPanel({
  canManageClosure = false,
  onRefreshUnread,
  unreadTickets,
}: {
  canManageClosure?: boolean;
  onRefreshUnread?: () => Promise<void>;
  unreadTickets?: FeedbackUnreadTicket[];
} = {}) {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<FeedbackTicket[]>([]);
  const [selected, setSelected] = useState<FeedbackTicket | null>(null);
  const [messages, setMessages] = useState<FeedbackTicketMessage[]>([]);
  const [pendingClose, setPendingClose] =
    useState<FeedbackTicketCloseRequest | null>(null);
  const [pendingCloseByTicket, setPendingCloseByTicket] = useState<Map<string, FeedbackTicketCloseRequest>>(new Map());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingClose, setLoadingClose] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [closeConfirmation, setCloseConfirmation] = useState<
    "request" | "confirm" | null
  >(null);
  const [filter, setFilter] = useState<"all" | FeedbackStatus>("all");
  const [search, setSearch] = useState("");
  const [localUnreadTickets, setLocalUnreadTickets] = useState<
    FeedbackUnreadTicket[]
  >([]);
  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setTickets(await listMyFeedbackTickets());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar tus tickets.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    void listPendingFeedbackTicketCloseRequests()
      .then((requests) => setPendingCloseByTicket(new Map(requests.map((request) => [request.ticketId, request]))))
      .catch(() => undefined);
  }, [tickets.length]);
  const refreshUnread =
    onRefreshUnread ??
    (async () => {
      setLocalUnreadTickets(await listFeedbackUnreadTickets());
    });
  useEffect(() => {
    if (!unreadTickets) void refreshUnread();
  }, []);
  const openTicket = async (ticket: FeedbackTicket) => {
    if (selected?.id === ticket.id) return;
    setSelected(ticket);
    setMessages([]);
    setError(null);
    try {
      await markFeedbackTicketRead(ticket.id);
      await refreshUnread();
    } catch {
      setError("No se pudo actualizar la lectura del ticket.");
    }
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
    const [nextTickets, nextPending] = await Promise.all([
      listMyFeedbackTickets(),
      getPendingFeedbackTicketCloseRequest(selected.id),
    ]);
    const nextRequests = await listPendingFeedbackTicketCloseRequests();
    setTickets(nextTickets);
    const nextSelected = nextTickets.find((ticket) => ticket.id === selected.id) ?? null;
    setSelected(nextSelected && (filter === "all" || nextSelected.status === filter) ? nextSelected : null);
    setPendingClose(nextPending);
    setPendingCloseByTicket(new Map(nextRequests.map((request) => [request.ticketId, request])));
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
      setSuccess(
        action === "request"
          ? "Solicitud de cierre enviada."
          : action === "confirm"
            ? "Ticket cerrado con la conformidad de ambas partes."
            : action === "reject"
              ? "La solicitud fue rechazada y la conversación continúa."
              : "Solicitud de cierre cancelada.",
      );
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
      const [nextTickets, nextRequests] = await Promise.all([listMyFeedbackTickets(), listPendingFeedbackTicketCloseRequests()]);
      setTickets(nextTickets);
      setPendingCloseByTicket(new Map(nextRequests.map((request) => [request.ticketId, request])));
      setSuccess("Solicitud de cierre cancelada.");
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "No se pudo cancelar la solicitud de cierre.");
    } finally {
      setLoadingClose(false);
    }
  };
  const requestCloseForTicket = (ticketId: string) => {
    const ticket = tickets.find((item) => item.id === ticketId);
    if (!ticket) return;
    setSelected(ticket);
    setCloseConfirmation("request");
  };
  const viewerSide = canManageClosure ? "fleetmaster" : "organization";
  const isSelectedTicketCreator = selected?.createdBy === user?.id;
  const unreadTicketIds = new Set(
    (unreadTickets ?? localUnreadTickets).map((item) => item.ticketId),
  );
  const filteredTickets = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return tickets.filter(
      (ticket) =>
        (filter === "all" || ticket.status === filter) &&
        (!normalized ||
          `${ticket.folio} ${ticket.title} ${categoryLabels[ticket.category]} ${statusLabels[ticket.status]} ${priorityLabels[ticket.priority]}`
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
      .channel(`feedback-ticket-${selected.id}`)
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
          void markFeedbackTicketRead(selected.id)
            .then(refreshUnread)
            .catch(() => undefined);
        },
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
        if (active) mergeMessages(loaded);
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
  const submitTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    try {
      const ticket = await createFeedbackTicket(
        String(form.get("title") ?? "").trim(),
        String(form.get("category") ?? "problem") as FeedbackCategory,
        String(form.get("message") ?? "").trim(),
      );
      setIsFormOpen(false);
      setSuccess("Ticket creado correctamente.");
      await refresh();
      await openTicket(ticket);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo crear el ticket.",
      );
    }
  };
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
      setTickets(await listMyFeedbackTickets());
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
      className="support-center support-center--client"
      data-support-view="client"
      aria-labelledby="feedback-title"
    >
      <header className="support-center__header">
        <div className="support-center__heading">
          <div>
            <p className="organization-account-kicker">Centro de soporte</p>
            <h2 id="feedback-title">¿En qué podemos ayudarte?</h2>
            <span>
              Reporta un problema, solicita una mejora o comparte una
              sugerencia.
            </span>
          </div>
        </div>
        <button
          className="button button--primary"
          onClick={() => {
            setIsFormOpen(true);
            setError(null);
          }}
          type="button"
        >
          <Plus aria-hidden="true" size={17} /> Nuevo ticket
        </button>
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
          aria-labelledby="support-list-title"
        >
          <header>
            <div>
              <p className="support-eyebrow">Bandeja personal</p>
              <h3 id="support-list-title">Mis tickets</h3>
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
              placeholder="Buscar por folio, título o categoría"
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
                  ? "Aún no tienes tickets"
                  : "No hay coincidencias"}
              </strong>
              <span>
                {tickets.length === 0
                  ? "Cuando necesites ayuda, crea un ticket y te responderemos desde aquí."
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
                    {unreadTicketIds.has(ticket.id) ? (
                      <em className="support-ticket__unread">Nuevo</em>
                    ) : null}
                    <time>{formatDay(ticket.updatedAt)}</time>
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
                      {categoryLabels[ticket.category]} ·{" "}
                      {priorityLabels[ticket.priority]}
                    </small>
                    <span className="support-ticket__actions" onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}>
                      {ticket.status === "closed" ? (
                        <span className="support-ticket__action-icon" title="Ticket cerrado" aria-label="Ticket cerrado"><LockKeyhole aria-hidden="true" size={17} /></span>
                      ) : pendingCloseByTicket.has(ticket.id) ? (
                        pendingCloseByTicket.get(ticket.id)?.requestedSide === viewerSide ? (
                          <>
                            <span className="support-ticket__action-icon" title={canManageClosure ? "Esperando confirmación del cliente" : "Esperando confirmación de FleetMaster"} aria-label={canManageClosure ? "Esperando confirmación del cliente" : "Esperando confirmación de FleetMaster"}><Clock3 aria-hidden="true" size={17} /></span>
                            {canManageClosure || ticket.createdBy === user?.id ? <span role="button" tabIndex={0} className="support-ticket__action-icon" title="Cancelar solicitud de cierre" aria-label="Cancelar solicitud de cierre" onClick={() => void runCloseActionForTicket(ticket.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); void runCloseActionForTicket(ticket.id); } }}><X aria-hidden="true" size={17} /></span> : null}
                          </>
                        ) : <span className="support-ticket__action-icon" title="Solicitud de cierre pendiente" aria-label="Solicitud de cierre pendiente"><CircleAlert aria-hidden="true" size={17} /></span>
                      ) : canManageClosure || ticket.createdBy === user?.id ? (
                        <span role="button" tabIndex={0} className="support-ticket__action-icon" title="Solicitar cierre" aria-label="Solicitar cierre" onClick={() => requestCloseForTicket(ticket.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); requestCloseForTicket(ticket.id); } }}><CheckCircle2 aria-hidden="true" size={17} /></span>
                      ) : null}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
        <section
          className="support-conversation"
          aria-labelledby="support-conversation-title"
        >
          {selected ? (
            <>
              <header className="support-conversation__header">
                <div>
                  <p className="support-eyebrow">Conversación</p>
                  <span className="support-conversation__folio">
                    {selected.folio}
                  </span>
                  <h3 id="support-conversation-title">{selected.title}</h3>
                  <div className="support-conversation__meta">
                    <em
                      className={`feedback-status feedback-status--${selected.status}`}
                    >
                      {statusLabels[selected.status]}
                    </em>
                    <span>{categoryLabels[selected.category]}</span>
                    <span>{priorityLabels[selected.priority]}</span>
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
              <div className="support-messages">
                {loadingMessages ? (
                  <p className="support-empty">Cargando conversación...</p>
                ) : messages.length === 0 && !pendingClose && selected.status !== "closed" ? (
                  <p className="support-empty">
                    Aún no hay mensajes en esta conversación.
                  </p>
                ) : (
                  <>
                    {selected.status === "closed" ? (
                      <section className="support-close-event support-close-event--historical" aria-label="Evento de cierre">
                        <strong>✓ Ticket cerrado</strong>
                        <span>Cierre confirmado por ambas partes{selected.closedAt ? ` · ${formatDate(selected.closedAt)}` : ""}</span>
                      </section>
                    ) : pendingClose ? (
                      <section className="support-close-event" aria-label="Solicitud de cierre">
                        <strong>{pendingClose.requestedSide === "fleetmaster" ? "FleetMaster solicita finalizar este ticket" : "La organización solicita finalizar este ticket"}</strong>
                        <span>{pendingClose.requestedSide === "fleetmaster" ? (isSelectedTicketCreator ? "Consideramos que este caso está completado. ¿Confirmas que podemos cerrarlo?" : "Esperando confirmación de la persona que creó el ticket.") : "Solicitud de cierre enviada. Esperando confirmación de FleetMaster."}</span>
                        {pendingClose.requestedSide === "fleetmaster" && isSelectedTicketCreator ? (
                          <div>
                            <button className="button button--primary" disabled={loadingClose} onClick={() => setCloseConfirmation("confirm")} type="button">Confirmar y cerrar ticket</button>
                            <button className="button button--secondary" disabled={loadingClose} onClick={() => void runCloseAction("reject")} type="button">Continuar conversación</button>
                          </div>
                        ) : null}
                      </section>
                    ) : null}
                    {messages.map((item) => (
                      <article
                        className={`support-message ${item.authorId === user?.id ? "support-message--outgoing" : ""}`}
                        key={item.id}
                      >
                        <div
                          className={`support-message__avatar ${item.authorId === user?.id ? "support-message__avatar--own" : "support-message__avatar--team"}`}
                          aria-hidden="true"
                        >
                          {getInitials(
                            item.authorName,
                            item.authorId === user?.id ? "Usuario" : "FM",
                          )}
                        </div>
                        <div className="support-message__body">
                          <header>
                            <strong>
                              {item.authorId === user?.id
                                ? item.authorName || "Usuario"
                                : "Equipo FleetMaster"}
                            </strong>
                            <time>
                              <Clock3 aria-hidden="true" size={13} />{" "}
                              {formatDate(item.createdAt)}
                            </time>
                          </header>
                          <p>{item.message}</p>
                        </div>
                      </article>
                    ))}
                  </>
                )}
              </div>
              {selected.status === "closed" ? (
                <p className="support-closed">
                  Ticket cerrado · conversación de solo lectura
                </p>
              ) : (
                <form className="support-composer" onSubmit={submitMessage}>
                  <label className="sr-only" htmlFor="client-ticket-reply">
                    Escribe un mensaje
                  </label>
                  <textarea
                    id="client-ticket-reply"
                    onChange={(event) => setReply(event.target.value)}
                    placeholder="Escribe un mensaje..."
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
              <h3 id="support-conversation-title">Selecciona un ticket</h3>
              <p>
                Elige una solicitud de la bandeja para consultar la
                conversación.
              </p>
            </div>
          )}
        </section>
        <aside className="support-details-panel">
          <header>
            <span className="support-details-panel__icon">
              <CheckCircle2 aria-hidden="true" size={18} />
            </span>
            <div>
              <p className="support-eyebrow">Contexto</p>
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
      {success ? (
        <p className="feedback-success" role="status">
          {success}
        </p>
      ) : null}
      {error ? (
        <p className="feedback-error" role="alert">
          {error}
        </p>
      ) : null}
      {closeConfirmation ? (
        <div className="support-confirmation-overlay">
          <section
            className="support-confirmation"
            aria-labelledby="close-ticket-title"
            aria-modal="true"
            role="dialog"
          >
            <h2 id="close-ticket-title">
              {closeConfirmation === "request"
                ? "Solicitar cierre"
                : "Cerrar ticket"}
            </h2>
            <p>
              {closeConfirmation === "request"
                ? "La otra parte deberá confirmar antes de que el ticket se cierre."
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
      {isFormOpen ? (
        <div className="support-ticket-modal-overlay">
          <section
            className="support-ticket-modal"
            aria-labelledby="new-ticket-title"
            aria-modal="true"
            role="dialog"
          >
            <header className="support-ticket-modal__header">
              <div>
                <p className="organization-account-kicker">Nuevo ticket</p>
                <h2 id="new-ticket-title">Cuéntanos qué sucede</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Cerrar"
                onClick={() => setIsFormOpen(false)}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <form
              className="support-ticket-modal__form"
              onSubmit={submitTicket}
            >
              <label className="field">
                <span>Título</span>
                <input name="title" maxLength={200} required />
              </label>
              <label className="field">
                <span>Categoría</span>
                <select defaultValue="problem" name="category">
                  {feedbackCategories.map((category) => (
                    <option key={category} value={category}>
                      {categoryLabels[category]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Mensaje</span>
                <textarea maxLength={5000} name="message" required rows={6} />
              </label>
              <footer className="support-ticket-modal__footer">
                <button
                  className="button button--secondary"
                  onClick={() => setIsFormOpen(false)}
                  type="button"
                >
                  Cancelar
                </button>
                <button className="button button--primary" type="submit">
                  <Plus aria-hidden="true" size={17} /> Crear ticket
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
