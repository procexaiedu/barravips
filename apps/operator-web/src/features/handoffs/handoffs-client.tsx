"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ConversationRead,
  PaginatedEnvelope,
  UrgencyProfile,
} from "@/contracts";
import { bffFetch, type BffFetchError } from "@/features/shared/bff-client";
import { ConfirmModal } from "@/features/shared/confirm-modal";
import { formatNumber } from "@/features/shared/formatters";
import {
  handoffActionMessage,
  releaseHandoff,
} from "@/features/shared/handoff-actions";
import {
  conversationStateLabel,
  handoffReasonLabel,
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
};

type Loaded = {
  opened: PaginatedEnvelope<ConversationRead> | null;
  acknowledged: PaginatedEnvelope<ConversationRead> | null;
  errors: {
    opened: BffFetchError | null;
    acknowledged: BffFetchError | null;
  };
};

type PendingRelease = { conversation: ConversationRead };

const EMPTY_FILTERS: ListFilters = { urgencyProfile: "", q: "" };

const INITIAL: Loaded = {
  opened: null,
  acknowledged: null,
  errors: { opened: null, acknowledged: null },
};

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

  const load = useCallback(async () => {
    const [opened, acknowledged] = await Promise.all([
      bffFetch<PaginatedEnvelope<ConversationRead>>(
        `/api/operator/conversations?handoff_status=OPENED&page_size=${PAGE_SIZE}`,
      ),
      bffFetch<PaginatedEnvelope<ConversationRead>>(
        `/api/operator/conversations?handoff_status=ACKNOWLEDGED&page_size=${PAGE_SIZE}`,
      ),
    ]);
    setLoaded({
      opened: opened.data,
      acknowledged: acknowledged.data,
      errors: { opened: opened.error, acknowledged: acknowledged.error },
    });
    setFirstLoad(false);
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const onConfirmRelease = useCallback(async () => {
    if (!pendingRelease) return;
    const conversation = pendingRelease.conversation;
    const wasCancellation = conversation.handoff_status === "OPENED";
    setBusyId(conversation.id);
    setAction(null);
    const result = await releaseHandoff(conversation.id);
    setBusyId(null);
    setPendingRelease(null);
    if (result.error) {
      setAction(handoffActionMessage("release", result.error.status));
    } else {
      setAction(
        wasCancellation
          ? `Escalada de ${leadName(conversation)} cancelada. A IA volta a responder.`
          : `${leadName(conversation)} voltou para atendimento da IA.`,
      );
    }
    await load();
  }, [load, pendingRelease]);

  const waitingLeads = useMemo(
    () => applyFilters(loaded.opened?.items ?? [], filters).sort(compareSlaPriority),
    [filters, loaded.opened],
  );
  const activeLeads = useMemo(
    () => applyFilters(loaded.acknowledged?.items ?? [], filters).sort(compareByAgeDesc),
    [filters, loaded.acknowledged],
  );

  const filtersActive = Boolean(filters.q.trim() || filters.urgencyProfile);
  const oldestWaiting = waitingLeads[0] ?? null;

  if (firstLoad) {
    return (
      <div className="panel" role="status">
        <div className="panel-heading">
          <h2>Carregando fila de exceções</h2>
          <span className="badge muted">Buscando</span>
        </div>
      </div>
    );
  }

  return (
    <div className="section-stack">
      {action ? <div className="panel-notice warning">{action}</div> : null}

      <StatusStrip
        waiting={waitingLeads.length}
        active={activeLeads.length}
        oldestWaiting={oldestWaiting}
      />

      <HandoffFilters
        filters={filters}
        filtersActive={filtersActive}
        onChange={setFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
      />

      {loaded.errors.opened ? <div className="panel-notice">{loaded.errors.opened.message}</div> : null}

      <WaitingSection
        items={waitingLeads}
        busyId={busyId}
        filtersActive={filtersActive}
        onCancelEscalation={(conversation) => setPendingRelease({ conversation })}
        onReset={() => setFilters(EMPTY_FILTERS)}
      />

      {loaded.errors.acknowledged ? <div className="panel-notice">{loaded.errors.acknowledged.message}</div> : null}

      <ActiveSection
        items={activeLeads}
        busyId={busyId}
        filtersActive={filtersActive}
        onRelease={(conversation) => setPendingRelease({ conversation })}
      />

      {pendingRelease ? (
        <ConfirmModal
          title={
            pendingRelease.conversation.handoff_status === "OPENED"
              ? "Cancelar escalada"
              : "Devolver lead para a IA"
          }
          description={
            <div className="stack-sm">
              <p>
                {pendingRelease.conversation.handoff_status === "OPENED"
                  ? "A escalada foi aberta por engano ou não precisa mais da modelo. A IA volta a responder automaticamente."
                  : "A IA volta a responder automaticamente. Confirma que o atendimento humano terminou?"}
              </p>
              <dl className="kv-list">
                <div>
                  <dt>Lead</dt>
                  <dd>{leadName(pendingRelease.conversation)}</dd>
                </div>
                <div>
                  <dt>Modelo</dt>
                  <dd>{pendingRelease.conversation.escort.display_name}</dd>
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
          confirmLabel={
            pendingRelease.conversation.handoff_status === "OPENED"
              ? "Cancelar escalada"
              : "Devolver para IA"
          }
          tone="danger"
          loading={busyId === pendingRelease.conversation.id}
          onConfirm={() => void onConfirmRelease()}
          onCancel={() => setPendingRelease(null)}
        />
      ) : null}
    </div>
  );
}

function StatusStrip({
  waiting,
  active,
  oldestWaiting,
}: {
  waiting: number;
  active: number;
  oldestWaiting: ConversationRead | null;
}) {
  const oldestLabel =
    oldestWaiting && ageMinutes(oldestWaiting) > 0
      ? `mais antigo há ${formatMinutes(ageMinutes(oldestWaiting))}`
      : null;
  const oldestTone = oldestWaiting
    ? slaGroupFor(oldestWaiting) === "overdue"
      ? "danger"
      : slaGroupFor(oldestWaiting) === "attention"
        ? "warning"
        : "ok"
    : "muted";

  return (
    <section className="panel compact-panel" aria-label="Status da fila de exceções">
      <div className="status-strip">
        <span className="status-strip-item">
          <strong>{formatNumber(waiting)}</strong> aguardando
        </span>
        <span className="status-strip-separator" aria-hidden="true">·</span>
        <span className="status-strip-item">
          <strong>{formatNumber(active)}</strong> em atendimento
        </span>
        {oldestLabel ? (
          <>
            <span className="status-strip-separator" aria-hidden="true">·</span>
            <span className={`badge ${oldestTone}`}>{oldestLabel}</span>
          </>
        ) : null}
      </div>
    </section>
  );
}

function HandoffFilters({
  filters,
  filtersActive,
  onChange,
  onReset,
}: {
  filters: ListFilters;
  filtersActive: boolean;
  onChange: (next: ListFilters) => void;
  onReset: () => void;
}) {
  return (
    <section className="panel compact-panel">
      <div className="handoff-filter-row" aria-label="Filtros da fila de exceções">
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
        <button className="button secondary" type="button" onClick={onReset} disabled={!filtersActive}>
          Limpar filtros
        </button>
      </div>
    </section>
  );
}

function WaitingSection({
  items,
  busyId,
  filtersActive,
  onCancelEscalation,
  onReset,
}: {
  items: ConversationRead[];
  busyId: string | null;
  filtersActive: boolean;
  onCancelEscalation: (conversation: ConversationRead) => void;
  onReset: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Aguardando a modelo</h2>
          <p className="section-subtitle">A IA escalou e está em silêncio. O reconhecimento vem do WhatsApp da modelo.</p>
        </div>
        <span className={items.length > 0 ? "badge danger" : "badge muted"}>{formatNumber(items.length)}</span>
      </div>
      {items.length === 0 ? (
        <HandoffEmptyState filtersActive={filtersActive} onReset={onReset} />
      ) : (
        <div className="handoff-card-list">
          {items.map((conversation) => (
            <WaitingCard
              key={conversation.id}
              conversation={conversation}
              busy={busyId === conversation.id}
              onCancelEscalation={() => onCancelEscalation(conversation)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function WaitingCard({
  conversation,
  busy,
  onCancelEscalation,
}: {
  conversation: ConversationRead;
  busy: boolean;
  onCancelEscalation: () => void;
}) {
  const group = slaGroupFor(conversation);
  const reason = handoffReasonGuess(conversation);
  const summary =
    conversation.summary || conversation.last_message?.content_preview || "";
  const waitingMinutes = ageMinutes(conversation);

  return (
    <article className={`handoff-card ${group}`}>
      <header>
        <div>
          <h3>{leadName(conversation)}</h3>
          <p>{conversation.client.whatsapp_jid}</p>
        </div>
        <div className="handoff-card-badges">
          <SlaBadge conversation={conversation} />
          <UrgencyChip conversation={conversation} />
        </div>
      </header>

      <div className="handoff-card-reason">
        <span>Motivo</span>
        <strong>{reason}</strong>
      </div>

      {summary ? <p className="handoff-summary">{truncate(summary, 110)}</p> : null}

      <div className="handoff-card-chips">
        <span className="chip">Para: {conversation.escort.display_name}</span>
        <span className="chip">
          aguardando há {waitingMinutes > 0 ? formatMinutes(waitingMinutes) : "poucos segundos"}
        </span>
      </div>

      <div className="handoff-card-actions">
        <Link className="button handoff-primary" href={`/conversas/${conversation.id}`}>
          Ver conversa
        </Link>
        <button className="button danger" type="button" disabled={busy} onClick={onCancelEscalation}>
          Cancelar escalada
        </button>
      </div>
    </article>
  );
}

function ActiveSection({
  items,
  busyId,
  filtersActive,
  onRelease,
}: {
  items: ConversationRead[];
  busyId: string | null;
  filtersActive: boolean;
  onRelease: (conversation: ConversationRead) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Em atendimento pela modelo</h2>
          <p className="section-subtitle">A modelo já respondeu ou reconheceu. IA segue em silêncio até a devolução.</p>
        </div>
        <span className={items.length > 0 ? "badge warning" : "badge muted"}>{formatNumber(items.length)}</span>
      </div>
      {items.length === 0 ? (
        <p className="empty-state">
          {filtersActive
            ? "Nenhum atendimento humano bate com os filtros."
            : "Nenhum lead está em atendimento pela modelo agora."}
        </p>
      ) : (
        <div className="active-handoff-list">
          {items.map((conversation) => (
            <ActiveCard
              key={conversation.id}
              conversation={conversation}
              busy={busyId === conversation.id}
              onRelease={() => onRelease(conversation)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ActiveCard({
  conversation,
  busy,
  onRelease,
}: {
  conversation: ConversationRead;
  busy: boolean;
  onRelease: () => void;
}) {
  const reason = handoffReasonGuess(conversation);
  const summary =
    conversation.summary || conversation.last_message?.content_preview || "";
  const minutes = ageMinutes(conversation);

  return (
    <article className="active-handoff-item">
      <div>
        <h3>{leadName(conversation)}</h3>
        <p className="handoff-active-reason">
          <span>Motivo:</span> <strong>{reason}</strong>
        </p>
        {summary ? <p className="handoff-active-summary">{truncate(summary, 110)}</p> : null}
        <div className="handoff-card-chips">
          <span className="chip">Por: {conversation.escort.display_name}</span>
          <span className="chip warning">em atendimento há {minutes > 0 ? formatMinutes(minutes) : "poucos segundos"}</span>
        </div>
      </div>
      <div className="inline-actions">
        <Link className="button secondary" href={`/conversas/${conversation.id}`}>
          Ver conversa
        </Link>
        <button className="button danger" type="button" disabled={busy} onClick={onRelease}>
          Devolver para IA
        </button>
      </div>
    </article>
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
        <strong>{filtersActive ? "Nenhum lead encontrado" : "Nenhuma escalada aguardando a modelo"}</strong>
        <p>
          {filtersActive
            ? "Tente remover filtros ou buscar por outro nome, telefone, motivo ou resumo."
            : "Quando a IA escalar uma conversa, ela aparecerá aqui com motivo, urgência e SLA até a modelo reconhecer pelo WhatsApp."}
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

function SlaBadge({ conversation }: { conversation: ConversationRead }) {
  const group = slaGroupFor(conversation);
  if (group === "overdue") {
    const over = ageMinutes(conversation) - SLA_MINUTES;
    return <span className="badge danger">Atrasado · {formatMinutes(Math.max(0, over))}</span>;
  }
  if (group === "attention") {
    const left = SLA_MINUTES - ageMinutes(conversation);
    return <span className="badge warning">SLA em {formatMinutes(Math.max(0, left))}</span>;
  }
  return <span className="badge ok">No prazo</span>;
}

function UrgencyChip({ conversation }: { conversation: ConversationRead }) {
  if (conversation.urgency_profile === "IMMEDIATE") {
    return <span className="chip danger">Urgência alta</span>;
  }
  if (conversation.urgency_profile === "SCHEDULED" || conversation.urgency_profile === "ESTIMATED_TIME") {
    return <span className="chip warning">Urgência média</span>;
  }
  return null;
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

function compareSlaPriority(a: ConversationRead, b: ConversationRead): number {
  return slaPriority(b) - slaPriority(a) || ageMinutes(b) - ageMinutes(a);
}

function compareByAgeDesc(a: ConversationRead, b: ConversationRead): number {
  return ageMinutes(b) - ageMinutes(a);
}

function slaPriority(conversation: ConversationRead): number {
  let score = 0;
  const group = slaGroupFor(conversation);
  if (group === "overdue") score += 100;
  else if (group === "attention") score += 50;
  if (conversation.urgency_profile === "IMMEDIATE") score += 25;
  if (conversation.expected_amount) score += 10;
  return score;
}

function slaGroupFor(conversation: ConversationRead): SlaGroupKey {
  const minutes = ageMinutes(conversation);
  if (minutes >= SLA_MINUTES) return "overdue";
  if (minutes >= SLA_ATTENTION_MINUTES) return "attention";
  return "within";
}

function ageMinutes(conversation: ConversationRead): number {
  const startedAt = handoffStartedAt(conversation);
  if (!startedAt) return 0;
  const timestamp = new Date(startedAt).getTime();
  if (Number.isNaN(timestamp)) return 0;
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

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}...`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

