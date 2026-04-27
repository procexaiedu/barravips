"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ClientStatus,
  ConversationDetailRead,
  ConversationMessageRead,
  ConversationRead,
  FlowType,
  HandoffEventRead,
  PaginatedEnvelope,
  UrgencyProfile,
} from "@/contracts";
import { bffFetch, type BffFetchError } from "@/features/shared/bff-client";
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
  urgencyProfileLabel,
} from "@/features/shared/labels";

const POLL_INTERVAL_MS = 15_000;
const PAGE_SIZE = 50;
const STALE_HOURS = 24;
const VIEW_STORAGE_KEY = "conversas.view";

type ConversationTab = "todos" | "humano" | "quentes" | "paradas";

type ConversationView = "table" | "kanban";

type SortKey =
  | "priority"
  | "last_message_at_desc"
  | "last_message_at_asc"
  | "last_handoff_at_desc"
  | "amount_desc"
  | "amount_asc";

type ResponsibleFilter = "" | "ai" | "human" | "opened";

type Filters = {
  tab: ConversationTab;
  flowType: "" | FlowType;
  clientStatus: "" | ClientStatus;
  urgencyProfile: "" | UrgencyProfile;
  responsible: ResponsibleFilter;
  modelId: string;
  sort: SortKey;
  q: string;
  minAmount: string;
  maxAmount: string;
  page: number;
};

type KanbanColumnKey = "NOVO" | "QUALIFICANDO" | "NEGOCIANDO" | "CONFIRMADO" | "ESCALADO";

const KANBAN_COLUMNS: Array<{ key: KanbanColumnKey; label: string }> = [
  { key: "NOVO", label: "Novo contato" },
  { key: "QUALIFICANDO", label: "Conhecendo cliente" },
  { key: "NEGOCIANDO", label: "Negociando" },
  { key: "CONFIRMADO", label: "Fechado" },
  { key: "ESCALADO", label: "Com a modelo" },
];

const TABS: Array<{ key: ConversationTab; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "humano", label: "Precisa humano" },
  { key: "quentes", label: "Quentes" },
  { key: "paradas", label: "Paradas" },
];

const FLOW_TYPE_OPTIONS: FlowType[] = ["INTERNAL", "EXTERNAL", "UNDETERMINED"];
const CLIENT_STATUS_OPTIONS: ClientStatus[] = ["NEW", "RETURNING", "VIP", "BLOCKED"];
const URGENCY_PROFILE_OPTIONS: UrgencyProfile[] = [
  "IMMEDIATE",
  "SCHEDULED",
  "UNDEFINED_TIME",
  "ESTIMATED_TIME",
];

const EMPTY_FILTERS: Filters = {
  tab: "todos",
  flowType: "",
  clientStatus: "",
  urgencyProfile: "",
  responsible: "",
  modelId: "",
  sort: "priority",
  q: "",
  minAmount: "",
  maxAmount: "",
  page: 1,
};

function parseAmountInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function ConversasClient() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [committedFilters, setCommittedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [envelope, setEnvelope] = useState<PaginatedEnvelope<ConversationRead> | null>(null);
  const [error, setError] = useState<BffFetchError | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetailRead | null>(null);
  const [detailError, setDetailError] = useState<BffFetchError | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [view, setView] = useState<ConversationView>("table");

  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "kanban" || stored === "table") {
      setView(stored);
    }
  }, []);

  const changeView = useCallback((next: ConversationView) => {
    setView(next);
    window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  }, []);

  const load = useCallback(async (active: Filters) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(active.page));
    params.set("page_size", String(PAGE_SIZE));
    if (active.q.trim()) {
      params.set("q", active.q.trim());
    }
    if (active.tab === "humano") {
      params.set("handoff_status", "OPENED");
    }
    const min = parseAmountInput(active.minAmount);
    if (min !== null) {
      params.set("min_amount", String(min));
    }
    const max = parseAmountInput(active.maxAmount);
    if (max !== null) {
      params.set("max_amount", String(max));
    }
    if (active.sort === "amount_asc" || active.sort === "amount_desc") {
      params.set("sort", active.sort);
    }
    const result = await bffFetch<PaginatedEnvelope<ConversationRead>>(
      `/api/operator/conversations?${params.toString()}`,
    );
    setEnvelope(result.data);
    setError(result.error);
    setLoading(false);
  }, []);

  const loadDetail = useCallback(async (conversationId: string) => {
    setDetailLoading(true);
    const result = await bffFetch<ConversationDetailRead>(
      `/api/operator/conversations/${encodeURIComponent(conversationId)}`,
    );
    setDetail(result.data);
    setDetailError(result.error);
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    void load(committedFilters);
    const id = window.setInterval(() => {
      void load(committedFilters);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [committedFilters, load]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    void loadDetail(selectedId);
  }, [loadDetail, selectedId]);

  const totalPages = useMemo(() => {
    if (!envelope) {
      return 1;
    }
    return Math.max(1, Math.ceil(envelope.total / envelope.page_size));
  }, [envelope]);

  const loadedItems = envelope?.items ?? [];

  const visibleItems = useMemo(() => {
    return loadedItems
      .filter((conversation) => matchesTab(conversation, committedFilters.tab))
      .filter((conversation) => matchesAdvancedFilters(conversation, committedFilters))
      .sort((a, b) => compareConversations(a, b, committedFilters.sort));
  }, [committedFilters, loadedItems]);

  const tabCounts = useMemo(() => {
    const counts = new Map<ConversationTab, number>();
    for (const tab of TABS) {
      counts.set(
        tab.key,
        tab.key === "todos"
          ? envelope?.total ?? loadedItems.length
          : loadedItems.filter((conversation) => matchesTab(conversation, tab.key)).length,
      );
    }
    return counts;
  }, [envelope?.total, loadedItems]);

  const activeFilterCount = countAdvancedFilters(committedFilters);
  const selectedConversation =
    detail?.conversation ?? loadedItems.find((conversation) => conversation.id === selectedId) ?? null;

  const modelOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const conversation of loadedItems) {
      if (!seen.has(conversation.escort.id)) {
        seen.set(conversation.escort.id, conversation.escort.display_name);
      }
    }
    return Array.from(seen.entries())
      .map(([id, display_name]) => ({ id, display_name }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name, "pt-BR"));
  }, [loadedItems]);

  const amountRangeError = useMemo(() => {
    const min = parseAmountInput(filters.minAmount);
    const max = parseAmountInput(filters.maxAmount);
    if (min !== null && max !== null && min > max) {
      return "O valor mínimo não pode ser maior que o máximo.";
    }
    return null;
  }, [filters.minAmount, filters.maxAmount]);

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (amountRangeError) {
        return;
      }
      const next = { ...filters, page: 1 };
      setFilters(next);
      setCommittedFilters(next);
    },
    [amountRangeError, filters],
  );

  const cycleAmountSort = useCallback(() => {
    setCommittedFilters((prev) => {
      let nextSort: SortKey;
      if (prev.sort === "amount_desc") {
        nextSort = "amount_asc";
      } else if (prev.sort === "amount_asc") {
        nextSort = "priority";
      } else {
        nextSort = "amount_desc";
      }
      const next = { ...prev, sort: nextSort, page: 1 };
      setFilters(next);
      return next;
    });
  }, []);

  const onReset = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setCommittedFilters(EMPTY_FILTERS);
  }, []);

  const setTab = useCallback(
    (tab: ConversationTab) => {
      const next = { ...committedFilters, tab, page: 1 };
      setFilters(next);
      setCommittedFilters(next);
    },
    [committedFilters],
  );

  const gotoPage = useCallback(
    (page: number) => {
      const next = { ...committedFilters, page };
      setCommittedFilters(next);
      setFilters(next);
    },
    [committedFilters],
  );

  const onAcknowledge = useCallback(
    async (conversation: ConversationRead) => {
      setBusyId(conversation.id);
      setActionNotice(null);
      const result = await acknowledgeHandoff(conversation.id);
      setBusyId(null);
      if (result.error) {
        setActionNotice(handoffActionMessage("acknowledge", result.error.status));
      } else {
        setActionNotice(`Você assumiu ${leadName(conversation)}. A IA não responde enquanto o atendimento humano estiver ativo.`);
      }
      await load(committedFilters);
      if (selectedId === conversation.id) {
        await loadDetail(conversation.id);
      }
    },
    [committedFilters, load, loadDetail, selectedId],
  );

  const onRelease = useCallback(
    async (conversation: ConversationRead) => {
      setBusyId(conversation.id);
      setActionNotice(null);
      const result = await releaseHandoff(conversation.id);
      setBusyId(null);
      if (result.error) {
        setActionNotice(handoffActionMessage("release", result.error.status));
      } else {
        setActionNotice(`${leadName(conversation)} voltou para atendimento da IA.`);
      }
      await load(committedFilters);
      if (selectedId === conversation.id) {
        await loadDetail(conversation.id);
      }
    },
    [committedFilters, load, loadDetail, selectedId],
  );

  return (
    <div className="inbox-shell">
      {actionNotice ? <div className="panel-notice warning">{actionNotice}</div> : null}

      <section className="inbox-toolbar" aria-label="Caixa de entrada comercial">
        <div className="inbox-toolbar-actions">
          <div className="view-toggle" role="tablist" aria-label="Alternar visualização">
            <button
              type="button"
              role="tab"
              aria-selected={view === "table"}
              className={view === "table" ? "active" : undefined}
              onClick={() => changeView("table")}
            >
              Tabela
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "kanban"}
              className={view === "kanban" ? "active" : undefined}
              onClick={() => changeView("kanban")}
            >
              Kanban
            </button>
          </div>
          <span className="badge muted">
            {loading ? "Atualizando" : `${envelope?.total ?? 0} conversas`}
          </span>
        </div>

        <div className="status-tabs" role="tablist" aria-label="Status das conversas">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={committedFilters.tab === tab.key ? "status-tab active" : "status-tab"}
              type="button"
              role="tab"
              aria-selected={committedFilters.tab === tab.key}
              onClick={() => setTab(tab.key)}
            >
              <span>{tab.label}</span>
              <strong>{tabCounts.get(tab.key) ?? 0}</strong>
            </button>
          ))}
        </div>

        <form className="inbox-search" onSubmit={onSubmit} aria-label="Busca e filtros de conversas">
          <label className="search-field">
            <span className="visually-hidden">Buscar conversa</span>
            <input
              type="search"
              value={filters.q}
              onChange={(event) => setFilters({ ...filters, q: event.target.value })}
              placeholder="Buscar por nome, telefone, empresa ou mensagem"
            />
          </label>
          <button className="button" type="submit">
            Buscar
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-expanded={advancedOpen}
          >
            Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
          <button className="button secondary" type="button" onClick={onReset}>
            Limpar
          </button>

          {advancedOpen ? (
            <div className="advanced-filters">
              <label>
                <span>Responsável</span>
                <select
                  value={filters.responsible}
                  onChange={(event) =>
                    setFilters({ ...filters, responsible: event.target.value as ResponsibleFilter })
                  }
                >
                  <option value="">Todos</option>
                  <option value="ai">IA atendendo</option>
                  <option value="opened">Aguardando humano</option>
                  <option value="human">Humano ativo ou encerrado</option>
                </select>
              </label>
              <label>
                <span>Etapa comercial</span>
                <select
                  value={filters.flowType}
                  onChange={(event) =>
                    setFilters({ ...filters, flowType: event.target.value as Filters["flowType"] })
                  }
                >
                  <option value="">Todas</option>
                  {FLOW_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {flowTypeLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Tipo de lead</span>
                <select
                  value={filters.clientStatus}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      clientStatus: event.target.value as Filters["clientStatus"],
                    })
                  }
                >
                  <option value="">Todos</option>
                  {CLIENT_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {clientStatusLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Urgência</span>
                <select
                  value={filters.urgencyProfile}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      urgencyProfile: event.target.value as Filters["urgencyProfile"],
                    })
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
                <span>Modelo</span>
                <select
                  value={filters.modelId}
                  onChange={(event) => setFilters({ ...filters, modelId: event.target.value })}
                  disabled={modelOptions.length === 0}
                >
                  <option value="">Todas</option>
                  {modelOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Ordenação</span>
                <select
                  value={filters.sort}
                  onChange={(event) => setFilters({ ...filters, sort: event.target.value as SortKey })}
                >
                  <option value="priority">Prioridade comercial</option>
                  <option value="last_message_at_desc">Atualizadas recentemente</option>
                  <option value="last_message_at_asc">Sem resposta há mais tempo</option>
                  <option value="last_handoff_at_desc">Handoff mais recente</option>
                  <option value="amount_desc">Valor (maior → menor)</option>
                  <option value="amount_asc">Valor (menor → maior)</option>
                </select>
              </label>
              <label>
                <span>Valor mínimo (R$)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={filters.minAmount}
                  onChange={(event) => setFilters({ ...filters, minAmount: event.target.value })}
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
                  onChange={(event) => setFilters({ ...filters, maxAmount: event.target.value })}
                  placeholder="0,00"
                />
              </label>
              {amountRangeError ? (
                <p className="panel-notice warning" role="alert">
                  {amountRangeError}
                </p>
              ) : null}
            </div>
          ) : null}
        </form>
      </section>

      <section className="panel inbox-panel">
        <div className="panel-heading">
          <div>
            <h2>{TABS.find((tab) => tab.key === committedFilters.tab)?.label ?? "Conversas"}</h2>
            <p className="section-subtitle">
              {visibleItems.length} conversas visíveis nesta página. Abra o drawer para contexto e ações rápidas.
            </p>
          </div>
          <span className="live-dot">ao vivo</span>
        </div>

        {error ? <div className="panel-notice">{error.message}</div> : null}

        {!envelope || visibleItems.length === 0 ? (
          <InboxEmptyState tab={committedFilters.tab} filtersActive={hasAnyFilter(committedFilters)} onReset={onReset} />
        ) : view === "kanban" ? (
          <KanbanBoard
            conversations={visibleItems}
            selectedId={selectedId}
            busyId={busyId}
            onOpen={setSelectedId}
            onAcknowledge={(conversation) => void onAcknowledge(conversation)}
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table inbox-table" aria-label="Lista de conversas">
                <thead>
                  <tr>
                    <th>Lead</th>
                    <th>Etapa</th>
                    <th
                      className="numeric"
                      aria-sort={
                        committedFilters.sort === "amount_desc"
                          ? "descending"
                          : committedFilters.sort === "amount_asc"
                            ? "ascending"
                            : "none"
                      }
                    >
                      <button
                        type="button"
                        onClick={cycleAmountSort}
                        aria-label="Ordenar por valor"
                        style={{
                          background: "transparent",
                          border: 0,
                          padding: 0,
                          color: "inherit",
                          font: "inherit",
                          cursor: "pointer",
                          display: "inline-flex",
                          gap: "0.25rem",
                          alignItems: "center",
                        }}
                      >
                        Valor {amountSortIndicator(committedFilters.sort)}
                      </button>
                    </th>
                    <th>Urgência</th>
                    <th>Próximo passo</th>
                    <th>Última mensagem</th>
                    <th>Responsável</th>
                    <th className="numeric">Atualizado</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((conversation) => (
                    <ConversationRow
                      key={conversation.id}
                      conversation={conversation}
                      selected={conversation.id === selectedId}
                      busy={busyId === conversation.id}
                      onOpen={() => setSelectedId(conversation.id)}
                      onAcknowledge={() => void onAcknowledge(conversation)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
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

      {selectedConversation ? (
        <ConversationDrawer
          conversation={selectedConversation}
          detail={detail}
          error={detailError}
          loading={detailLoading}
          busy={busyId === selectedConversation.id}
          onClose={() => setSelectedId(null)}
          onAcknowledge={() => void onAcknowledge(selectedConversation)}
          onRelease={() => void onRelease(selectedConversation)}
        />
      ) : null}
    </div>
  );
}

function KanbanBoard({
  conversations,
  selectedId,
  busyId,
  onOpen,
  onAcknowledge,
}: {
  conversations: ConversationRead[];
  selectedId: string | null;
  busyId: string | null;
  onOpen: (id: string) => void;
  onAcknowledge: (conversation: ConversationRead) => void;
}) {
  const { handoffLane, byColumn } = useMemo(() => {
    const lane: ConversationRead[] = [];
    const columns = new Map<KanbanColumnKey, ConversationRead[]>();
    for (const column of KANBAN_COLUMNS) {
      columns.set(column.key, []);
    }
    for (const conversation of conversations) {
      if (conversation.handoff_status === "OPENED") {
        lane.push(conversation);
        continue;
      }
      const bucket = columns.get(conversation.state as KanbanColumnKey);
      if (bucket) {
        bucket.push(conversation);
      }
    }
    return { handoffLane: lane, byColumn: columns };
  }, [conversations]);

  return (
    <div className="kanban-board" aria-label="Kanban de conversas">
      {handoffLane.length > 0 ? (
        <section className="kanban-lane" aria-label="Conversas que precisam de humano">
          <header className="kanban-lane-header">
            <h3>Precisa humano</h3>
            <span className="chip danger">{handoffLane.length}</span>
          </header>
          <div className="kanban-lane-body">
            {handoffLane.map((conversation) => (
              <KanbanCard
                key={conversation.id}
                conversation={conversation}
                selected={conversation.id === selectedId}
                busy={busyId === conversation.id}
                onOpen={() => onOpen(conversation.id)}
                onAcknowledge={() => onAcknowledge(conversation)}
                needsHuman
              />
            ))}
          </div>
        </section>
      ) : null}

      <div className="kanban-columns">
        {KANBAN_COLUMNS.map((column) => {
          const items = byColumn.get(column.key) ?? [];
          return (
            <section key={column.key} className="kanban-column" aria-label={`Coluna ${column.label}`}>
              <header className="kanban-column-header">
                <h3>{column.label}</h3>
                <span className="chip">{items.length}</span>
              </header>
              <div className="kanban-column-body">
                {items.length === 0 ? (
                  <p className="kanban-column-empty">Sem conversas aqui.</p>
                ) : (
                  items.map((conversation) => (
                    <KanbanCard
                      key={conversation.id}
                      conversation={conversation}
                      selected={conversation.id === selectedId}
                      busy={busyId === conversation.id}
                      onOpen={() => onOpen(conversation.id)}
                      onAcknowledge={() => onAcknowledge(conversation)}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({
  conversation,
  selected,
  busy,
  onOpen,
  onAcknowledge,
  needsHuman = false,
}: {
  conversation: ConversationRead;
  selected: boolean;
  busy: boolean;
  onOpen: () => void;
  onAcknowledge: () => void;
  needsHuman?: boolean;
}) {
  const preview = conversation.last_message?.content_preview || conversation.summary || "";
  const className = ["kanban-card", selected ? "selected" : "", needsHuman ? "needs-human" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={className}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <header className="kanban-card-header">
        <div className="kanban-card-title">
          <HealthDot conversation={conversation} />
          <strong>{leadName(conversation)}</strong>
        </div>
        <span className="kanban-card-updated" title={formatDateTime(conversation.last_message_at)}>
          {formatRelativeSeconds(conversation.last_message_at)}
        </span>
      </header>
      <p className="kanban-card-model">{conversation.escort.display_name}</p>
      <div className="kanban-card-badges">
        <UrgencyBadge conversation={conversation} />
        <ResponsibleBadge conversation={conversation} />
        <span className="chip">{intentLabel(conversation)}</span>
        {conversation.expected_amount ? (
          <span className="chip gold">{formatCurrency(conversation.expected_amount)}</span>
        ) : null}
      </div>
      {preview ? <p className="kanban-card-preview">{truncate(preview, 120)}</p> : null}
      <footer className="kanban-card-footer">
        <span className="kanban-card-next">
          {conversation.pending_action || nextStepFallback(conversation)}
        </span>
        {needsHuman ? (
          <button
            className="button row-cta"
            type="button"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onAcknowledge();
            }}
          >
            Assumir
          </button>
        ) : null}
      </footer>
    </article>
  );
}

function ConversationRow({
  conversation,
  selected,
  busy,
  onOpen,
  onAcknowledge,
}: {
  conversation: ConversationRead;
  selected: boolean;
  busy: boolean;
  onOpen: () => void;
  onAcknowledge: () => void;
}) {
  const preview = conversation.last_message?.content_preview || conversation.summary || "-";
  const needsHuman = conversation.handoff_status === "OPENED";
  const actionLabel = needsHuman ? "Assumir" : ctaLabel(conversation);

  return (
    <tr className={selected ? "clickable selected-row" : "clickable"} onClick={onOpen}>
      <td>
        <div className="lead-cell">
          <div className="lead-cell-head">
            <HealthDot conversation={conversation} />
            <strong>{leadName(conversation)}</strong>
          </div>
          <span>{conversation.client.whatsapp_jid}</span>
          <ContextBadges conversation={conversation} />
        </div>
      </td>
      <td>
        <StatusBadge conversation={conversation} />
      </td>
      <td className="numeric">
        {conversation.expected_amount ? formatCurrency(conversation.expected_amount) : "-"}
      </td>
      <td>
        <UrgencyBadge conversation={conversation} />
      </td>
      <td className="next-step-cell">{conversation.pending_action || nextStepFallback(conversation)}</td>
      <td className="message-preview">{truncate(preview, 92)}</td>
      <td>
        <ResponsibleBadge conversation={conversation} />
      </td>
      <td className="numeric muted-cell">
        <span title={formatDateTime(conversation.last_message_at)}>
          {formatRelativeSeconds(conversation.last_message_at)}
        </span>
      </td>
      <td>
        <button
          className={needsHuman ? "button row-cta" : "button secondary row-cta"}
          type="button"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            if (needsHuman) {
              onAcknowledge();
            } else {
              onOpen();
            }
          }}
        >
          {actionLabel}
        </button>
      </td>
    </tr>
  );
}

function ConversationDrawer({
  conversation,
  detail,
  error,
  loading,
  busy,
  onClose,
  onAcknowledge,
  onRelease,
}: {
  conversation: ConversationRead;
  detail: ConversationDetailRead | null;
  error: BffFetchError | null;
  loading: boolean;
  busy: boolean;
  onClose: () => void;
  onAcknowledge: () => void;
  onRelease: () => void;
}) {
  const messages = detail?.messages ?? [];
  const handoffEvents = detail?.handoff_events ?? [];
  const canAcknowledge = conversation.handoff_status === "OPENED";
  const canRelease = conversation.handoff_status === "OPENED" || conversation.handoff_status === "ACKNOWLEDGED";

  return (
    <aside className="conversation-drawer" aria-label="Detalhes da conversa">
      <div className="drawer-header">
        <div>
          <span className="eyebrow">Conversa</span>
          <h2>{leadName(conversation)}</h2>
          <p>{conversation.client.whatsapp_jid}</p>
        </div>
        <button className="drawer-close" type="button" onClick={onClose} aria-label="Fechar drawer">
          ×
        </button>
      </div>

      <div className="drawer-badges">
        <StatusBadge conversation={conversation} />
        <UrgencyBadge conversation={conversation} />
        <ResponsibleBadge conversation={conversation} />
        <span className="chip">{intentLabel(conversation)}</span>
      </div>

      <div className="drawer-actions">
        <button className="button" type="button" disabled={!canAcknowledge || busy} onClick={onAcknowledge}>
          Assumir lead
        </button>
        <button className="button danger" type="button" disabled={!canRelease || busy} onClick={onRelease}>
          Devolver para IA
        </button>
      </div>

      {loading ? <div className="panel-notice warning">Carregando histórico da conversa...</div> : null}
      {error ? <div className="panel-notice">{error.message}</div> : null}

      <div className="drawer-section">
        <h3>Resumo da IA</h3>
        <p>{conversation.summary || "A IA ainda não gerou um resumo para esta conversa."}</p>
      </div>

      <div className="drawer-section next-step-panel">
        <h3>Próximo passo sugerido</h3>
        <p>{conversation.pending_action || nextStepFallback(conversation)}</p>
      </div>

      <div className="drawer-section">
        <h3>Dados coletados</h3>
        <dl className="compact-kv">
          <div>
            <dt>Lead</dt>
            <dd>{leadName(conversation)}</dd>
          </div>
          <div>
            <dt>Modelo</dt>
            <dd>{conversation.escort.display_name}</dd>
          </div>
          <div>
            <dt>Etapa</dt>
            <dd>{conversationStateLabel(conversation.state)}</dd>
          </div>
          <div>
            <dt>Tipo</dt>
            <dd>{flowTypeLabel(conversation.flow_type)}</dd>
          </div>
          <div>
            <dt>Valor</dt>
            <dd>{conversation.expected_amount ? formatCurrency(conversation.expected_amount) : "-"}</dd>
          </div>
          <div>
            <dt>Perfil</dt>
            <dd>{conversation.client.profile_summary || clientStatusLabel(conversation.client.client_status) || "-"}</dd>
          </div>
        </dl>
      </div>

      <div className="drawer-section">
        <div className="drawer-section-heading">
          <h3>Histórico</h3>
          <Link className="link-pill" href={`/conversas/${conversation.id}`}>
            Abrir página completa
          </Link>
        </div>
        {messages.length === 0 ? (
          <p className="empty-state">Sem mensagens carregadas para esta conversa.</p>
        ) : (
          <>
            <p className="message-counts">{formatMessageCounts(messageCounts(messages))}</p>
            <div className="timeline drawer-timeline">
              {messages.slice(0, 8).map((message) => (
                <DrawerMessageEntry key={message.id} message={message} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="drawer-section">
        <h3>Handoffs</h3>
        {handoffEvents.length === 0 ? (
          <p className="empty-state">Esta conversa ainda não foi enviada para atendimento humano.</p>
        ) : (
          <div className="stack-sm">
            {handoffEvents.slice(0, 4).map((event, index) => (
              <HandoffEventSummary key={event.id ?? index} event={event} />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function InboxEmptyState({
  tab,
  filtersActive,
  onReset,
}: {
  tab: ConversationTab;
  filtersActive: boolean;
  onReset: () => void;
}) {
  const copy = emptyCopy(tab, filtersActive);
  return (
    <div className="empty-state-card">
      <span className="empty-state-icon" aria-hidden="true" />
      <div className="empty-state-copy">
        <strong>{copy.title}</strong>
        <p>{copy.description}</p>
      </div>
      {filtersActive ? (
        <button className="button secondary empty-state-action" type="button" onClick={onReset}>
          Limpar filtros
        </button>
      ) : null}
    </div>
  );
}

function ContextBadges({ conversation }: { conversation: ConversationRead }) {
  const badges = [
    conversation.awaiting_client_decision ? (
      <span className="chip warning" key="decision">
        aguarda lead
      </span>
    ) : null,
    conversation.client.client_status ? (
      <span className="chip" key="status">
        {clientStatusLabel(conversation.client.client_status)}
      </span>
    ) : null,
  ].filter(Boolean);

  if (badges.length === 0) {
    return null;
  }
  return <div className="lead-badges">{badges}</div>;
}

function HealthDot({ conversation }: { conversation: ConversationRead }) {
  const health = agentHealth(conversation);
  const labels: Record<AgentHealth, string> = {
    ok: "IA conduzindo bem",
    attention: "Atenção: conversa parada",
    intervention: "Intervenção: aguardando humano",
  };
  return <span className={`health-dot ${health}`} aria-label={labels[health]} title={labels[health]} />;
}

function amountSortIndicator(sort: SortKey): string {
  if (sort === "amount_desc") return "↓";
  if (sort === "amount_asc") return "↑";
  return "↕";
}

function StatusBadge({ conversation }: { conversation: ConversationRead }) {
  if (conversation.handoff_status === "OPENED") {
    return <span className="chip danger">Precisa humano</span>;
  }
  if (conversation.state === "NEGOCIANDO") {
    return <span className="chip gold">Quente</span>;
  }
  return <span className="chip">{conversationStateLabel(conversation.state)}</span>;
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

function ResponsibleBadge({ conversation }: { conversation: ConversationRead }) {
  if (conversation.handoff_status === "OPENED") {
    return <span className="chip danger">Aguardando humano</span>;
  }
  if (conversation.handoff_status === "ACKNOWLEDGED") {
    return <span className="chip warning">Humano</span>;
  }
  return <span className="chip">IA</span>;
}

function DrawerMessageEntry({ message }: { message: ConversationMessageRead }) {
  const directionLabel = message.direction === "INBOUND" ? "lead" : message.role === "human" ? "humano" : "IA";
  return (
    <article className={`timeline-entry role-${message.role}`}>
      <header>
        <span>{directionLabel}</span>
        <span>{formatRelativeSeconds(message.created_at)}</span>
      </header>
      <p>{message.content_text || "(sem texto)"}</p>
      {message.delivery_status ? (
        <span className={message.delivery_status === "FAILED" ? "chip danger" : "chip"}>
          {deliveryStatusLabel(message.delivery_status)}
        </span>
      ) : null}
    </article>
  );
}

function HandoffEventSummary({ event }: { event: HandoffEventRead }) {
  return (
    <div className="timeline-entry">
      <header>
        <span>{handoffStatusLabel(event.previous_handoff_status)} → {eventLabel(event.event_type)}</span>
        <span>{formatRelativeSeconds(event.created_at)}</span>
      </header>
      <p>{handoffReasonLabel(event.reason) || "Sem motivo informado"}</p>
    </div>
  );
}

function matchesTab(conversation: ConversationRead, tab: ConversationTab): boolean {
  switch (tab) {
    case "humano":
      return conversation.handoff_status === "OPENED";
    case "quentes":
      return isHotLead(conversation);
    case "paradas":
      return isStale(conversation);
    case "todos":
    default:
      return true;
  }
}

function matchesAdvancedFilters(conversation: ConversationRead, filters: Filters): boolean {
  if (filters.flowType && conversation.flow_type !== filters.flowType) {
    return false;
  }
  if (filters.clientStatus && conversation.client.client_status !== filters.clientStatus) {
    return false;
  }
  if (filters.urgencyProfile && conversation.urgency_profile !== filters.urgencyProfile) {
    return false;
  }
  if (filters.modelId && conversation.escort.id !== filters.modelId) {
    return false;
  }
  if (filters.responsible === "ai" && conversation.handoff_status !== "NONE") {
    return false;
  }
  if (filters.responsible === "opened" && conversation.handoff_status !== "OPENED") {
    return false;
  }
  if (
    filters.responsible === "human" &&
    !["OPENED", "ACKNOWLEDGED", "RELEASED"].includes(conversation.handoff_status)
  ) {
    return false;
  }
  return true;
}

function compareConversations(a: ConversationRead, b: ConversationRead, sort: SortKey): number {
  if (sort === "last_message_at_asc") {
    return compareNullableDate(a.last_message_at, b.last_message_at, "asc");
  }
  if (sort === "last_message_at_desc") {
    return compareNullableDate(a.last_message_at, b.last_message_at, "desc");
  }
  if (sort === "last_handoff_at_desc") {
    return compareNullableDate(a.last_handoff_at ?? null, b.last_handoff_at ?? null, "desc");
  }
  if (sort === "amount_asc") {
    return compareNullableAmount(a.expected_amount, b.expected_amount, "asc");
  }
  if (sort === "amount_desc") {
    return compareNullableAmount(a.expected_amount, b.expected_amount, "desc");
  }
  return priorityScore(b) - priorityScore(a) || compareNullableDate(a.last_message_at, b.last_message_at, "desc");
}

function compareNullableAmount(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  direction: "asc" | "desc",
): number {
  const av = a == null ? null : Number(a);
  const bv = b == null ? null : Number(b);
  if ((av === null || Number.isNaN(av)) && (bv === null || Number.isNaN(bv))) return 0;
  if (av === null || Number.isNaN(av)) return 1;
  if (bv === null || Number.isNaN(bv)) return -1;
  const diff = av - bv;
  return direction === "asc" ? diff : -diff;
}

function compareNullableDate(a: string | null, b: string | null, direction: "asc" | "desc"): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const diff = new Date(a).getTime() - new Date(b).getTime();
  return direction === "asc" ? diff : -diff;
}

function priorityScore(conversation: ConversationRead): number {
  let score = 0;
  if (conversation.handoff_status === "OPENED") score += 100;
  if (conversation.urgency_profile === "IMMEDIATE") score += 50;
  if (conversation.state === "NEGOCIANDO") score += 35;
  if (conversation.expected_amount) score += 20;
  if (conversation.awaiting_client_decision) score += 10;
  if (isStale(conversation)) score += 8;
  return score;
}

function isHotLead(conversation: ConversationRead): boolean {
  return (
    conversation.state === "NEGOCIANDO" ||
    conversation.urgency_profile === "IMMEDIATE" ||
    Boolean(conversation.expected_amount)
  );
}

function isStale(conversation: ConversationRead): boolean {
  if (!conversation.last_message_at || conversation.state === "CONFIRMADO") {
    return false;
  }
  return Date.now() - new Date(conversation.last_message_at).getTime() > STALE_HOURS * 60 * 60 * 1000;
}

type AgentHealth = "ok" | "attention" | "intervention";

function agentHealth(conversation: ConversationRead): AgentHealth {
  if (conversation.handoff_status === "OPENED") return "intervention";
  if (isStale(conversation)) return "attention";
  return "ok";
}

type MessageCounts = {
  total: number;
  ia: number;
  lead: number;
  humano: number;
};

function messageCounts(messages: ConversationMessageRead[]): MessageCounts {
  const counts: MessageCounts = { total: messages.length, ia: 0, lead: 0, humano: 0 };
  for (const message of messages) {
    if (message.role === "client") counts.lead += 1;
    else if (message.role === "human") counts.humano += 1;
    else if (message.role === "agent") counts.ia += 1;
  }
  return counts;
}

function formatMessageCounts(counts: MessageCounts): string {
  const parts: string[] = [`${counts.total} ${counts.total === 1 ? "mensagem" : "mensagens"}`];
  parts.push(`IA ${counts.ia}`);
  parts.push(`lead ${counts.lead}`);
  if (counts.humano > 0) parts.push(`humano ${counts.humano}`);
  return parts.join(" · ");
}

function countAdvancedFilters(filters: Filters): number {
  return [
    filters.flowType,
    filters.clientStatus,
    filters.urgencyProfile,
    filters.responsible,
    filters.modelId,
    filters.minAmount.trim(),
    filters.maxAmount.trim(),
  ].filter(Boolean).length;
}

function hasAnyFilter(filters: Filters): boolean {
  return (
    filters.tab !== "todos" ||
    Boolean(filters.q.trim()) ||
    filters.sort !== "priority" ||
    countAdvancedFilters(filters) > 0
  );
}

function leadName(conversation: ConversationRead): string {
  return conversation.client.display_name || conversation.client.whatsapp_jid;
}

function intentLabel(conversation: ConversationRead): string {
  if (conversation.handoff_status === "OPENED") return "Atendimento humano";
  if (conversation.expected_amount) return "Compra";
  if (conversation.flow_type === "EXTERNAL") return "Deslocamento";
  if (conversation.awaiting_client_decision) return "Decisão";
  if (conversation.flow_type === "INTERNAL") return "Agendar";
  return "Qualificar";
}

function ctaLabel(conversation: ConversationRead): string {
  if (conversation.awaiting_client_decision) return "Revisar";
  if (conversation.state === "NEGOCIANDO") return "Abrir";
  return "Abrir";
}

function nextStepFallback(conversation: ConversationRead): string {
  if (conversation.handoff_status === "OPENED") return "Assumir e responder manualmente";
  if (conversation.awaiting_client_decision) return "Acompanhar decisão do lead";
  if (conversation.state === "NOVO") return "Entender intenção e qualificar";
  if (conversation.state === "QUALIFICANDO") return "Coletar dados faltantes";
  if (conversation.state === "NEGOCIANDO") return "Remover objeção e fechar próximo passo";
  return "Revisar contexto";
}

function eventLabel(eventType: string): string {
  switch (eventType) {
    case "handoff_opened":
      return "enviado para humano";
    case "handoff_acknowledged":
      return "assumido";
    case "handoff_released":
      return "devolvido para IA";
    default:
      return eventType;
  }
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}...`;
}

function emptyCopy(tab: ConversationTab, filtersActive: boolean): { title: string; description: string } {
  if (filtersActive) {
    return {
      title: "Nenhuma conversa encontrada",
      description: "Tente remover filtros ou buscar por nome, telefone, empresa ou mensagem.",
    };
  }
  switch (tab) {
    case "humano":
      return {
        title: "Nenhum lead precisa de humano agora",
        description: "Quando a IA identificar uma conversa que exige atendimento manual, ela aparecerá aqui.",
      };
    case "quentes":
      return {
        title: "Nenhum lead quente no momento",
        description: "Leads com intenção forte, valor combinado ou urgência imediata serão destacados aqui.",
      };
    case "paradas":
      return {
        title: "Nenhuma conversa parada",
        description: "Conversas sem movimento há mais de 24 horas aparecem aqui para revisão.",
      };
    default:
      return {
        title: "Nenhuma conversa ainda",
        description: "As conversas aparecerão aqui quando novos leads entrarem pelos canais conectados.",
      };
  }
}
