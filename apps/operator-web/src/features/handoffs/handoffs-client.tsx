"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type {
  ConversationRead,
  HandoffSummaryRead,
  PaginatedEnvelope,
} from "@/contracts";
import { bffFetch, type BffFetchError } from "@/features/shared/bff-client";
import { ConfirmModal } from "@/features/shared/confirm-modal";
import { formatCurrency, formatDateTime, formatNumber, formatRelativeSeconds } from "@/features/shared/formatters";
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
  urgencyProfileLabel,
} from "@/features/shared/labels";

const POLL_INTERVAL_MS = 10_000;
const PAGE_SIZE = 50;

type Loaded = {
  summary: HandoffSummaryRead | null;
  opened: PaginatedEnvelope<ConversationRead> | null;
  acknowledged: PaginatedEnvelope<ConversationRead> | null;
  errors: {
    summary: BffFetchError | null;
    opened: BffFetchError | null;
    acknowledged: BffFetchError | null;
  };
};

const INITIAL: Loaded = {
  summary: null,
  opened: null,
  acknowledged: null,
  errors: { summary: null, opened: null, acknowledged: null },
};

type PendingRelease = {
  conversation: ConversationRead;
};

export function HandoffsClient() {
  const [loaded, setLoaded] = useState<Loaded>(INITIAL);
  const [firstLoad, setFirstLoad] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [pendingRelease, setPendingRelease] = useState<PendingRelease | null>(null);

  const load = useCallback(async () => {
    const [summary, opened, acknowledged] = await Promise.all([
      bffFetch<HandoffSummaryRead>("/api/operator/handoffs/summary?window=7d"),
      bffFetch<PaginatedEnvelope<ConversationRead>>(
        `/api/operator/conversations?handoff_status=OPENED&page_size=${PAGE_SIZE}`,
      ),
      bffFetch<PaginatedEnvelope<ConversationRead>>(
        `/api/operator/conversations?handoff_status=ACKNOWLEDGED&page_size=${PAGE_SIZE}`,
      ),
    ]);
    setLoaded({
      summary: summary.data,
      opened: opened.data,
      acknowledged: acknowledged.data,
      errors: { summary: summary.error, opened: opened.error, acknowledged: acknowledged.error },
    });
    setFirstLoad(false);
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const onAcknowledge = useCallback(
    async (conversation: ConversationRead) => {
      setBusyId(conversation.id);
      setAction(null);
      const result = await acknowledgeHandoff(conversation.id);
      setBusyId(null);
      if (result.error) {
        setAction(handoffActionMessage("acknowledge", result.error.status));
      } else {
        setAction(`Você assumiu a conversa de ${conversation.client.display_name || conversation.client.whatsapp_jid}.`);
      }
      await load();
    },
    [load],
  );

  const onConfirmRelease = useCallback(async () => {
    if (!pendingRelease) {
      return;
    }
    const conversation = pendingRelease.conversation;
    setBusyId(conversation.id);
    setAction(null);
    const result = await releaseHandoff(conversation.id);
    setBusyId(null);
    setPendingRelease(null);
    if (result.error) {
      setAction(handoffActionMessage("release", result.error.status));
    } else {
      setAction(`Conversa de ${conversation.client.display_name || conversation.client.whatsapp_jid} devolvida para a IA.`);
    }
    await load();
  }, [load, pendingRelease]);

  if (firstLoad) {
    return (
      <div className="panel" role="status">
        <div className="panel-heading">
          <h2>Carregando transferências</h2>
          <span className="badge muted">Buscando</span>
        </div>
      </div>
    );
  }

  return (
    <div className="section-stack">
      {action ? <div className="panel-notice warning">{action}</div> : null}
      <HandoffSummaryPanel summary={loaded.summary} error={loaded.errors.summary} />
      <HandoffSection
        title="Aguardando a modelo"
        tone="danger"
        envelope={loaded.opened}
        error={loaded.errors.opened}
        emptyMessage="Nenhum cliente esperando a modelo assumir agora."
        actions={(conversation) => (
          <>
            <button
              className="button"
              type="button"
              disabled={busyId === conversation.id}
              onClick={() => void onAcknowledge(conversation)}
            >
              Assumi
            </button>
            <button
              className="button danger"
              type="button"
              disabled={busyId === conversation.id}
              onClick={() => setPendingRelease({ conversation })}
            >
              Devolver para IA
            </button>
          </>
        )}
      />
      <HandoffSection
        title="A modelo já assumiu"
        tone="warning"
        envelope={loaded.acknowledged}
        error={loaded.errors.acknowledged}
        emptyMessage="Nenhuma conversa sendo atendida pela modelo agora."
        actions={(conversation) => (
          <button
            className="button danger"
            type="button"
            disabled={busyId === conversation.id}
            onClick={() => setPendingRelease({ conversation })}
          >
            Devolver para IA
          </button>
        )}
      />

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
                    {pendingRelease.conversation.client.display_name ||
                      pendingRelease.conversation.client.whatsapp_jid}
                  </dd>
                </div>
                <div>
                  <dt>Situação</dt>
                  <dd>{conversationStateLabel(pendingRelease.conversation.state)}</dd>
                </div>
                <div>
                  <dt>Última mensagem</dt>
                  <dd>
                    {pendingRelease.conversation.last_message?.content_preview || "-"}
                  </dd>
                </div>
              </dl>
            </div>
          }
          confirmLabel="Devolver para IA"
          tone="danger"
          loading={busyId === pendingRelease.conversation.id}
          onConfirm={() => void onConfirmRelease()}
          onCancel={() => setPendingRelease(null)}
        />
      ) : null}
    </div>
  );
}

