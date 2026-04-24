"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ConversationRead,
  HandoffSummaryRead,
  PaginatedEnvelope,
  UrgencyProfile,
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
  handoffStatusLabel,
  urgencyProfileLabel,
} from "@/features/shared/labels";

const POLL_INTERVAL_MS = 10_000;
const PAGE_SIZE = 50;
const SLA_MINUTES = 30;
const SLA_ATTENTION_MINUTES = 20;

type SlaGroupKey = "overdue" | "attention" | "within";

type ListFilters = {
  urgencyProfile: "" | UrgencyProfile;
  q: string;
  minAmount: string;
  maxAmount: string;
};

function parseAmountInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

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

type PendingRelease = {
  conversation: ConversationRead;
};

const EMPTY_FILTERS: ListFilters = {
  urgencyProfile: "",
  q: "",
  minAmount: "",
  maxAmount: "",
};

const INITIAL: Loaded = {
  summary: null,
  opened: null,
  acknowledged: null,
  errors: { summary: null, opened: null, acknowledged: null },
};

const SLA_GROUPS: Array<{ key: SlaGroupKey; title: string; description: string }> = [
  {
    key: "overdue",
    title: "Atrasados",
    description: "Passaram do tempo ideal de resposta humana.",
  },
  {
    key: "attention",
    title: "Atenção",
    description: "Estão perto do SLA. Assuma antes de virar atraso.",
  },
  {
    key: "within",
    title: "Dentro do prazo",
    description: "Ainda dentro da janela operacional.",
  },
];

const URGENCY_PROFILE_OPTIONS: UrgencyProfile[] = [
  "IMMEDIATE",
  "SCHEDULED",
  "UNDEFINED_TIME",
  "ESTIMATED_TIME",
];

