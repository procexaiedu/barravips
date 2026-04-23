"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type {
  ConversationDetailRead,
  ConversationMessageRead,
  HandoffEventRead,
} from "@/contracts";
import { bffFetch, type BffFetchError } from "@/features/shared/bff-client";
import { ConfirmModal } from "@/features/shared/confirm-modal";
import { formatCurrency, formatDateTime, formatRelativeSeconds } from "@/features/shared/formatters";
import {
  acknowledgeHandoff,
  handoffActionMessage,
  releaseHandoff,
} from "@/features/shared/handoff-actions";
import {
  clientStatusLabel,
  conversationStateLabel,
  flowTypeLabel,
  handoffReasonLabel,
  handoffStatusLabel,
  mediaApprovalLabel,
  mediaTypeLabel,
  urgencyProfileLabel,
} from "@/features/shared/labels";

const ACTIVE_POLL_MS = 10_000;
const IDLE_POLL_MS = 20_000;

type Props = {
  conversationId: string;
};

export function ConversaDetalheClient({ conversationId }: Props) {
  const [detail, setDetail] = useState<ConversationDetailRead | null>(null);
  const [error, setError] = useState<BffFetchError | null>(null);
  const [firstLoad, setFirstLoad] = useState(true);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [pendingRelease, setPendingRelease] = useState(false);

  const load = useCallback(async () => {
    const result = await bffFetch<ConversationDetailRead>(
      `/api/operator/conversations/${encodeURIComponent(conversationId)}`,
    );
    setDetail(result.data);
    setError(result.error);
    setFirstLoad(false);
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handoff = detail?.conversation.handoff_status;
    const active = handoff === "OPENED" || handoff === "ACKNOWLEDGED";
    const interval = active ? ACTIVE_POLL_MS : IDLE_POLL_MS;
    const id = window.setInterval(() => {
      void load();
    }, interval);
    return () => window.clearInterval(id);
  }, [detail?.conversation.handoff_status, load]);

  const onAcknowledge = useCallback(async () => {
    setBusy(true);
    setAction(null);
    const result = await acknowledgeHandoff(conversationId);
    setBusy(false);
    if (result.error) {
      setAction(handoffActionMessage("acknowledge", result.error.status));
    } else {
      setAction("Você assumiu esta conversa. A IA não vai mais responder até você devolver.");
    }
    await load();
  }, [conversationId, load]);

  const onConfirmRelease = useCallback(async () => {
    setBusy(true);
    setAction(null);
    const result = await releaseHandoff(conversationId);
    setBusy(false);
    setPendingRelease(false);
    if (result.error) {
      setAction(handoffActionMessage("release", result.error.status));
    } else {
      setAction("Conversa devolvida. A IA volta a responder automaticamente.");
    }
    await load();
  }, [conversationId, load]);

  if (firstLoad) {
    return (
      <div className="panel" role="status">
        <div className="panel-heading">
          <h2>Carregando conversa</h2>
          <span className="badge muted">Buscando</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <section className="panel error-panel">
        <div className="panel-heading">
          <h2>Não consegui carregar esta conversa</h2>
          <span className="badge danger">Erro</span>
        </div>
        <p>{error.message}</p>
        <div className="button-row">
          <button className="button secondary" type="button" onClick={() => void load()}>
            Tentar novamente
          </button>
          <Link className="button secondary" href="/conversas">
            Voltar para a lista
          </Link>
        </div>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="panel">
        <div className="panel-heading">
          <h2>Conversa não encontrada</h2>
          <span className="badge muted">Vazio</span>
        </div>
        <p className="empty-state">Não achamos essa conversa. Pode ter sido apagada ou o link está quebrado.</p>
      </section>
    );
  }

  const conversation = detail.conversation;
  const handoff = conversation.handoff_status;
  const canAcknowledge = handoff === "OPENED";
  const canRelease = handoff === "OPENED" || handoff === "ACKNOWLEDGED";

  return (
    <div className="section-stack">
      {action ? <div className="panel-notice warning">{action}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <h2>{conversation.client.display_name || conversation.client.whatsapp_jid}</h2>
          <div className="inline-actions">
            <span className="chip">{conversationStateLabel(conversation.state)}</span>
            <span
              className={
                conversation.flow_type === "EXTERNAL" ? "chip warning" : "chip"
              }
            >
              {flowTypeLabel(conversation.flow_type)}
            </span>
            <HandoffChip status={handoff} />
          </div>
        </div>
        <dl className="kv-list">
          <div>
            <dt>WhatsApp</dt>
            <dd>{conversation.client.whatsapp_jid}</dd>
          </div>
          <div>
            <dt>Modelo</dt>
            <dd>{conversation.model.display_name}</dd>
          </div>
          <div>
            <dt>Tipo de cliente</dt>
            <dd>{clientStatusLabel(conversation.client.client_status) || "—"}</dd>
          </div>
          <div>
            <dt>Idioma</dt>
            <dd>{conversation.client.language_hint || "—"}</dd>
          </div>
          <div>
            <dt>Perfil</dt>
            <dd>{conversation.client.profile_summary || "—"}</dd>
          </div>
          <div>
            <dt>Resumo da conversa</dt>
            <dd>{conversation.summary || "—"}</dd>
          </div>
          <div>
            <dt>Próximo passo da IA</dt>
            <dd>{conversation.pending_action || "—"}</dd>
          </div>
          <div>
            <dt>IA esperando do cliente</dt>
            <dd>{conversation.awaiting_input_type || "—"}</dd>
          </div>
          <div>
            <dt>Cliente precisa responder</dt>
            <dd>{conversation.awaiting_client_decision ? "sim" : "não"}</dd>
          </div>
          <div>
            <dt>Urgência</dt>
            <dd>{urgencyProfileLabel(conversation.urgency_profile) || "—"}</dd>
          </div>
          <div>
            <dt>Valor combinado</dt>
            <dd>{formatCurrency(conversation.expected_amount)}</dd>
          </div>
          <div>
            <dt>Última transferência</dt>
            <dd>{formatDateTime(conversation.last_handoff_at)}</dd>
          </div>
          <div>
            <dt>Última mensagem</dt>
            <dd>{formatDateTime(conversation.last_message_at)}</dd>
          </div>
        </dl>
        <div className="button-row">
          <button
            className="button"
            type="button"
            disabled={!canAcknowledge || busy}
            onClick={() => void onAcknowledge()}
          >
            Assumi esta conversa
          </button>
          <button
            className="button danger"
            type="button"
            disabled={!canRelease || busy}
            onClick={() => setPendingRelease(true)}
          >
            Devolver para IA
          </button>
          <Link className="button secondary" href="/conversas">
            Voltar para a lista
          </Link>
        </div>
      </section>

      <div className="detail-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Histórico de mensagens</h2>
            <span className="badge muted">{detail.messages.length}</span>
          </div>
          {detail.messages.length === 0 ? (
            <p className="empty-state">Ainda não há mensagens nesta conversa.</p>
          ) : (
            <div className="timeline">
              {detail.messages.map((message) => (
                <MessageEntry key={message.id} message={message} />
              ))}
            </div>
          )}
        </section>

        <div className="section-stack">
          <section className="panel">
            <div className="panel-heading">
              <h2>Última resposta da IA</h2>
              <span className="badge muted">
                {detail.agent_execution ? agentStatusLabel(detail.agent_execution.status) : "sem dado"}
              </span>
            </div>
            {detail.agent_execution ? (
              <dl className="kv-list">
                <div>
                  <dt>Como foi</dt>
                  <dd>{agentStatusLabel(detail.agent_execution.status)}</dd>
                </div>
                <div>
                  <dt>Tempo de resposta</dt>
                  <dd>
                    {detail.agent_execution.duration_ms === null
                      ? "-"
                      : `${detail.agent_execution.duration_ms} ms`}
                  </dd>
                </div>
                <div>
                  <dt>Ferramentas usadas</dt>
                  <dd>{detail.agent_execution.tool_count}</dd>
                </div>
                <div>
                  <dt>ID interno (para suporte)</dt>
                  <dd className="mono">{detail.agent_execution.trace_id}</dd>
                </div>
              </dl>
            ) : (
              <p className="empty-state">A IA ainda não respondeu nesta conversa.</p>
            )}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>Histórico de transferências</h2>
              <span className="badge muted">{detail.handoff_events.length}</span>
            </div>
            {detail.handoff_events.length === 0 ? (
              <p className="empty-state">Nunca foi transferida — a IA atendeu o tempo todo.</p>
            ) : (
              <div className="stack-sm">
                {detail.handoff_events.map((event, index) => (
                  <HandoffEntry key={event.id ?? index} event={event} />
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>Mídias da modelo</h2>
              <span className="badge muted">{detail.media.length}</span>
            </div>
            {detail.media.length === 0 ? (
              <p className="empty-state">Nenhuma mídia cadastrada para esta modelo.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Categoria</th>
                    <th>Situação</th>
                    <th className="numeric">Atualizada</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.media.map((media) => (
                    <tr key={media.id}>
                      <td>{mediaTypeLabel(media.media_type)}</td>
                      <td className="muted-cell">{media.category || "-"}</td>
                      <td>
                        <span
                          className={
                            media.approval_status === "APPROVED" ? "chip gold" : "chip"
                          }
                        >
                          {mediaApprovalLabel(media.approval_status)}
                        </span>
                      </td>
                      <td className="numeric muted-cell">
                        {formatDateTime(media.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>

      {pendingRelease ? (
        <ConfirmModal
          title="Devolver conversa para a IA"
          description={
            <div className="stack-sm">
              <p>A IA vai voltar a responder esta conversa automaticamente. Confirma?</p>
              <dl className="kv-list">
                <div>
                  <dt>Cliente</dt>
                  <dd>
                    {conversation.client.display_name || conversation.client.whatsapp_jid}
                  </dd>
                </div>
                <div>
                  <dt>Situação</dt>
                  <dd>{conversationStateLabel(conversation.state)}</dd>
                </div>
                <div>
                  <dt>Última mensagem</dt>
                  <dd>{conversation.last_message?.content_preview || "-"}</dd>
                </div>
              </dl>
            </div>
          }
          confirmLabel="Devolver para IA"
          tone="danger"
          loading={busy}
          onConfirm={() => void onConfirmRelease()}
          onCancel={() => setPendingRelease(false)}
        />
      ) : null}
    </div>
  );
}

function MessageEntry({ message }: { message: ConversationMessageRead }) {
  const roleClass = `timeline-entry role-${message.role}`;
  const directionArrow = message.direction === "INBOUND" ? "←" : "→";
  const directionLabel = message.direction === "INBOUND" ? "cliente" : "modelo";
  return (
    <article className={roleClass}>
      <header>
        <span>
          {directionArrow} {directionLabel} · {messageTypeLabel(message.message_type)}
        </span>
        <span>{formatDateTime(message.created_at)}</span>
      </header>
      <p>{message.content_text ?? "(sem texto)"}</p>
      {message.delivery_status || message.trace_id ? (
        <div className="inline-actions" style={{ marginTop: 6, flexWrap: "wrap" }}>
          {message.delivery_status ? (
            <span className="chip" title="Situação do envio no WhatsApp">
              {deliveryStatusLabel(message.delivery_status)}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function HandoffEntry({ event }: { event: HandoffEventRead }) {
  return (
    <div className="timeline-entry">
      <header>
        <span>
          {handoffEventLabel(event.event_type)} · por {event.source}
        </span>
        <span>{formatRelativeSeconds(event.created_at)}</span>
      </header>
      <dl className="kv-list" style={{ marginTop: 6 }}>
        <div>
          <dt>Situação anterior</dt>
          <dd>{handoffStatusLabel(event.previous_handoff_status)}</dd>
        </div>
        {event.actor_label ? (
          <div>
            <dt>Quem fez</dt>
            <dd>{event.actor_label}</dd>
          </div>
        ) : null}
        {event.reason ? (
          <div>
            <dt>Motivo</dt>
            <dd>{handoffReasonLabel(event.reason) || event.reason}</dd>
          </div>
        ) : null}
        <div>
          <dt>Quando</dt>
          <dd>{formatDateTime(event.created_at)}</dd>
        </div>
      </dl>
    </div>
  );
}

function HandoffChip({ status }: { status: string }) {
  const label = handoffStatusLabel(status);
  if (status === "OPENED") {
    return <span className="chip danger">{label}</span>;
  }
  if (status === "ACKNOWLEDGED") {
    return <span className="chip warning">{label}</span>;
  }
  if (status === "RELEASED") {
    return <span className="chip gold">{label}</span>;
  }
  return <span className="chip">{label}</span>;
}

function agentStatusLabel(status: string): string {
  switch (status) {
    case "SUCCESS":
      return "Respondeu com sucesso";
    case "PARTIAL":
      return "Respondeu parcialmente";
    case "FAILED":
      return "Falhou";
    case "SKIPPED":
      return "Não respondeu (ignorou)";
    default:
      return status;
  }
}

function messageTypeLabel(type: string): string {
  switch (type) {
    case "text":
      return "texto";
    case "image":
      return "foto";
    case "audio":
      return "áudio";
    case "video":
      return "vídeo";
    case "document":
      return "documento";
    default:
      return type;
  }
}

function deliveryStatusLabel(status: string): string {
  switch (status.toUpperCase()) {
    case "SENT":
      return "enviada";
    case "DELIVERED":
      return "entregue";
    case "READ":
      return "lida";
    case "FAILED":
      return "falhou";
    case "PENDING":
      return "enviando";
    default:
      return status;
  }
}

function handoffEventLabel(eventType: string): string {
  switch (eventType) {
    case "handoff_opened":
      return "IA transferiu para a modelo";
    case "handoff_acknowledged":
      return "Modelo assumiu";
    case "handoff_released":
      return "Devolvida para a IA";
    default:
      return eventType;
  }
}
