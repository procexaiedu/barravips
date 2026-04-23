"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ConversationRead,
  ConversationState,
  HandoffStatus,
  PaginatedEnvelope,
} from "@/contracts";
import { bffFetch, type BffFetchError } from "@/features/shared/bff-client";
import { formatCurrency, formatDateTime } from "@/features/shared/formatters";
import {
  clientStatusLabel,
  conversationStateLabel,
  flowTypeLabel,
  handoffStatusLabel,
  urgencyProfileLabel,
} from "@/features/shared/labels";

const POLL_INTERVAL_MS = 15_000;
const PAGE_SIZE = 25;

type Filters = {
  state: "" | ConversationState;
  handoff: "" | HandoffStatus;
  q: string;
  page: number;
};

const STATE_OPTIONS: ConversationState[] = [
  "NOVO",
  "QUALIFICANDO",
  "NEGOCIANDO",
  "CONFIRMADO",
  "ESCALADO",
];

const HANDOFF_OPTIONS: HandoffStatus[] = ["NONE", "OPENED", "ACKNOWLEDGED", "RELEASED"];

export function ConversasClient() {
  const [filters, setFilters] = useState<Filters>({ state: "", handoff: "", q: "", page: 1 });
  const [committedFilters, setCommittedFilters] = useState<Filters>(filters);
  const [envelope, setEnvelope] = useState<PaginatedEnvelope<ConversationRead> | null>(null);
  const [error, setError] = useState<BffFetchError | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (active: Filters) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(active.page));
    params.set("page_size", String(PAGE_SIZE));
    if (active.state) {
      params.set("status", active.state);
    }
    if (active.handoff) {
      params.set("handoff_status", active.handoff);
    }
    if (active.q.trim()) {
      params.set("q", active.q.trim());
    }
    const result = await bffFetch<PaginatedEnvelope<ConversationRead>>(
      `/api/operator/conversations?${params.toString()}`,
    );
    setEnvelope(result.data);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(committedFilters);
    const id = window.setInterval(() => {
      void load(committedFilters);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [committedFilters, load]);

  const totalPages = useMemo(() => {
    if (!envelope) {
      return 1;
    }
    return Math.max(1, Math.ceil(envelope.total / envelope.page_size));
  }, [envelope]);

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const next = { ...filters, page: 1 };
      setFilters(next);
      setCommittedFilters(next);
    },
    [filters],
  );

  const onReset = useCallback(() => {
    const reset: Filters = { state: "", handoff: "", q: "", page: 1 };
    setFilters(reset);
    setCommittedFilters(reset);
  }, []);

  const gotoPage = useCallback(
    (page: number) => {
      const next = { ...committedFilters, page };
      setCommittedFilters(next);
      setFilters(next);
    },
    [committedFilters],
  );

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Conversas</h2>
        <span className="badge muted">
          {loading ? "Atualizando" : `${envelope?.total ?? 0} no total`}
        </span>
      </div>

      <form className="filter-bar" onSubmit={onSubmit} aria-label="Filtros de conversas">
        <label>
          <span>Situação</span>
          <select
            value={filters.state}
            onChange={(e) => setFilters({ ...filters, state: e.target.value as Filters["state"] })}
          >
            <option value="">Todas</option>
            {STATE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {conversationStateLabel(opt)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Quem está atendendo</span>
          <select
            value={filters.handoff}
            onChange={(e) =>
              setFilters({ ...filters, handoff: e.target.value as Filters["handoff"] })
            }
          >
            <option value="">Todos</option>
            {HANDOFF_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {handoffStatusLabel(opt)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Buscar</span>
          <input
            type="search"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="Nome, WhatsApp ou trecho da conversa"
          />
        </label>
        <div className="form-field">
          <span>&nbsp;</span>
          <div className="inline-actions">
            <button className="button" type="submit">
              Aplicar filtros
            </button>
            <button className="button secondary" type="button" onClick={onReset}>
              Limpar
            </button>
          </div>
        </div>
      </form>

      {error ? (
        <div className="panel-notice">{error.message}</div>
      ) : null}

      {!envelope || envelope.items.length === 0 ? (
        <p className="empty-state">Nenhuma conversa encontrada com esses filtros.</p>
      ) : (
        <>
          <table className="data-table" aria-label="Lista de conversas">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>WhatsApp</th>
                <th>Modelo</th>
                <th>Situação</th>
                <th>Tipo de atendimento</th>
                <th>Quem atende</th>
                <th>Última mensagem</th>
                <th className="numeric">Atualizada</th>
              </tr>
            </thead>
            <tbody>
              {envelope.items.map((c) => (
                <ConversationRow key={c.id} conversation={c} />
              ))}
            </tbody>
          </table>
          <div className="pagination">
            <button
              className="button secondary"
              type="button"
              disabled={committedFilters.page <= 1 || loading}
              onClick={() => gotoPage(Math.max(1, committedFilters.page - 1))}
            >
              Anterior
            </button>
            <span>
              Página {envelope.page} de {totalPages}
            </span>
            <button
              className="button secondary"
              type="button"
              disabled={committedFilters.page >= totalPages || loading}
              onClick={() => gotoPage(Math.min(totalPages, committedFilters.page + 1))}
            >
              Próxima
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function ConversationRow({ conversation }: { conversation: ConversationRead }) {
  const clientName = conversation.client.display_name || conversation.client.whatsapp_jid;
  const preview = conversation.last_message?.content_preview;
  return (
    <tr>
      <td>
        <Link className="link-pill" href={`/conversas/${conversation.id}`}>
          {clientName}
        </Link>
        <ContextBadges conversation={conversation} />
      </td>
      <td className="muted-cell">{conversation.client.whatsapp_jid}</td>
      <td>{conversation.model.display_name}</td>
      <td>
        <span className="chip">{conversationStateLabel(conversation.state)}</span>
      </td>
      <td>
        <span className={conversation.flow_type === "EXTERNAL" ? "chip warning" : "chip"}>
          {flowTypeLabel(conversation.flow_type)}
        </span>
      </td>
      <td>
        <HandoffCell status={conversation.handoff_status} />
      </td>
      <td className="muted-cell">
        {preview ? truncate(preview, 80) : conversation.summary ? truncate(conversation.summary, 80) : "-"}
      </td>
      <td className="numeric muted-cell">{formatDateTime(conversation.last_message_at)}</td>
    </tr>
  );
}

function ContextBadges({ conversation }: { conversation: ConversationRead }) {
  const badges = [
    conversation.awaiting_client_decision ? (
      <span className="chip warning" key="decision">aguarda resposta</span>
    ) : null,
    urgencyProfileLabel(conversation.urgency_profile) ? (
      <span className="chip warning" key="urgency">{urgencyProfileLabel(conversation.urgency_profile)}</span>
    ) : null,
    clientStatusLabel(conversation.client.client_status) ? (
      <span className="chip" key="status">{clientStatusLabel(conversation.client.client_status)}</span>
    ) : null,
    conversation.client.language_hint ? (
      <span className="chip" key="language">{conversation.client.language_hint}</span>
    ) : null,
    conversation.expected_amount ? (
      <span className="chip" key="amount">{formatCurrency(conversation.expected_amount)}</span>
    ) : null,
  ].filter(Boolean);

  if (badges.length === 0) {
    return null;
  }
  return <div style={{ marginTop: 6 }}>{badges}</div>;
}

function HandoffCell({ status }: { status: HandoffStatus }) {
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

function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}...`;
}
