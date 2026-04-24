"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type {
  ConversationDetailRead,
  ConversationMessageRead,
  HandoffEventRead,
  PaginatedEnvelope,
  ReceiptRead,
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
  deliveryStatusLabel,
  flowTypeLabel,
  handoffReasonLabel,
  handoffStatusLabel,
  mediaApprovalLabel,
  mediaTypeLabel,
  receiptAnalysisStatusLabel,
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
  const [receipts, setReceipts] = useState<ReceiptRead[]>([]);
  const [receiptError, setReceiptError] = useState<BffFetchError | null>(null);

  const load = useCallback(async () => {
    const result = await bffFetch<ConversationDetailRead>(
      `/api/operator/conversations/${encodeURIComponent(conversationId)}`,
    );
    setDetail(result.data);
    setError(result.error);
    setFirstLoad(false);
  }, [conversationId]);

  const loadReceipts = useCallback(async () => {
    const params = new URLSearchParams({
      conversation_id: conversationId,
      page_size: "5",
    });
    const result = await bffFetch<PaginatedEnvelope<ReceiptRead>>(
      `/api/operator/receipts?${params.toString()}`,
    );
    setReceipts(result.data?.items ?? []);
    setReceiptError(result.error);
  }, [conversationId]);

  useEffect(() => {
    void load();
    void loadReceipts();
  }, [load, loadReceipts]);

  useEffect(() => {
    const handoff = detail?.conversation.handoff_status;
    const active = handoff === "OPENED" || handoff === "ACKNOWLEDGED";
    const interval = active ? ACTIVE_POLL_MS : IDLE_POLL_MS;
    const id = window.setInterval(() => {
      void load();
      void loadReceipts();
    }, interval);
    return () => window.clearInterval(id);
  }, [detail?.conversation.handoff_status, load, loadReceipts]);

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
  const latestReceipt = receipts[0] ?? null;

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
            <dt>Último atendimento humano</dt>
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

      <section className="panel">
        <div className="panel-heading">
          <h2>Contexto</h2>
          <div className="inline-actions">
            {urgencyProfileLabel(conversation.urgency_profile) ? (
              <span className="chip warning">{urgencyProfileLabel(conversation.urgency_profile)}</span>
            ) : null}
            {conversation.expected_amount ? (
              <span className="chip">valor combinado {formatCurrency(conversation.expected_amount)}</span>
            ) : null}
          </div>
        </div>
        <div className="context-summary">
          <SummaryText value={conversation.summary} />
          <dl className="kv-list">
            <div>
              <dt>Próximo passo</dt>
              <dd>{conversation.pending_action || "—"}</dd>
            </div>
            <div>
              <dt>IA esperando</dt>
              <dd>{conversation.awaiting_input_type || "—"}</dd>
            </div>
            <div>
              <dt>Cliente precisa responder</dt>
              <dd>{conversation.awaiting_client_decision ? "sim" : "não"}</dd>
            </div>
            <div>
              <dt>Valor esperado</dt>
              <dd>{formatCurrency(conversation.expected_amount)}</dd>
            </div>
          </dl>
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
          {latestReceipt || receiptError ? (
            <ReceiptPanel
              conversationId={conversation.id}
              expectedAmount={conversation.expected_amount}
              receipt={latestReceipt}
              total={receipts.length}
              error={receiptError}
            />
          ) : null}

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
              <h2>Histórico de atendimento humano</h2>
              <span className="badge muted">{detail.handoff_events.length}</span>
            </div>
            {detail.handoff_events.length === 0 ? (
              <p className="empty-state">Nunca precisou de atendimento humano — a IA atendeu o tempo todo.</p>
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

function SummaryText({ value }: { value: string | null | undefined }) {
  const [expanded, setExpanded] = useState(false);
  if (!value) {
    return <p className="context-summary-text empty-state">Sem resumo registrado para esta conversa.</p>;
  }
  const shouldTruncate = value.length > 220;
  const visible = !expanded && shouldTruncate ? `${value.slice(0, 220).trim()}...` : value;
  return (
    <div className="context-summary-text">
      <p>{visible}</p>
      {shouldTruncate ? (
        <button className="inline-text-button" type="button" onClick={() => setExpanded(!expanded)}>
          {expanded ? "ver menos" : "ver mais"}
        </button>
      ) : null}
    </div>
  );
}

function ReceiptPanel({
  conversationId,
  expectedAmount,
  receipt,
  total,
  error,
}: {
  conversationId: string;
  expectedAmount: string | number | null | undefined;
  receipt: ReceiptRead | null;
  total: number;
  error: BffFetchError | null;
}) {
  const receiptExpectedAmount = receipt?.expected_amount ?? expectedAmount;
  const amountMismatch = receipt ? amountsDiverge(receipt.detected_amount, receiptExpectedAmount) : false;
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Comprovante</h2>
        <span className={error ? "badge danger" : "badge muted"}>
          {error ? "erro" : total > 1 ? `${total} itens` : "vinculado"}
        </span>
      </div>
      {error ? (
        <p className="panel-notice">{error.message}</p>
      ) : receipt ? (
        <div className="stack-sm">
          <dl className="kv-list">
            <div>
              <dt>Detectado</dt>
              <dd className={amountMismatch ? "receipt-amount danger" : "receipt-amount"}>
                {formatCurrency(receipt.detected_amount)}
              </dd>
            </div>
            <div>
              <dt>Esperado</dt>
              <dd className={amountMismatch ? "receipt-amount danger" : "receipt-amount"}>
                {formatCurrency(receiptExpectedAmount)}
              </dd>
            </div>
            <div>
              <dt>Análise</dt>
              <dd>
                <ReceiptAnalysisBadge status={receipt.analysis_status} />
              </dd>
            </div>
            <div>
              <dt>Revisão humana</dt>
              <dd>
                <span className={receipt.needs_review ? "chip warning" : "chip"}>
                  {receipt.needs_review ? "precisa revisar" : "sem pendência"}
                </span>
              </dd>
            </div>
          </dl>
          {amountMismatch ? (
            <p className="panel-notice warning">Valor detectado diferente do valor esperado.</p>
          ) : null}
          <Link className="link-pill" href={`/comprovantes?conversation_id=${encodeURIComponent(conversationId)}`}>
            Abrir comprovantes
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function ReceiptAnalysisBadge({ status }: { status: ReceiptRead["analysis_status"] }) {
  if (status === "INVALID") {
    return <span className="badge danger">{receiptAnalysisStatusLabel(status)}</span>;
  }
  if (status === "PENDING" || status === "UNCERTAIN" || status === "NEEDS_REVIEW") {
    return <span className="badge warning">{receiptAnalysisStatusLabel(status)}</span>;
  }
  return <span className="badge ok">{receiptAnalysisStatusLabel(status)}</span>;
}

function MessageEntry({ message }: { message: ConversationMessageRead }) {
  const roleClass = `timeline-entry role-${message.role}`;
  const directionArrow = message.direction === "INBOUND" ? "←" : "→";
  const directionLabel = message.direction === "INBOUND" ? "cliente" : "modelo";
  const deliveryLabel =
    message.direction === "OUTBOUND" ? deliveryStatusLabel(message.delivery_status) : null;
  return (
    <article className={roleClass}>
      <header>
        <span className="timeline-meta">
          <span className="message-type-icon" title={messageTypeLabel(message.message_type)} aria-hidden="true">
            {messageTypeIcon(message.message_type)}
          </span>
          {directionArrow} {directionLabel}
        </span>
        <span>{formatDateTime(message.created_at)}</span>
      </header>
      <p>{message.content_text ?? "(sem texto)"}</p>
      {deliveryLabel ? (
        <div className="inline-actions" style={{ marginTop: 6, flexWrap: "wrap" }}>
          <span className={deliveryStatusChipClass(message.delivery_status)} title="Situação do envio no WhatsApp">
            {deliveryLabel}
          </span>
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

function messageTypeIcon(type: string): string {
  switch (type) {
    case "image":
      return "▧";
    case "audio":
      return "♪";
    case "video":
      return "▶";
    case "document":
      return "▤";
    case "system":
      return "*";
    default:
      return "T";
  }
}

function deliveryStatusChipClass(status: string | null): string {
  switch (status?.toUpperCase()) {
    case "FAILED":
      return "chip danger";
    case "PENDING":
      return "chip warning";
    case "READ":
    case "DELIVERED":
      return "chip gold";
    default:
      return "chip";
  }
}

function amountsDiverge(
  detected: string | number | null | undefined,
  expected: string | number | null | undefined,
): boolean {
  const detectedNumber = parseAmount(detected);
  const expectedNumber = parseAmount(expected);
  if (detectedNumber === null || expectedNumber === null) {
    return false;
  }
  return detectedNumber !== expectedNumber;
}

function parseAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value.replace(",", "."));
  return Number.isNaN(parsed) ? null : parsed;
}

function handoffEventLabel(eventType: string): string {
  switch (eventType) {
    case "handoff_opened":
      return "IA pediu atendimento humano";
    case "handoff_acknowledged":
      return "Humano assumiu";
    case "handoff_released":
      return "Devolvida para a IA";
    default:
      return eventType;
  }
}