function HandoffSummaryPanel({
  summary,
  error,
}: {
  summary: HandoffSummaryRead | null;
  error: BffFetchError | null;
}) {
  if (error) {
    return (
      <section className="panel">
        <div className="panel-heading">
          <h2>Resumo da semana</h2>
          <span className="badge danger">Erro</span>
        </div>
        <p>{error.message}</p>
      </section>
    );
  }
  if (!summary) {
    return (
      <section className="panel">
        <div className="panel-heading">
          <h2>Resumo da semana</h2>
          <span className="badge muted">Sem dados</span>
        </div>
        <p className="empty-state">Não conseguimos montar o resumo de transferências agora.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Resumo dos últimos 7 dias</h2>
      </div>
      <div className="metric-grid">
        <SummaryMetric label="Aguardando modelo" value={summary.current_by_status.counts.OPENED ?? 0} />
        <SummaryMetric label="Modelo atendendo" value={summary.current_by_status.counts.ACKNOWLEDGED ?? 0} />
        <SummaryMetric label="Já devolvidas" value={summary.current_by_status.counts.RELEASED ?? 0} />
        <SummaryMetric label="Esperando há 4h+" value={summary.open_age_buckets.counts["4h+"] ?? 0} />
        <SummaryMetric
          label="Tempo médio até assumir"
          value={formatDurationSeconds(summary.time_to_acknowledge?.average_seconds)}
        />
        <SummaryMetric
          label="Tempo médio até devolver"
          value={formatDurationSeconds(summary.time_to_release?.average_seconds)}
        />
      </div>
      <div className="dashboard-columns">
        <table className="data-table" aria-label="Quanto tempo cada transferência está esperando">
          <thead>
            <tr>
              <th>Esperando há</th>
              <th className="numeric">Conversas</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(summary.open_age_buckets.counts).map(([bucket, value]) => (
              <tr key={bucket}>
                <td>{bucket}</td>
                <td className={bucket === "4h+" && value > 0 ? "numeric warning-cell" : "numeric"}>
                  {formatNumber(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="data-table" aria-label="Por que a IA transferiu">
          <thead>
            <tr>
              <th>Motivo</th>
              <th className="numeric">Vezes</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(summary.reasons.counts).length === 0 ? (
              <tr>
                <td colSpan={2} className="muted-cell">Nenhum motivo registrado na semana.</td>
              </tr>
            ) : (
              Object.entries(summary.reasons.counts).map(([reason, value]) => (
                <tr key={reason}>
                  <td>{handoffReasonLabel(reason) || reason}</td>
                  <td className="numeric">{formatNumber(value)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">
        {typeof value === "number" ? formatNumber(value) : value}
      </span>
    </div>
  );
}

function HandoffSection({
  title,
  tone,
  envelope,
  error,
  emptyMessage,
  actions,
}: {
  title: string;
  tone: "danger" | "warning";
  envelope: PaginatedEnvelope<ConversationRead> | null;
  error: BffFetchError | null;
  emptyMessage: string;
  actions: (conversation: ConversationRead) => React.ReactNode;
}) {
  const items = envelope?.items ?? [];
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <span className={`badge ${tone === "danger" ? "danger" : "warning"}`}>
          {envelope?.total ?? 0}
        </span>
      </div>
      {error ? <div className="panel-notice">{error.message}</div> : null}
      {items.length === 0 ? (
        <p className="empty-state">{emptyMessage}</p>
      ) : (
        <table className="data-table" aria-label={title}>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>WhatsApp</th>
              <th>Situação</th>
              <th>Tipo de atendimento</th>
              <th>Última mensagem</th>
              <th className="numeric">Esperando há</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link className="link-pill" href={`/conversas/${c.id}`}>
                    {c.client.display_name || c.client.whatsapp_jid}
                  </Link>
                </td>
                <td className="muted-cell">{c.client.whatsapp_jid}</td>
                <td>
                  <span className="chip">{conversationStateLabel(c.state)}</span>
                  {c.awaiting_client_decision ? (
                    <span className="chip warning">aguarda resposta</span>
                  ) : null}
                </td>
                <td>
                  <span className={c.flow_type === "EXTERNAL" ? "chip warning" : "chip"}>
                    {flowTypeLabel(c.flow_type)}
                  </span>
                  {urgencyProfileLabel(c.urgency_profile) ? (
                    <span className="chip warning">{urgencyProfileLabel(c.urgency_profile)}</span>
                  ) : null}
                </td>
                <td className="muted-cell">
                  {c.last_message?.content_preview || c.summary || "-"}
                  <div style={{ marginTop: 6 }}>
                    {clientStatusLabel(c.client.client_status) ? (
                      <span className="chip">cliente {clientStatusLabel(c.client.client_status)}</span>
                    ) : null}
                    {c.client.language_hint ? <span className="chip">idioma {c.client.language_hint}</span> : null}
                    {c.expected_amount ? (
                      <span className="chip">valor combinado {formatCurrency(c.expected_amount)}</span>
                    ) : null}
                  </div>
                </td>
                <td className="numeric muted-cell">
                  <span title={formatDateTime(c.last_handoff_at ?? c.last_message_at)}>
                    {formatRelativeSeconds(c.last_handoff_at ?? c.last_message_at)}
                  </span>
                </td>
                <td>
                  <div className="inline-actions">{actions(c)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function formatDurationSeconds(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (value < 60) {
    return `${value}s`;
  }
  const minutes = Math.floor(value / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