export function HandoffsClient() {
  const [loaded, setLoaded] = useState<Loaded>(INITIAL);
  const [firstLoad, setFirstLoad] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [pendingRelease, setPendingRelease] = useState<PendingRelease | null>(null);
  const [filters, setFilters] = useState<ListFilters>(EMPTY_FILTERS);

  const load = useCallback(async (active: ListFilters) => {
    const min = parseAmountInput(active.minAmount);
    const max = parseAmountInput(active.maxAmount);
    const amountSuffix = buildAmountQuery(min, max);
    const [summary, opened, acknowledged] = await Promise.all([
      bffFetch<HandoffSummaryRead>("/api/operator/handoffs/summary?window=7d"),
      bffFetch<PaginatedEnvelope<ConversationRead>>(
        `/api/operator/conversations?handoff_status=OPENED&page_size=${PAGE_SIZE}${amountSuffix}`,
      ),
      bffFetch<PaginatedEnvelope<ConversationRead>>(
        `/api/operator/conversations?handoff_status=ACKNOWLEDGED&page_size=${PAGE_SIZE}${amountSuffix}`,
      ),
    ]);
    setLoaded({
      summary: summary.data,
      opened: opened.data,
      acknowledged: acknowledged.data,
      errors: {
        summary: summary.error,
        opened: opened.error,
        acknowledged: acknowledged.error,
      },
    });
    setFirstLoad(false);
  }, []);

  const amountRangeError = useMemo(() => {
    const min = parseAmountInput(filters.minAmount);
    const max = parseAmountInput(filters.maxAmount);
    if (min !== null && max !== null && min > max) {
      return "O valor mínimo não pode ser maior que o máximo.";
    }
    return null;
  }, [filters.minAmount, filters.maxAmount]);

  useEffect(() => {
    if (amountRangeError) {
      return;
    }
    void load(filters);
    const id = window.setInterval(() => {
      void load(filters);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [amountRangeError, filters, load]);

  const onAcknowledge = useCallback(
    async (conversation: ConversationRead) => {
      setBusyId(conversation.id);
      setAction(null);
      const result = await acknowledgeHandoff(conversation.id);
      setBusyId(null);
      if (result.error) {
        setAction(handoffActionMessage("acknowledge", result.error.status));
      } else {
        setAction(`Você assumiu ${leadName(conversation)}. Responda o lead antes de devolver para a IA.`);
      }
      await load(filters);
    },
    [filters, load],
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
      setAction(`${leadName(conversation)} voltou para atendimento da IA.`);
    }
    await load(filters);
  }, [filters, load, pendingRelease]);

  const waitingLeads = useMemo(
    () => applyFilters(loaded.opened?.items ?? [], filters).sort(compareSlaPriority),
    [filters, loaded.opened],
  );

  const activeLeads = useMemo(
    () => applyFilters(loaded.acknowledged?.items ?? [], filters).sort(compareSlaPriority),
    [filters, loaded.acknowledged],
  );

  const grouped = useMemo(() => groupBySla(waitingLeads), [waitingLeads]);
  const filtersActive = Boolean(
    filters.q.trim() ||
      filters.urgencyProfile ||
      filters.minAmount.trim() ||
      filters.maxAmount.trim(),
  );
  const overdueCount = grouped.overdue.length;
  const attentionCount = grouped.attention.length;
  const nextLead = waitingLeads[0] ?? null;

  if (firstLoad) {
    return (
      <div className="panel" role="status">
        <div className="panel-heading">
          <h2>Carregando leads para assumir</h2>
          <span className="badge muted">Buscando</span>
        </div>
      </div>
    );
  }

  return (
    <div className="section-stack">
      {action ? <div className="panel-notice warning">{action}</div> : null}

      <section className="handoff-command">
        <div className="handoff-command-copy">
          <p className="eyebrow">Fila operacional</p>
          <h2>Leads para assumir</h2>
          <p>Leads que a IA encaminhou para atendimento humano, ordenados por SLA e urgência.</p>
        </div>
        <div className="handoff-command-metrics">
          <QueueMetric label="Aguardando humano" value={loaded.opened?.total ?? 0} tone={overdueCount > 0 ? "danger" : "default"} />
          <QueueMetric label="Atrasados" value={overdueCount} tone={overdueCount > 0 ? "danger" : "default"} />
          <QueueMetric label="Atenção" value={attentionCount} tone={attentionCount > 0 ? "warning" : "default"} />
          <QueueMetric
            label="Próximo SLA"
            value={nextLead ? slaClockLabel(nextLead) : "-"}
            tone={nextLead && slaGroupFor(nextLead) !== "within" ? "warning" : "default"}
          />
        </div>
      </section>

      <HandoffFilters
        filters={filters}
        totalLoaded={(loaded.opened?.items.length ?? 0) + (loaded.acknowledged?.items.length ?? 0)}
        totalAfter={waitingLeads.length + activeLeads.length}
        amountRangeError={amountRangeError}
        onChange={setFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
      />

      {loaded.errors.opened ? <div className="panel-notice">{loaded.errors.opened.message}</div> : null}
      {loaded.errors.summary ? <div className="panel-notice">{loaded.errors.summary.message}</div> : null}

      {waitingLeads.length === 0 ? (
        <HandoffEmptyState filtersActive={filtersActive} onReset={() => setFilters(EMPTY_FILTERS)} />
      ) : (
        <div className="sla-board">
          {SLA_GROUPS.map((group) => (
            <SlaGroup
              key={group.key}
              title={group.title}
              description={group.description}
              groupKey={group.key}
              items={grouped[group.key]}
              busyId={busyId}
              onAcknowledge={onAcknowledge}
            />
          ))}
        </div>
      )}

      <ActiveHumanSection
        items={activeLeads}
        total={loaded.acknowledged?.total ?? 0}
        error={loaded.errors.acknowledged}
        busyId={busyId}
        filtersActive={filtersActive}
        onRelease={(conversation) => setPendingRelease({ conversation })}
      />

      <SummaryPanel summary={loaded.summary} />

      {pendingRelease ? (
        <ConfirmModal
          title="Devolver lead para a IA"
          description={
            <div className="stack-sm">
              <p>A IA volta a responder automaticamente. Confirma que o atendimento humano terminou?</p>
              <dl className="kv-list">
                <div>
                  <dt>Lead</dt>
                  <dd>{leadName(pendingRelease.conversation)}</dd>
                </div>
                <div>
                  <dt>Etapa</dt>
                  <dd>{conversationStateLabel(pendingRelease.conversation.state)}</dd>
                </div>
                <div>
                  <dt>Última mensagem</dt>
                  <dd>{pendingRelease.conversation.last_message?.content_preview || "-"}</dd>
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

function HandoffFilters({
  filters,
  totalLoaded,
  totalAfter,
  amountRangeError,
  onChange,
  onReset,
}: {
  filters: ListFilters;
  totalLoaded: number;
  totalAfter: number;
  amountRangeError: string | null;
  onChange: (next: ListFilters) => void;
  onReset: () => void;
}) {
  const active = Boolean(
    filters.q.trim() ||
      filters.urgencyProfile ||
      filters.minAmount.trim() ||
      filters.maxAmount.trim(),
  );
  return (
    <section className="panel compact-panel">
      <div className="panel-heading compact">
        <h2>Busca rápida</h2>
        <span className="badge muted">
          {active ? `${formatNumber(totalAfter)} de ${formatNumber(totalLoaded)}` : `${formatNumber(totalLoaded)} carregados`}
        </span>
      </div>
      <div className="handoff-filter-row" aria-label="Filtros de leads para assumir">
        <label className="search-field">
          <span className="visually-hidden">Buscar lead</span>
          <input
            type="search"
            value={filters.q}
            onChange={(event) => onChange({ ...filters, q: event.target.value })}
            placeholder="Buscar lead, motivo, telefone ou resumo"
          />
        </label>
        <label>
          <span>Urgência</span>
          <select
            value={filters.urgencyProfile}
            onChange={(event) =>
              onChange({ ...filters, urgencyProfile: event.target.value as ListFilters["urgencyProfile"] })
            }
          >
            <option value="">Todas</option>
            {URGENCY_PROFILE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {urgencyProfileLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Valor mínimo (R$)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={filters.minAmount}
            onChange={(event) => onChange({ ...filters, minAmount: event.target.value })}
            placeholder="0,00"
          />
        </label>
        <label>
          <span>Valor máximo (R$)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={filters.maxAmount}
            onChange={(event) => onChange({ ...filters, maxAmount: event.target.value })}
            placeholder="0,00"
          />
        </label>
        <button className="button secondary" type="button" onClick={onReset} disabled={!active}>
          Limpar filtros
        </button>
      </div>
      {amountRangeError ? (
        <div className="panel-notice warning" role="alert">
          {amountRangeError}
        </div>
      ) : null}
    </section>
  );
}

function buildAmountQuery(min: number | null, max: number | null): string {
  const parts: string[] = [];
  if (min !== null) parts.push(`min_amount=${encodeURIComponent(String(min))}`);
  if (max !== null) parts.push(`max_amount=${encodeURIComponent(String(max))}`);
  return parts.length ? `&${parts.join("&")}` : "";
}

function SlaGroup({
  title,
  description,
  groupKey,
  items,
  busyId,
  onAcknowledge,
}: {
  title: string;
  description: string;
  groupKey: SlaGroupKey;
  items: ConversationRead[];
  busyId: string | null;
  onAcknowledge: (conversation: ConversationRead) => Promise<void>;
}) {
  return (
    <section className={`sla-column ${groupKey}`}>
      <div className="sla-column-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className={groupKey === "overdue" ? "badge danger" : groupKey === "attention" ? "badge warning" : "badge muted"}>
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="empty-state">{emptySlaText(groupKey)}</p>
      ) : (
        <div className="handoff-card-list">
          {items.map((conversation) => (
            <HandoffCard
              key={conversation.id}
              conversation={conversation}
              busy={busyId === conversation.id}
              onAcknowledge={() => void onAcknowledge(conversation)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function HandoffCard({
  conversation,
  busy,
  onAcknowledge,
}: {
  conversation: ConversationRead;
  busy: boolean;
  onAcknowledge: () => void;
}) {
  const group = slaGroupFor(conversation);
  const reason = handoffReasonGuess(conversation);
  const summary = conversation.summary || conversation.last_message?.content_preview || "Sem resumo registrado para esta conversa.";

  return (
    <article className={`handoff-card ${group}`}>
      <header>
        <div>
          <h3>{leadName(conversation)}</h3>
          <p>{conversation.client.whatsapp_jid}</p>
        </div>
        <SlaBadge conversation={conversation} />
      </header>

      <div className="handoff-card-reason">
        <span>Motivo</span>
        <strong>{reason}</strong>
      </div>

      <p className="handoff-summary">{truncate(summary, 150)}</p>

      <dl className="handoff-facts">
        <div>
          <dt>Urgência</dt>
          <dd><UrgencyBadge conversation={conversation} /></dd>
        </div>
        <div>
          <dt>SLA</dt>
          <dd>{slaClockLabel(conversation)}</dd>
        </div>
        <div>
          <dt>Esperando</dt>
          <dd>{formatRelativeSeconds(handoffStartedAt(conversation))}</dd>
        </div>
        <div>
          <dt>Etapa</dt>
          <dd>{conversationStateLabel(conversation.state)}</dd>
        </div>
      </dl>

      <div className="handoff-card-chips">
        <span className="chip">{flowTypeLabel(conversation.flow_type)}</span>
        {conversation.expected_amount ? <span className="chip gold">{formatCurrency(conversation.expected_amount)}</span> : null}
        {conversation.client.client_status ? <span className="chip">{clientStatusLabel(conversation.client.client_status)}</span> : null}
      </div>

      <div className="handoff-card-actions">
        <button className="button handoff-primary" type="button" disabled={busy} onClick={onAcknowledge}>
          Assumir agora
        </button>
        <Link className="button secondary" href={`/conversas/${conversation.id}`}>
          Ver conversa
        </Link>
      </div>
    </article>
  );
}

function ActiveHumanSection({
  items,
  total,
  error,
  busyId,
  filtersActive,
  onRelease,
}: {
  items: ConversationRead[];
  total: number;
  error: BffFetchError | null;
  busyId: string | null;
  filtersActive: boolean;
  onRelease: (conversation: ConversationRead) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Em atendimento humano</h2>
          <p className="section-subtitle">Leads já assumidos que ainda não voltaram para a IA.</p>
        </div>
        <span className="badge warning">{formatNumber(total)}</span>
      </div>
      {error ? <div className="panel-notice">{error.message}</div> : null}
      {items.length === 0 ? (
        <p className="empty-state">
          {filtersActive
            ? "Nenhum atendimento humano bate com os filtros."
            : "Nenhum lead está em atendimento humano agora."}
        </p>
      ) : (
        <div className="active-handoff-list">
          {items.map((conversation) => (
            <article className="active-handoff-item" key={conversation.id}>
              <div>
                <h3>{leadName(conversation)}</h3>
                <p>{truncate(conversation.summary || conversation.last_message?.content_preview || "-", 120)}</p>
                <div className="handoff-card-chips">
                  <span className="chip warning">{handoffStatusLabel(conversation.handoff_status)}</span>
                  <span className="chip">{conversationStateLabel(conversation.state)}</span>
                  <span className="chip">há {formatRelativeSeconds(handoffStartedAt(conversation))}</span>
                </div>
              </div>
              <div className="inline-actions">
                <Link className="button secondary" href={`/conversas/${conversation.id}`}>
                  Ver conversa
                </Link>
                <button
                  className="button danger"
                  type="button"
                  disabled={busyId === conversation.id}
                  onClick={() => onRelease(conversation)}
                >
                  Devolver para IA
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function HandoffEmptyState({
  filtersActive,
  onReset,
}: {
  filtersActive: boolean;
  onReset: () => void;
}) {
  return (
    <div className="empty-state-card">
      <span className="empty-state-icon" aria-hidden="true" />
      <div className="empty-state-copy">
        <strong>{filtersActive ? "Nenhum lead encontrado" : "Nenhum lead aguardando atendimento humano"}</strong>
        <p>
          {filtersActive
            ? "Tente remover filtros ou buscar por outro nome, telefone, motivo ou resumo."
            : "Quando a IA transferir uma conversa para atendimento humano, ela aparecerá nesta fila com motivo, urgência e SLA."}
        </p>
      </div>
      {filtersActive ? (
        <button className="button secondary empty-state-action" type="button" onClick={onReset}>
          Limpar filtros
        </button>
      ) : null}
    </div>
  );
}

function SummaryPanel({ summary }: { summary: HandoffSummaryRead | null }) {
  if (!summary) {
    return null;
  }
  const reasons = Object.entries(summary.reasons.counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  return (
    <details className="analytics-accordion">
      <summary>Resumo dos handoffs nos últimos 7 dias</summary>
      <div className="performance-strip analytics-grid">
        <QueueMetric label="Abertos" value={summary.current_by_status.counts.OPENED ?? 0} tone="default" />
        <QueueMetric label="Assumidos" value={summary.current_by_status.counts.ACKNOWLEDGED ?? 0} tone="default" />
        <QueueMetric label="4h+" value={summary.open_age_buckets.counts["4h+"] ?? 0} tone="warning" />
        <QueueMetric label="Tempo médio" value={formatDurationSeconds(summary.time_to_acknowledge?.average_seconds)} tone="default" />
      </div>
      {reasons.length > 0 ? (
        <div className="handoff-reason-strip">
          {reasons.map(([reason, value]) => (
            <span className="chip" key={reason}>
              {handoffReasonLabel(reason) || reason}: {formatNumber(value)}
            </span>
          ))}
        </div>
      ) : null}
    </details>
  );
}

function QueueMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "default" | "warning" | "danger";
}) {
  return (
    <div className={`metric compact ${tone === "default" ? "" : tone}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{typeof value === "number" ? formatNumber(value) : value}</span>
    </div>
  );
}

function SlaBadge({ conversation }: { conversation: ConversationRead }) {
  const group = slaGroupFor(conversation);
  if (group === "overdue") {
    return <span className="badge danger">Atrasado</span>;
  }
  if (group === "attention") {
    return <span className="badge warning">Atenção</span>;
  }
  return <span className="badge ok">No prazo</span>;
}

function UrgencyBadge({ conversation }: { conversation: ConversationRead }) {
  if (conversation.urgency_profile === "IMMEDIATE") {
    return <span className="chip danger">Alta</span>;
  }
  if (conversation.urgency_profile === "SCHEDULED" || conversation.urgency_profile === "ESTIMATED_TIME") {
    return <span className="chip warning">Média</span>;
  }
  return <span className="chip">Baixa</span>;
}

function applyFilters(items: ConversationRead[], filters: ListFilters): ConversationRead[] {
  const query = filters.q.trim().toLowerCase();
  return items.filter((conversation) => {
    if (filters.urgencyProfile && conversation.urgency_profile !== filters.urgencyProfile) {
      return false;
    }
    if (query) {
      const haystack = [
        leadName(conversation),
        conversation.client.whatsapp_jid,
        conversation.summary,
        conversation.last_message?.content_preview,
        handoffReasonGuess(conversation),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }
    return true;
  });
}

function groupBySla(items: ConversationRead[]): Record<SlaGroupKey, ConversationRead[]> {
  return {
    overdue: items.filter((item) => slaGroupFor(item) === "overdue"),
    attention: items.filter((item) => slaGroupFor(item) === "attention"),
    within: items.filter((item) => slaGroupFor(item) === "within"),
  };
}

function compareSlaPriority(a: ConversationRead, b: ConversationRead): number {
  return slaPriority(b) - slaPriority(a) || ageMinutes(b) - ageMinutes(a);
}

function slaPriority(conversation: ConversationRead): number {
  let score = 0;
  if (slaGroupFor(conversation) === "overdue") score += 100;
  if (slaGroupFor(conversation) === "attention") score += 50;
  if (conversation.urgency_profile === "IMMEDIATE") score += 25;
  if (conversation.expected_amount) score += 10;
  return score;
}

function slaGroupFor(conversation: ConversationRead): SlaGroupKey {
  const minutes = ageMinutes(conversation);
  if (minutes >= SLA_MINUTES) {
    return "overdue";
  }
  if (minutes >= SLA_ATTENTION_MINUTES) {
    return "attention";
  }
  return "within";
}

function slaClockLabel(conversation: ConversationRead): string {
  const minutes = ageMinutes(conversation);
  if (minutes >= SLA_MINUTES) {
    return `atrasado há ${Math.floor(minutes - SLA_MINUTES)}m`;
  }
  return `vence em ${Math.max(0, Math.ceil(SLA_MINUTES - minutes))}m`;
}

function ageMinutes(conversation: ConversationRead): number {
  const startedAt = handoffStartedAt(conversation);
  if (!startedAt) {
    return 0;
  }
  const timestamp = new Date(startedAt).getTime();
  if (Number.isNaN(timestamp)) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
}

function handoffStartedAt(conversation: ConversationRead): string | null {
  return conversation.last_handoff_at ?? conversation.last_message_at;
}

function handoffReasonGuess(conversation: ConversationRead): string {
  if (conversation.flow_type === "EXTERNAL") {
    return handoffReasonLabel("external_flow") ?? "Atendimento com deslocamento";
  }
  if (conversation.expected_amount) {
    return handoffReasonLabel("pricing") ?? "Negociação de valor";
  }
  if (conversation.awaiting_client_decision) {
    return "Lead pediu decisão ou confirmação humana";
  }
  if (conversation.urgency_profile === "IMMEDIATE") {
    return "Urgência imediata detectada";
  }
  return "A IA pediu intervenção humana";
}

function leadName(conversation: ConversationRead): string {
  return conversation.client.display_name || conversation.client.whatsapp_jid;
}

function emptySlaText(groupKey: SlaGroupKey): string {
  if (groupKey === "overdue") {
    return "Nenhum lead passou do SLA.";
  }
  if (groupKey === "attention") {
    return "Nenhum lead está perto do SLA.";
  }
  return "Nenhum lead dentro do prazo com os filtros atuais.";
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}...`;
}

function formatDurationSeconds(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
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
