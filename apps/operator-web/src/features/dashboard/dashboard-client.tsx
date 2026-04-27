"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AgentOpsSummaryRead,
  ConversationQueueItemRead,
  ConversationRead,
  ConversationState,
  DashboardHealthRead,
  DashboardSummaryRead,
  EscortRead,
  FlowType,
  HandoffSummaryRead,
  HandoffStatus,
  MediaRead,
  PaginatedEnvelope,
  ReceiptRead,
  ScheduleSlotRead,
  ScheduleSlotStatus,
} from "@/contracts";
import { bffFetch, type BffFetchError } from "@/features/shared/bff-client";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatRelativeSeconds,
} from "@/features/shared/formatters";
import {
  conversationStateLabel,
  escortPendencyKindLabel,
  flowTypeLabel,
  handoffReasonLabel,
  handoffStatusLabel,
  queueLabel,
  queueReason,
  scheduleSlotLabel,
  urgencyProfileLabel,
} from "@/features/shared/labels";
import { detectEscortPendencies } from "@/features/shared/pending";

const POLL_INTERVAL_MS = 15_000;
const DASHBOARD_WINDOW_DAYS = 14;
const SAMPLE_PAGE_SIZE = 100;
const QUEUE_PAGE_SIZE = 25;
const ATTENTION_PAGE_SIZE = 10;
const ATTENTION_LIMIT = 5;
const PRIORITY_QUEUE_DEFAULT_LIMIT = 5;
const OLD_HANDOFF_MINUTES = 30;
const STALLED_CONVERSATION_HOURS = 48;
const UNDETERMINED_FLOW_HOURS = 1;
const PENDING_SYNC_MINUTES = 15;

type Envelope<T> = PaginatedEnvelope<T>;

type DashboardState = {
  loadedAt: string | null;
  health: DashboardHealthRead | null;
  summary: DashboardSummaryRead | null;
  handoffSummary: HandoffSummaryRead | null;
  queues: Envelope<ConversationQueueItemRead> | null;
  conversations: Envelope<ConversationRead> | null;
  handoffsOpen: Envelope<ConversationRead> | null;
  handoffsAck: Envelope<ConversationRead> | null;
  slots: Envelope<ScheduleSlotRead> | null;
  media: Envelope<MediaRead> | null;
  receipts: Envelope<ReceiptRead> | null;
  escort: EscortRead | null;
  agentOps: AgentOpsSummaryRead | null;
  errors: {
    conversations: BffFetchError | null;
    health: BffFetchError | null;
    summary: BffFetchError | null;
    handoffSummary: BffFetchError | null;
    queues: BffFetchError | null;
    handoffsOpen: BffFetchError | null;
    handoffsAck: BffFetchError | null;
    slots: BffFetchError | null;
    media: BffFetchError | null;
    receipts: BffFetchError | null;
    escort: BffFetchError | null;
    agentOps: BffFetchError | null;
  };
};

const INITIAL_STATE: DashboardState = {
  loadedAt: null,
  health: null,
  summary: null,
  handoffSummary: null,
  queues: null,
  conversations: null,
  handoffsOpen: null,
  handoffsAck: null,
  slots: null,
  media: null,
  receipts: null,
  escort: null,
  agentOps: null,
  errors: {
    conversations: null,
    health: null,
    summary: null,
    handoffSummary: null,
    queues: null,
    handoffsOpen: null,
    handoffsAck: null,
    slots: null,
    media: null,
    receipts: null,
    escort: null,
    agentOps: null,
  },
};

const STATE_LABELS: ConversationState[] = [
  "NOVO",
  "QUALIFICANDO",
  "NEGOCIANDO",
  "CONFIRMADO",
  "ESCALADO",
];
const FLOW_LABELS: FlowType[] = ["UNDETERMINED", "INTERNAL", "EXTERNAL"];
const HANDOFF_LABELS: HandoffStatus[] = ["NONE", "OPENED", "ACKNOWLEDGED", "RELEASED"];
const SCHEDULE_STATUS_LABELS: ScheduleSlotStatus[] = [
  "AVAILABLE",
  "BLOCKED",
  "HELD",
  "CONFIRMED",
  "CANCELLED",
];
export function DashboardClient() {
  const [state, setState] = useState<DashboardState>(INITIAL_STATE);
  const [firstLoad, setFirstLoad] = useState(true);
  const [showAllQueue, setShowAllQueue] = useState(false);
  const [selectedQueueIndex, setSelectedQueueIndex] = useState(0);

  const load = useCallback(async () => {
    const now = new Date();
    const from = now.toISOString();
    const to = new Date(now.getTime() + DASHBOARD_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const [health, summary, handoffSummary, queues, conversations, handoffsOpen, handoffsAck, slots, media, receipts, escort, agentOps] = await Promise.all([
      bffFetch<DashboardHealthRead>("/api/operator/dashboard/health"),
      bffFetch<DashboardSummaryRead>("/api/operator/dashboard/summary?window=24h"),
      bffFetch<HandoffSummaryRead>("/api/operator/handoffs/summary?window=7d"),
      bffFetch<Envelope<ConversationQueueItemRead>>(
        `/api/operator/dashboard/queues?page_size=${QUEUE_PAGE_SIZE}`,
      ),
      bffFetch<Envelope<ConversationRead>>(
        `/api/operator/conversations?page_size=${SAMPLE_PAGE_SIZE}`,
      ),
      bffFetch<Envelope<ConversationRead>>(
        `/api/operator/conversations?handoff_status=OPENED&page_size=${ATTENTION_PAGE_SIZE}`,
      ),
      bffFetch<Envelope<ConversationRead>>(
        `/api/operator/conversations?handoff_status=ACKNOWLEDGED&page_size=${ATTENTION_PAGE_SIZE}`,
      ),
      bffFetch<Envelope<ScheduleSlotRead>>(
        `/api/operator/schedule/slots?from=${encodeURIComponent(from)}&to=${encodeURIComponent(
          to,
        )}&page_size=${SAMPLE_PAGE_SIZE}`,
      ),
      bffFetch<Envelope<MediaRead>>(`/api/operator/media?page_size=${SAMPLE_PAGE_SIZE}`),
      bffFetch<Envelope<ReceiptRead>>(
        `/api/operator/receipts?needs_review=true&page_size=${ATTENTION_PAGE_SIZE}`,
      ),
      bffFetch<EscortRead>("/api/operator/escorts/active"),
      bffFetch<AgentOpsSummaryRead>("/api/operator/status/agent?window=24h"),
    ]);

    setState({
      loadedAt: new Date().toISOString(),
      health: health.data,
      summary: summary.data,
      handoffSummary: handoffSummary.data,
      queues: queues.data,
      conversations: conversations.data,
      handoffsOpen: handoffsOpen.data,
      handoffsAck: handoffsAck.data,
      slots: slots.data,
      media: media.data,
      receipts: receipts.data,
      escort: escort.data,
      agentOps: agentOps.data,
      errors: {
        health: health.error,
        summary: summary.error,
        handoffSummary: handoffSummary.error,
        queues: queues.error,
        conversations: conversations.error,
        handoffsOpen: handoffsOpen.error,
        handoffsAck: handoffsAck.error,
        slots: slots.error,
        media: media.error,
        receipts: receipts.error,
        escort: escort.error,
        agentOps: agentOps.error,
      },
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

  const derived = useMemo(() => deriveDashboard(state), [state]);
  const priorityQueueItems = useMemo(
    () => (showAllQueue ? derived.priorityQueueItems : derived.priorityQueueItems.slice(0, PRIORITY_QUEUE_DEFAULT_LIMIT)),
    [derived.priorityQueueItems, showAllQueue],
  );
  const resolveTabs = useMemo(() => buildResolveTabs(state), [state]);
  const defaultResolveTab = useMemo(() => pickDefaultResolveTab(resolveTabs), [resolveTabs]);
  const [activeResolveTab, setActiveResolveTab] = useState<ResolveTabId>(defaultResolveTab);
  const summaryError = state.errors.summary;
  const hasAgentFailure = (state.agentOps?.failed_or_partial?.value ?? 0) > 0;
  const bffOutage = detectBffOutage(state.errors);

  useEffect(() => {
    setActiveResolveTab((current) => {
      const currentTab = resolveTabs.find((tab) => tab.id === current);
      if (currentTab && currentTab.count > 0) {
        return current;
      }
      return defaultResolveTab;
    });
  }, [defaultResolveTab, resolveTabs]);

  useEffect(() => {
    setSelectedQueueIndex((current) => {
      if (priorityQueueItems.length === 0) {
        return 0;
      }
      return Math.min(current, priorityQueueItems.length - 1);
    });
  }, [priorityQueueItems.length]);

  useEffect(() => {
    if (priorityQueueItems.length === 0) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        shouldIgnoreQueueShortcut(event.target)
      ) {
        return;
      }

      if (event.key === "j") {
        event.preventDefault();
        setSelectedQueueIndex((current) => Math.min(current + 1, priorityQueueItems.length - 1));
      }

      if (event.key === "k") {
        event.preventDefault();
        setSelectedQueueIndex((current) => Math.max(current - 1, 0));
      }

      if (event.key === "Enter") {
        const item = priorityQueueItems[selectedQueueIndex];
        if (!item) {
          return;
        }
        event.preventDefault();
        window.location.assign(item.drilldown_href);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [priorityQueueItems, selectedQueueIndex]);

  if (firstLoad) {
    return (
      <div className="panel" role="status">
        <div className="panel-heading">
          <h2>Carregando command center</h2>
          <span className="badge muted">Buscando</span>
        </div>
        <p className="empty-state">Buscando saúde do agente, fila de prioridade, pendências e sinais operacionais.</p>
      </div>
    );
  }

  return (
    <div className="section-stack stagger-in">
      {bffOutage ? (
        <div className="bff-outage" role="alert">
          <strong>Sem conexão com o servidor</strong>
          <span>
            Mantivemos a última leitura visível e vamos tentar de novo em cerca de {Math.round(POLL_INTERVAL_MS / 1000)} segundos.
          </span>
        </div>
      ) : null}

      <HealthBar
        loadedAt={state.loadedAt}
        health={state.health}
        error={state.errors.health}
        onRefresh={() => {
          void load();
        }}
      />

      {!bffOutage && summaryError ? (
        <div className="panel-notice">
          Não consegui montar o resumo completo. Mostrando o que já carreguei e atualizando de novo no próximo ciclo.
        </div>
      ) : null}

      {hasAgentFailure ? (
        <div className="panel-notice warning">
          O agente teve falhas nas últimas 24 horas. <Link href="/status">Revisar status</Link>.
        </div>
      ) : null}

      <CommandCenterSection state={state} derived={derived} />

      <PriorityQueuePanel
        items={derived.priorityQueueItems}
        visibleItems={priorityQueueItems}
        selectedIndex={selectedQueueIndex}
        showAll={showAllQueue}
        error={state.errors.queues}
        suppressError={Boolean(bffOutage)}
        onShowAll={() => setShowAllQueue((current) => !current)}
        onSelect={setSelectedQueueIndex}
      />

      <ResolveNowPanel
        tabs={resolveTabs}
        activeTab={activeResolveTab}
        onChangeTab={setActiveResolveTab}
      />

      <PerformanceInsightsSection summary={state.summary} handoffSummary={state.handoffSummary} />

      <details className="analytics-accordion">
        <summary>Ver análise detalhada</summary>
        <div className="dashboard-columns analytics-grid">
          <ConversationBreakdownPanel
            summary={state.summary}
            conversations={state.conversations}
            error={state.errors.conversations}
            suppressError={Boolean(bffOutage)}
          />
          <HandoffSummaryPanel
            summary={state.handoffSummary}
            error={state.errors.handoffSummary}
            suppressError={Boolean(bffOutage)}
          />
          <ScheduleSummaryPanel
            summary={state.summary}
            slots={state.slots}
            error={state.errors.slots}
            syncPendingCount={derived.syncPendingCount}
            syncErrorCount={derived.syncErrorCount}
            suppressError={Boolean(bffOutage)}
          />
          <MediaSummaryPanel
            summary={state.summary}
            media={state.media}
            error={state.errors.media}
            suppressError={Boolean(bffOutage)}
          />
          <EscortPendenciesPanel
            escort={state.escort}
            error={state.errors.escort}
            suppressError={Boolean(bffOutage)}
          />
        </div>
      </details>
    </div>
  );
}

function queueTone(item: ConversationQueueItemRead): string {
  if (item.queue_key === "OPEN_HANDOFF" || item.queue_key === "EXTERNAL_OPEN_HANDOFF") {
    return "danger";
  }
  if (item.queue_key === "ACKNOWLEDGED_HANDOFF" || item.queue_key === "CLIENT_WAITING_RESPONSE") {
    return "warning";
  }
  return "";
}

type ResolveTabId = "config" | "leads" | "payments" | "agenda" | "media";

type PendingTone = "default" | "warning" | "danger";

type PendingMeta = {
  label: string;
  tone?: PendingTone;
};

type PendingItemData = {
  id: string;
  title: string;
  summary: string;
  href: string;
  actionLabel: string;
  tone?: PendingTone;
  meta?: PendingMeta[];
};

type ResolveTab = {
  id: ResolveTabId;
  label: string;
  href: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyActionLabel?: string;
  count: number;
  items: PendingItemData[];
  error: BffFetchError | null;
};

type QueueListItem = ConversationQueueItemRead & {
  nextBestAction: string;
  expectedAmountLabel: string | null;
  urgencyLabel: string | null;
  languageLabel: string | null;
};

function HealthBar({
  loadedAt,
  health,
  error,
  onRefresh,
}: {
  loadedAt: string | null;
  health: DashboardHealthRead | null;
  error: BffFetchError | null;
  onRefresh: () => void;
}) {
  if (error) {
    return (
      <section className="health-bar">
        <div className="health-bar-status">
          <HealthPill label="Saúde do agente" tone="danger" value="Sem leitura" detail={error.message} />
        </div>
        <div className="health-bar-actions">
          <span className="live-dot" aria-live="polite">
            atualizado {formatDateTime(loadedAt)}
          </span>
          <button className="button secondary health-refresh-button" type="button" onClick={onRefresh}>
            Atualizar agora
          </button>
        </div>
      </section>
    );
  }

  if (!health) {
    return (
      <section className="health-bar">
        <div className="health-bar-status">
          <HealthPill label="Saúde do agente" tone="warning" value="Coletando" />
        </div>
        <div className="health-bar-actions">
          <span className="live-dot" aria-live="polite">
            atualizado {formatDateTime(loadedAt)}
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="health-bar">
      <div className="health-bar-status">
        <HealthPill label="Agente" tone={healthTone(health.agent.status)} value={health.agent.label} detail={health.agent.detail} />
        <HealthPill
          label="WhatsApp"
          tone={healthTone(health.whatsapp.status)}
          value={health.whatsapp.label}
          detail={health.whatsapp.detail}
        />
        <HealthPill
          label="Calendar"
          tone={healthTone(health.calendar.status)}
          value={health.calendar.label}
          detail={health.calendar.detail}
        />
        <HealthPill label="Configuração" tone={healthTone(health.model.status)} value={health.model.label} detail={health.model.detail} />
      </div>
      <div className="health-bar-actions">
        <span className="live-dot" aria-live="polite">
          atualizado {formatDateTime(loadedAt)}
        </span>
        <button className="button secondary health-refresh-button" type="button" onClick={onRefresh}>
          Atualizar agora
        </button>
      </div>
    </section>
  );
}

function HealthPill({
  label,
  value,
  tone,
  detail,
}: {
  label: string;
  value: string;
  tone: "ok" | "warning" | "danger";
  detail?: string | null;
}) {
  return (
    <div className={`health-pill ${tone}`} title={detail ?? undefined}>
      <span className="health-pill-label">{label}</span>
      <span className="health-pill-value">{value}</span>
    </div>
  );
}

function healthTone(status: string): "ok" | "warning" | "danger" {
  if (status === "online" || status === "connected" || status === "synced" || status === "complete") {
    return "ok";
  }
  if (status === "degraded" || status === "reconnecting" || status === "pending") {
    return "warning";
  }
  return "danger";
}

function CommandCenterSection({
  state,
  derived,
}: {
  state: DashboardState;
  derived: ReturnType<typeof deriveDashboard>;
}) {
  const handoffOpenValue =
    handoffStatusValue(state.handoffSummary, "OPENED") ??
    state.summary?.handoffs_opened?.value ??
    metricValueFromEnvelope(state.handoffsOpen, state.errors.handoffsOpen);
  const humanInProgressValue =
    handoffStatusValue(state.handoffSummary, "ACKNOWLEDGED") ??
    state.summary?.handoffs_acknowledged?.value ??
    metricValueFromEnvelope(state.handoffsAck, state.errors.handoffsAck);
  const newTodayValue = state.summary?.new_conversations_today?.value ?? null;
  const financial = state.summary?.financial ?? null;
  const pipelineTotalRaw = financial?.open_pipeline_total.value ?? null;
  const pipelineTotal = pipelineTotalRaw !== null ? Number(pipelineTotalRaw) : null;
  const pipelineByState = financial?.open_pipeline_by_state?.amounts ?? {};
  const pipelineGrowthDelta = financial?.pipeline_growth.delta_percent ?? null;
  const pipelineGrowthChip =
    pipelineGrowthDelta === null
      ? { label: "sem histórico", tone: undefined }
      : pipelineGrowthDelta >= 10
        ? { label: `+${formatNumber(pipelineGrowthDelta)}% vs 7d anteriores`, tone: "ok" as const }
        : pipelineGrowthDelta <= -10
          ? { label: `${formatNumber(pipelineGrowthDelta)}% vs 7d anteriores`, tone: "danger" as const }
          : pipelineGrowthDelta < 0
            ? { label: `${formatNumber(pipelineGrowthDelta)}% vs 7d anteriores`, tone: "warning" as const }
            : { label: `+${formatNumber(pipelineGrowthDelta)}% vs 7d anteriores`, tone: undefined };
  const divergenceValue = Number(financial?.divergence_abs_last_7d.value ?? 0);
  const scheduleConfirmed = state.summary?.schedule_slots_next_14d_by_status?.counts.CONFIRMED ?? 0;
  const scheduleTotalNext14d = state.summary?.schedule_slots_next_14d_total?.value ?? 0;
  const scheduleSyncError = state.summary?.calendar_sync_error?.value ?? derived.syncErrorCount;
  const scheduleSyncPending = state.summary?.calendar_sync_pending?.value ?? derived.syncPendingCount;
  const agentOps = state.agentOps;
  const agentOpsError = state.errors.agentOps;
  const agentExecutionCount = agentOps?.total_executions.value ?? null;
  const agentFailedCount = agentOps?.failed_or_partial.value ?? 0;
  const agentFallbackCount = agentOps?.fallback_used.value ?? 0;
  const agentToolFailureCount = agentOps?.tool_failures.value ?? 0;
  const agentP95Label = formatDurationMs(agentOps?.duration.p95_ms);
  const agentOpsTone =
    agentOpsError || agentOps === null
      ? "warning"
      : agentFailedCount >= 5 || agentToolFailureCount > 0
        ? "danger"
        : agentFailedCount > 0 || agentFallbackCount > 0 || agentExecutionCount === 0
          ? "warning"
          : "ok";
  const agentOpsDescription =
    agentOpsError || agentOps === null
      ? "Sem leitura do agente nas últimas 24h."
      : agentFailedCount > 0
        ? "O agente teve falhas ou execuções parciais nas últimas 24h."
        : agentExecutionCount === 0
          ? "Nenhuma execução nas últimas 24h."
          : "Agente rodando dentro do esperado nas últimas 24h.";
  const receiptsError = state.errors.receipts;
  const receiptsPendingCount = state.receipts?.total ?? 0;
  const receiptsTotal = receiptsError ? null : receiptsPendingCount;
  const avgTicketLast7d = financial?.avg_ticket_last_7d.value ?? null;

  return (
    <section className="panel command-center">
      <div className="panel-heading">
        <h2>Command center</h2>
        <span className="badge muted">ação antes de análise</span>
      </div>
      <div className="command-center-grid">
        <CommandCenterCard
          title="Atenção agora"
          value={handoffOpenValue}
          tone={
            derived.hasOldOpenHandoff || derived.resolveCounts.leads > 0
              ? handoffOpenValue && handoffOpenValue > 0
                ? "danger"
                : "warning"
              : "ok"
          }
          description={
            handoffOpenValue && handoffOpenValue > 0
              ? "Leads esperando você assumir agora."
              : "Nenhum lead aguardando atendimento humano neste momento."
          }
          actionHref="/handoffs"
          actionLabel={handoffOpenValue && handoffOpenValue > 0 ? "Abrir handoffs" : "Ver handoffs"}
          chips={[
            derived.hasOldOpenHandoff ? { label: "handoff antigo", tone: "danger" } : null,
            humanInProgressValue && humanInProgressValue > 0
              ? { label: `${formatNumber(humanInProgressValue)} em atendimento humano`, tone: "warning" }
              : null,
            derived.resolveCounts.leads > 0
              ? { label: `${formatNumber(derived.resolveCounts.leads)} leads para revisar`, tone: "warning" }
              : { label: "fila sob controle", tone: "ok" },
          ]}
        />
        <CommandCenterCard
          title="Performance hoje"
          value={newTodayValue}
          tone={newTodayValue && newTodayValue > 0 ? "default" : "ok"}
          description={
            newTodayValue && newTodayValue > 0
              ? "Novos leads entraram hoje e já viraram operação."
              : "Nenhum lead novo hoje até agora."
          }
          actionHref="/conversas"
          actionLabel="Abrir conversas"
          chips={[
            {
              label: `${formatNumber(state.summary?.active_conversations?.value ?? derived.activeSampleCount)} ativas em 24h`,
            },
            {
              label: `${formatNumber(state.summary?.hot_leads_count?.value ?? 0)} leads quentes`,
            },
            (state.summary?.ready_for_human_count?.value ?? 0) > 0
              ? {
                  label: `${formatNumber(state.summary?.ready_for_human_count?.value ?? 0)} prontos para humano`,
                  tone: "warning",
                }
              : derived.stalledConversationCount > 0
                ? { label: `${formatNumber(derived.stalledConversationCount)} conversas paradas`, tone: "warning" }
                : { label: "sem conversas paradas", tone: "ok" },
          ]}
        />
        <CommandCenterCard
          title="Pipeline aberto"
          value={pipelineTotalRaw !== null ? formatCurrency(pipelineTotalRaw) : "—"}
          tone={divergenceValue > 0 ? "warning" : "default"}
          description={
            pipelineTotal !== null && pipelineTotal > 0
              ? "Valor esperado somado nas conversas ainda em aberto."
              : "Nenhum valor esperado registrado em conversas abertas."
          }
          actionHref="/financeiro"
          actionLabel="Abrir financeiro"
          chips={[
            { label: `NEG ${formatCurrency(pipelineByState.NEGOCIANDO ?? 0)}` },
            { label: `QUAL ${formatCurrency(pipelineByState.QUALIFICANDO ?? 0)}` },
            pipelineGrowthChip.label
              ? { label: pipelineGrowthChip.label, tone: pipelineGrowthChip.tone }
              : null,
            divergenceValue > 0
              ? { label: `divergência ${formatCurrency(divergenceValue)} em 7d`, tone: "warning" }
              : null,
          ]}
        />
        <CommandCenterCard
          title="Agenda próximos 14 dias"
          value={scheduleConfirmed}
          tone={scheduleSyncError > 0 ? "danger" : scheduleSyncPending > 0 ? "warning" : "default"}
          description={
            scheduleConfirmed > 0
              ? "Horários já confirmados com clientes nos próximos 14 dias."
              : "Nenhum horário confirmado ainda para os próximos 14 dias."
          }
          actionHref="/agenda"
          actionLabel="Abrir agenda"
          chips={[
            { label: `${formatNumber(scheduleTotalNext14d)} slots no total` },
            scheduleSyncError > 0
              ? { label: `${formatNumber(scheduleSyncError)} com erro de sync`, tone: "danger" }
              : scheduleSyncPending > 0
                ? { label: `${formatNumber(scheduleSyncPending)} sincronizando`, tone: "warning" }
                : { label: "calendar em dia", tone: "ok" },
          ]}
        />
        <CommandCenterCard
          title="Agente nas últimas 24h"
          value={agentExecutionCount ?? "—"}
          tone={agentOpsTone}
          description={agentOpsDescription}
          actionHref="/status"
          actionLabel="Abrir status"
          chips={[
            agentOpsError || agentOps === null
              ? { label: "sem leitura recente", tone: "warning" }
              : agentFailedCount > 0
                ? { label: `${formatNumber(agentFailedCount)} falhas/parciais`, tone: "danger" }
                : { label: "sem falhas", tone: "ok" },
            agentOpsError || agentOps === null
              ? null
              : agentFallbackCount > 0
                ? { label: `${formatNumber(agentFallbackCount)} fallback acionado`, tone: "warning" }
                : { label: "sem fallback", tone: "ok" },
            agentP95Label ? { label: `p95 ${agentP95Label}` } : { label: "p95 sem leitura" },
          ]}
        />
        <CommandCenterCard
          title="Comprovantes para revisar"
          value={receiptsTotal ?? "—"}
          tone={
            receiptsError
              ? "warning"
              : receiptsTotal && receiptsTotal >= 5
                ? "danger"
                : receiptsTotal && receiptsTotal > 0
                  ? "warning"
                  : "ok"
          }
          description={
            receiptsError
              ? "Sem leitura dos comprovantes para revisão."
              : receiptsTotal && receiptsTotal > 0
                ? "Comprovantes aguardando sua conferência antes de bater com o pipeline."
                : "Nenhum comprovante aguardando revisão."
          }
          actionHref="/comprovantes"
          actionLabel="Abrir comprovantes"
          chips={[
            divergenceValue > 0
              ? { label: `divergência ${formatCurrency(divergenceValue)} em 7d`, tone: "warning" }
              : receiptsError
                ? { label: "sem leitura financeira", tone: "warning" }
                : { label: "sem divergência em 7d", tone: "ok" },
            avgTicketLast7d !== null ? { label: `ticket médio ${formatCurrency(avgTicketLast7d)}` } : null,
            receiptsError
              ? null
              : receiptsTotal === 0
                ? { label: "sem pendências", tone: "ok" }
                : {
                    label: `${formatNumber(receiptsPendingCount)} aguardando revisão`,
                    tone: receiptsPendingCount >= 5 ? "danger" : "warning",
                  },
          ]}
        />
      </div>
    </section>
  );
}

function CommandCenterCard({
  title,
  value,
  description,
  tone = "default",
  actionHref,
  actionLabel,
  chips,
}: {
  title: string;
  value: number | string | null | undefined;
  description: string;
  tone?: "default" | "warning" | "danger" | "ok";
  actionHref: string;
  actionLabel: string;
  chips: Array<{ label: string; tone?: "default" | "warning" | "danger" | "ok" | undefined } | null>;
}) {
  const displayValue = typeof value === "string" ? value : formatNumber(value ?? 0);
  return (
    <article className={`command-card ${tone}`}>
      <span className="command-card-label">{title}</span>
      <span className="command-card-value">{displayValue}</span>
      <p className="command-card-description">{description}</p>
      <div className="command-card-chips">
        {chips.filter(Boolean).map((chip) => (
          <span key={chip?.label} className={`chip ${chip?.tone === "ok" ? "ok" : chip?.tone ?? ""}`.trim()}>
            {chip?.label}
          </span>
        ))}
      </div>
      <Link className="button command-card-action" href={actionHref}>
        {actionLabel}
      </Link>
    </article>
  );
}

function PriorityQueuePanel({
  items,
  visibleItems,
  selectedIndex,
  showAll,
  error,
  suppressError = false,
  onShowAll,
  onSelect,
}: {
  items: QueueListItem[];
  visibleItems: QueueListItem[];
  selectedIndex: number;
  showAll: boolean;
  error: BffFetchError | null;
  suppressError?: boolean;
  onShowAll: () => void;
  onSelect: (index: number) => void;
}) {
  const showError = error && !suppressError;

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Fila de prioridade</h2>
          <p className="section-subtitle">Leads ranqueados por urgência operacional. Use `j`, `k` e `Enter` para navegar.</p>
        </div>
        <span className="badge muted">{formatNumber(items.length)}</span>
      </div>
      {showError ? <div className="panel-notice">{error.message}</div> : null}
      {!showError && items.length === 0 ? (
        <EmptyState
          title="Fila limpa."
          description="O agente está dando conta de tudo. Você aparece aqui quando um lead realmente precisar de ação humana."
        />
      ) : null}
      {!showError && visibleItems.length > 0 ? (
        <>
          <ol className="priority-queue-list">
            {visibleItems.map((item, index) => (
              <QueueItemCard
                key={`${item.queue_key}:${item.conversation_id}`}
                item={item}
                isSelected={selectedIndex === index}
                onMouseEnter={() => onSelect(index)}
              />
            ))}
          </ol>
          {items.length > PRIORITY_QUEUE_DEFAULT_LIMIT ? (
            <div className="queue-footer">
              <button className="button secondary queue-toggle-button" type="button" onClick={onShowAll}>
                {showAll ? "Mostrar só o top 5" : `Ver toda a fila (${formatNumber(items.length)})`}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function QueueItemCard({
  item,
  isSelected,
  onMouseEnter,
}: {
  item: QueueListItem;
  isSelected: boolean;
  onMouseEnter: () => void;
}) {
  const tone = queueTone(item);
  return (
    <li>
      <article
        className={`priority-queue-item ${tone}${isSelected ? " selected" : ""}`}
        onMouseEnter={onMouseEnter}
      >
        <span className={`priority-badge ${priorityBadgeTone(item.queue_priority, tone)}`}>
          {item.queue_priority}
        </span>
        <div className="priority-main">
          <div className="priority-header">
            <div className="priority-identity">
              <h3>{item.client_display_name || item.client_identifier}</h3>
              <p>{queueReason(item.queue_key, item.reason)}</p>
            </div>
            <span className="priority-age" title={formatDateTime(item.relevant_at)}>
              há {formatRelativeSeconds(item.relevant_at)}
            </span>
          </div>
          <div className="priority-meta">
            <span className="chip warning">{queueLabel(item.queue_key, item.queue_label)}</span>
            <span className="chip">{conversationStateLabel(item.state)}</span>
            <span className={item.flow_type === "EXTERNAL" ? "chip warning" : "chip"}>
              {flowTypeLabel(item.flow_type)}
            </span>
            {item.handoff_status !== "NONE" ? (
              <span className="chip warning">{handoffStatusLabel(item.handoff_status)}</span>
            ) : null}
            {item.urgencyLabel ? <span className="chip warning">{item.urgencyLabel}</span> : null}
            {item.languageLabel ? <span className="chip">{item.languageLabel}</span> : null}
            {item.expectedAmountLabel ? <span className="chip">{item.expectedAmountLabel}</span> : null}
          </div>
          <div className="priority-footer">
            <p className="priority-next-step">
              <strong>Próximo passo:</strong> {item.nextBestAction}
            </p>
            <Link className="button priority-cta" href={item.drilldown_href}>
              Abrir conversa
            </Link>
          </div>
        </div>
      </article>
    </li>
  );
}

function ResolveNowPanel({
  tabs,
  activeTab,
  onChangeTab,
}: {
  tabs: ResolveTab[];
  activeTab: ResolveTabId;
  onChangeTab: (tab: ResolveTabId) => void;
}) {
  const currentTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const totalPending = tabs.reduce((acc, tab) => acc + tab.count, 0);

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Para resolver agora</h2>
          <p className="section-subtitle">Pendências agrupadas por tipo para reduzir ruído e concentrar decisão.</p>
        </div>
        <span className="badge muted">{formatNumber(totalPending)}</span>
      </div>
      {totalPending === 0 ? (
        <EmptyState
          title="Tudo em ordem por agora."
          description="Assim que surgir uma pendência de leads, agenda, materiais, pagamentos ou configuração, ela aparece aqui."
        />
      ) : (
        <>
          <div className="resolve-tabs" role="tablist" aria-label="Pendências por tipo">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={currentTab.id === tab.id}
                className={currentTab.id === tab.id ? "resolve-tab active" : "resolve-tab"}
                onClick={() => onChangeTab(tab.id)}
              >
                <span>{tab.label}</span>
                <span className={tab.count > 0 ? "badge warning" : "badge muted"}>{formatNumber(tab.count)}</span>
              </button>
            ))}
          </div>
          {currentTab.error ? <div className="panel-notice">{currentTab.error.message}</div> : null}
          {!currentTab.error && currentTab.count === 0 ? (
            <EmptyState
              title={currentTab.emptyTitle}
              description={currentTab.emptyDescription}
              actionHref={currentTab.emptyActionLabel ? currentTab.href : undefined}
              actionLabel={currentTab.emptyActionLabel}
            />
          ) : null}
          {!currentTab.error && currentTab.items.length > 0 ? (
            <div className="resolve-list">
              {currentTab.items.map((item) => (
                <PendingItem key={item.id} item={item} />
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function PendingItem({ item }: { item: PendingItemData }) {
  return (
    <article className={`pending-item ${item.tone ?? "default"}`}>
      <div className="pending-item-copy">
        <h3>{item.title}</h3>
        <p>{item.summary}</p>
        {item.meta && item.meta.length > 0 ? (
          <div className="priority-meta">
            {item.meta.map((meta) => (
              <span key={meta.label} className={`chip ${meta.tone ?? ""}`.trim()}>
                {meta.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <Link className="button pending-item-action" href={item.href}>
        {item.actionLabel}
      </Link>
    </article>
  );
}

function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="empty-state-card">
      <span className="empty-state-icon" aria-hidden="true" />
      <div className="empty-state-copy">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {actionHref && actionLabel ? (
        <Link className="button secondary empty-state-action" href={actionHref}>
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

function PerformanceInsightsSection({
  summary,
  handoffSummary,
}: {
  summary: DashboardSummaryRead | null;
  handoffSummary: HandoffSummaryRead | null;
}) {
  if (!summary) {
    return null;
  }

  const funnel = summary.conversation_funnel?.counts ?? {};
  const handoffReasons = Object.entries(handoffSummary?.reasons?.counts ?? {}).slice(0, 5);
  const handoffWeekTotal = handoffSummary?.reasons?.meta.sample_size ?? 0;
  const stats = buildPerformanceStats7d(summary);

  return (
    <section className="dashboard-columns performance-zone">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Performance</h2>
            <p className="section-subtitle">
              Últimos 7 dias: qualificação, leads prioritários e evolução do pipeline. Para o pulso de hoje, veja o Command center.
            </p>
          </div>
          <span className="badge muted">últimos 7 dias</span>
        </div>
        <div className="performance-strip">
          {stats.map((stat) => (
            <PerformanceStat
              key={stat.label}
              label={stat.label}
              value={stat.value}
              detail={stat.detail}
              tone={stat.tone}
            />
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Funil e handoffs</h2>
            <p className="section-subtitle">Distribuição de leads por estágio e principais motivos de escalada nos últimos 7 dias.</p>
          </div>
          <span className="badge muted">{formatNumber(handoffWeekTotal)} handoffs 7d</span>
        </div>
        <div className="funnel-grid">
          <FunnelStage label="Novo" value={funnel.NOVO ?? 0} />
          <FunnelStage label="Qualificando" value={funnel.QUALIFICANDO ?? 0} />
          <FunnelStage label="Negociando" value={funnel.NEGOCIANDO ?? 0} />
          <FunnelStage label="Pronto p/ humano" value={funnel.PRONTO_PARA_HUMANO ?? 0} highlight />
          <FunnelStage label="Confirmado" value={funnel.CONFIRMADO ?? 0} />
        </div>
        <div className="stack-md">
          {handoffReasons.length > 0 ? (
            <div className="stack-sm">
              <h3>Razões de handoff</h3>
              <div className="bar-list">
                {handoffReasons.map(([reason, value]) => (
                  <div className="bar-row" key={reason}>
                    <span className="bar-label">{handoffReasonLabel(reason) ?? reason}</span>
                    <span className="bar-track" aria-hidden="true">
                      <span
                        className="bar-fill"
                        style={{
                          width: `${Math.max(
                            4,
                            Math.round((value / Math.max(1, handoffSummary?.reasons?.meta.sample_size ?? 1)) * 100),
                          )}%`,
                        }}
                      />
                    </span>
                    <span className="bar-value">{formatNumber(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title="Ainda coletando dados."
              description="Precisamos de eventos de handoff para mostrar os principais motivos de escalada."
            />
          )}
        </div>
      </section>
    </section>
  );
}

function PerformanceStat({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "warning" | "danger" | "ok";
}) {
  return (
    <article className={`performance-stat ${tone}`}>
      <span className="performance-stat-label">{label}</span>
      <strong className="performance-stat-value">{value}</strong>
      <p className="performance-stat-detail">{detail}</p>
    </article>
  );
}

function buildPerformanceStats7d(
  summary: DashboardSummaryRead,
): Array<{ label: string; value: string; detail: string; tone?: "default" | "warning" | "danger" | "ok" }> {
  const qualificationSample = summary.qualification_rate?.meta.sample_size ?? 0;
  const qualificationValue = summary.qualification_rate?.value ?? 0;
  const hotLeads = summary.hot_leads_count?.value ?? 0;
  const stalled = summary.stalled_conversations_count?.value ?? 0;
  const growth = summary.financial?.pipeline_growth;
  const growthDelta = growth?.delta_percent ?? null;
  const growthValue =
    growthDelta === null
      ? "—"
      : `${growthDelta >= 0 ? "+" : ""}${formatNumber(growthDelta)}%`;
  const growthTone: "default" | "warning" | "danger" | "ok" =
    growthDelta === null
      ? "default"
      : growthDelta >= 10
        ? "ok"
        : growthDelta <= -10
          ? "danger"
          : growthDelta < 0
            ? "warning"
            : "default";

  return [
    {
      label: "Taxa de qualificação",
      value: qualificationSample > 0 ? `${formatNumber(qualificationValue)}%` : "—",
      detail:
        qualificationSample > 0
          ? `${formatNumber(qualificationSample)} leads criados em 7 dias`
          : "sem base suficiente de leads novos",
    },
    {
      label: "Leads quentes",
      value: formatNumber(hotLeads),
      detail: hotLeads > 0 ? "com sinais fortes de fechamento" : "sem leads quentes no momento",
      tone: hotLeads > 0 ? "ok" : "default",
    },
    {
      label: "Conversas paradas",
      value: formatNumber(stalled),
      detail: stalled > 0 ? "sem movimento há mais de 48h" : "nenhuma conversa parada",
      tone: stalled > 0 ? "warning" : "ok",
    },
    {
      label: "Crescimento do pipeline",
      value: growthValue,
      detail:
        growthDelta === null
          ? "sem base para comparar semanas"
          : growthDelta >= 0
            ? "7d vs 7d anteriores"
            : "queda vs 7d anteriores",
      tone: growthTone,
    },
  ];
}

function FunnelStage({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <article className={highlight ? "funnel-stage highlight" : "funnel-stage"}>
      <span className="funnel-stage-label">{label}</span>
      <strong className="funnel-stage-value">{formatNumber(value)}</strong>
    </article>
  );
}

function ConversationBreakdownPanel({
  summary,
  conversations,
  error,
  suppressError = false,
}: {
  summary: DashboardSummaryRead | null;
  conversations: Envelope<ConversationRead> | null;
  error: BffFetchError | null;
  suppressError?: boolean;
}) {
  if (summary) {
    const total = summary.total_conversations?.value ?? 0;
    if (total === 0) {
      return (
        <EmptyPanel
          title="Como estão as conversas"
          message="Nenhuma conversa registrada ainda."
          href="/conversas"
        />
      );
    }
    return (
      <section className="panel">
        <div className="panel-heading">
          <h2>Como estão as conversas</h2>
        </div>
        <div className="stack-md">
          <CountBars
            title="Distribuição por estado"
            labels={STATE_LABELS}
            formatLabel={(l) => conversationStateLabel(l as ConversationState)}
            counts={summary.conversations_by_state?.counts ?? {}}
            total={total}
          />
          <CountBars
            title="Distribuição por tipo de atendimento"
            labels={FLOW_LABELS}
            formatLabel={(l) => flowTypeLabel(l as FlowType)}
            counts={summary.conversations_by_flow_type?.counts ?? {}}
            total={total}
          />
          <CountBars
            title="Por quem está atendendo"
            labels={HANDOFF_LABELS}
            formatLabel={(l) => handoffStatusLabel(l as HandoffStatus)}
            counts={summary.conversations_by_handoff_status?.counts ?? {}}
            total={total}
          />
        </div>
        <div className="link-strip">
        <Link className="link-pill" href="/conversas">
          Abrir conversas
        </Link>
        <Link className="link-pill" href="/handoffs">
          Ver atendimento humano
        </Link>
      </div>
    </section>
  );
}
  if (error && !suppressError) {
    return <ErrorPanel title="Como estão as conversas" error={error} />;
  }
  const items = conversations?.items ?? [];
  if (items.length === 0) {
    return (
      <EmptyPanel
        title="Como estão as conversas"
        message="Nenhuma conversa carregada."
        href="/conversas"
      />
    );
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Como estão as conversas</h2>
        <span className="badge muted">amostra das últimas {items.length}</span>
      </div>
      <div className="stack-md">
        <CountBars
          title="Distribuição por estado"
          labels={STATE_LABELS}
          formatLabel={(l) => conversationStateLabel(l as ConversationState)}
          counts={countBy(items, (conversation) => conversation.state)}
          total={items.length}
        />
        <CountBars
          title="Distribuição por tipo de atendimento"
          labels={FLOW_LABELS}
          formatLabel={(l) => flowTypeLabel(l as FlowType)}
          counts={countBy(items, (conversation) => conversation.flow_type)}
          total={items.length}
        />
        <CountBars
          title="Por quem está atendendo"
          labels={HANDOFF_LABELS}
          formatLabel={(l) => handoffStatusLabel(l as HandoffStatus)}
          counts={countBy(items, (conversation) => conversation.handoff_status)}
          total={items.length}
        />
      </div>
      <div className="link-strip">
        <Link className="link-pill" href="/conversas">
          Abrir conversas
        </Link>
        <Link className="link-pill" href="/handoffs">
          Ver atendimento humano
        </Link>
      </div>
    </section>
  );
}

function CountBars<K extends string>({
  title,
  labels,
  counts,
  total,
  formatLabel,
}: {
  title: string;
  labels: readonly K[];
  counts: Record<string, number>;
  total: number;
  formatLabel?: (label: string) => string;
}) {
  return (
    <div>
      <h3>{title}</h3>
      <div className="bar-list">
        {labels.map((label) => {
          const value = counts[label] ?? 0;
          const width = total > 0 ? `${(value / total) * 100}%` : "0%";
          const display = formatLabel ? formatLabel(label) : label;
          return (
            <div className="bar-row" key={label}>
              <span className="bar-label">{display}</span>
              <span className="bar-track" aria-hidden="true">
                <span className="bar-fill" style={{ width }} />
              </span>
              <span className="bar-value">
                {formatNumber(value)} / {formatNumber(total)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HandoffSummaryPanel({
  summary,
  error,
  suppressError = false,
}: {
  summary: HandoffSummaryRead | null;
  error: BffFetchError | null;
  suppressError?: boolean;
}) {
  if (error && !suppressError) {
    return <ErrorPanel title="Atendimento humano (últimos 7 dias)" error={error} />;
  }
  if (!summary) {
    return (
      <EmptyPanel
        title="Atendimento humano (últimos 7 dias)"
        message="Sem dados de atendimento humano agora."
        href="/handoffs"
      />
    );
  }

  const reasonEntries = Object.entries(summary.reasons?.counts ?? {}).slice(0, 4);
  const currentByStatus = summary.current_by_status?.counts ?? {};
  const openAgeBuckets = summary.open_age_buckets?.counts ?? {};
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Atendimento humano (últimos 7 dias)</h2>
        <Link className="link-pill" href="/handoffs">
          Ver atendimento humano
        </Link>
      </div>
      <div className="stack-md">
        <table className="data-table" aria-label="Resumo de atendimento humano">
          <tbody>
            <tr>
              <td>Aguardando assumir agora</td>
              <td className="numeric">{formatNumber(currentByStatus.OPENED ?? 0)}</td>
            </tr>
            <tr>
              <td>Em atendimento humano agora</td>
              <td className="numeric">{formatNumber(currentByStatus.ACKNOWLEDGED ?? 0)}</td>
            </tr>
            <tr>
              <td>Esperando há 1–4h</td>
              <td className="numeric">{formatNumber(openAgeBuckets["1-4h"] ?? 0)}</td>
            </tr>
            <tr>
              <td>Esperando há mais de 4h</td>
              <td className={openAgeBuckets["4h+"] ? "numeric warning-cell" : "numeric"}>
                {formatNumber(openAgeBuckets["4h+"] ?? 0)}
              </td>
            </tr>
            <tr>
              <td>Tempo médio até assumir</td>
              <td className="numeric">{formatDurationSeconds(summary.time_to_acknowledge?.average_seconds)}</td>
            </tr>
            <tr>
              <td>Tempo médio até devolver ao agente</td>
              <td className="numeric">{formatDurationSeconds(summary.time_to_release?.average_seconds)}</td>
            </tr>
          </tbody>
        </table>
        {reasonEntries.length > 0 ? (
          <div className="stack-sm">
            <h3>Por que o agente transferiu</h3>
            {reasonEntries.map(([reason, value]) => (
              <div className="bar-row" key={reason}>
                <span className="bar-label">{handoffReasonLabel(reason) ?? reason}</span>
                <span className="bar-track" aria-hidden="true">
                  <span
                    className="bar-fill"
                    style={{ width: `${Math.max(4, Math.round((value / Math.max(1, summary.reasons?.meta.sample_size ?? 1)) * 100))}%` }}
                  />
                </span>
                <span className="bar-value">{formatNumber(value)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">Nenhum atendimento humano na semana.</p>
        )}
      </div>
    </section>
  );
}

function ScheduleSummaryPanel({
  summary,
  slots,
  error,
  syncPendingCount,
  syncErrorCount,
  suppressError = false,
}: {
  summary: DashboardSummaryRead | null;
  slots: Envelope<ScheduleSlotRead> | null;
  error: BffFetchError | null;
  syncPendingCount: number;
  syncErrorCount: number;
  suppressError?: boolean;
}) {
  if (summary) {
    const statusCounts = summary.schedule_slots_next_14d_by_status?.counts ?? {};
    const totalSlots = summary.schedule_slots_next_14d_total?.value ?? 0;
    const syncPending = summary.calendar_sync_pending?.value ?? syncPendingCount;
    const syncError = summary.calendar_sync_error?.value ?? syncErrorCount;
    return (
      <section className="panel">
        <div className="panel-heading">
          <h2>Agenda dos próximos 14 dias</h2>
          <Link className="link-pill" href="/agenda">
            Abrir agenda
          </Link>
        </div>
        <div className="stack-md">
          <table className="data-table" aria-label="Resumo da agenda">
            <tbody>
              <tr>
                <td>Total de horários</td>
                <td className="numeric">{formatNumber(totalSlots)}</td>
              </tr>
              {SCHEDULE_STATUS_LABELS.map((label) => (
                <tr key={label}>
                  <td>{scheduleSlotLabel(label)}</td>
                  <td className="numeric">{formatNumber(statusCounts[label] ?? 0)}</td>
                </tr>
              ))}
              <tr>
                <td>Sincronizando com Google Calendar</td>
                <td className={syncPending > 0 ? "numeric warning-cell" : "numeric muted-cell"}>
                  {formatNumber(syncPending)}
                </td>
              </tr>
              <tr>
                <td>Com erro de sincronização</td>
                <td className={syncError > 0 ? "numeric danger-cell" : "numeric muted-cell"}>
                  {formatNumber(syncError)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    );
  }
  if (error && !suppressError) {
    return <ErrorPanel title="Agenda dos próximos 14 dias" error={error} />;
  }
  const items = slots?.items ?? [];
  const statusCounts = countBy(items, (slot) => slot.status);

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Agenda dos próximos 14 dias</h2>
        <Link className="link-pill" href="/agenda">
          Abrir agenda
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="empty-state">Nenhum horário cadastrado para os próximos 14 dias.</p>
      ) : (
        <div className="stack-md">
          <table className="data-table" aria-label="Resumo da agenda">
            <tbody>
              <tr>
                <td>Total de horários</td>
                <td className="numeric">{formatNumber(slots?.total ?? items.length)}</td>
              </tr>
              {SCHEDULE_STATUS_LABELS.map((label) => (
                <tr key={label}>
                  <td>{scheduleSlotLabel(label)}</td>
                  <td className="numeric">{formatNumber(statusCounts[label] ?? 0)}</td>
                </tr>
              ))}
              <tr>
                <td>Sincronizando com Google Calendar</td>
                <td className={syncPendingCount > 0 ? "numeric warning-cell" : "numeric muted-cell"}>
                  {formatNumber(syncPendingCount)}
                </td>
              </tr>
              <tr>
                <td>Com erro de sincronização</td>
                <td className={syncErrorCount > 0 ? "numeric danger-cell" : "numeric muted-cell"}>
                  {formatNumber(syncErrorCount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MediaSummaryPanel({
  summary,
  media,
  error,
  suppressError = false,
}: {
  summary: DashboardSummaryRead | null;
  media: Envelope<MediaRead> | null;
  error: BffFetchError | null;
  suppressError?: boolean;
}) {
  if (summary) {
    const active = summary.media_active?.value ?? 0;
    return (
      <section className="panel">
        <div className="panel-heading">
          <h2>Materiais</h2>
          <Link className="link-pill" href="/midias">
            Abrir materiais
          </Link>
        </div>
        <div className="stack-md">
          <table className="data-table" aria-label="Resumo de mídias">
            <tbody>
              <tr>
                <td>Materiais ativos</td>
                <td className="numeric">{formatNumber(active)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    );
  }
  if (error && !suppressError) {
    return <ErrorPanel title="Materiais" error={error} />;
  }
  const items = media?.items ?? [];
  const active = items.filter((item) => item.is_active).length;

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Materiais</h2>
        <Link className="link-pill" href="/midias">
          Abrir materiais
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="empty-state">Nenhum material cadastrado.</p>
      ) : (
        <div className="stack-md">
          <table className="data-table" aria-label="Materiais por situação">
            <tbody>
              <tr>
                <td>Ativos</td>
                <td className="numeric">{formatNumber(active)}</td>
              </tr>
              <tr>
                <td>Inativos</td>
                <td className="numeric">{formatNumber(items.length - active)}</td>
              </tr>
              <tr>
                <td>Total carregado</td>
                <td className="numeric">{formatNumber(items.length)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EscortPendenciesPanel({
  escort,
  error,
  suppressError = false,
}: {
  escort: EscortRead | null;
  error: BffFetchError | null;
  suppressError?: boolean;
}) {
  if (error && error.status !== 404 && !suppressError) {
    return <ErrorPanel title="Dados da acompanhante" error={error} />;
  }
  if (!escort) {
    return (
      <section className="panel">
        <div className="panel-heading">
          <h2>Dados da acompanhante</h2>
          <span className="badge warning">Sem cadastro</span>
        </div>
        <p className="empty-state">
          Nenhuma acompanhante cadastrada ainda. Sem isso o agente não responde e a agenda fica parada.
        </p>
        <div className="link-strip">
          <Link className="link-pill" href="/acompanhantes">
            Cadastrar acompanhante
          </Link>
        </div>
      </section>
    );
  }
  const pendencies = detectEscortPendencies(escort);
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Dados da acompanhante</h2>
        <Link className="link-pill" href="/acompanhantes">
          Ver acompanhantes
        </Link>
      </div>
      <dl className="kv-list">
        <div>
          <dt>Acompanhante</dt>
          <dd>{escort.display_name}</dd>
        </div>
        <div>
          <dt>Google Calendar</dt>
          <dd>{escort.calendar_external_id || "—"}</dd>
        </div>
        <div>
          <dt>Idiomas</dt>
          <dd>{escort.languages?.length ? escort.languages.join(", ") : "—"}</dd>
        </div>
      </dl>
      <h3 style={{ marginTop: 14 }}>Pendências</h3>
      {pendencies.length === 0 ? (
        <p className="empty-state">Tudo preenchido.</p>
      ) : (
        <ul className="stack-sm" aria-label="Pendências">
          {pendencies.map((pendency) => (
            <li key={`${pendency.kind}:${pendency.path}`}>
              <span className="chip warning">{escortPendencyKindLabel(pendency.kind)}</span>
              <span className="muted-cell">{pendency.label}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyPanel({
  title,
  message,
  href,
}: {
  title: string;
  message: string;
  href: string;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <Link className="button secondary empty-panel-action" href={href}>
          Abrir
        </Link>
      </div>
      <EmptyState title={title} description={message} />
    </section>
  );
}

function ErrorPanel({ title, error }: { title: string; error: BffFetchError }) {
  return (
    <section className="panel error-panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <span className="badge danger">Erro</span>
      </div>
      <p>{error.message}</p>
    </section>
  );
}

function deriveDashboard(state: DashboardState) {
  const conversationItems = state.conversations?.items ?? [];
  const slotItems = state.slots?.items ?? [];
  const mediaItems = state.media?.items ?? [];
  const openHandoffs = state.handoffsOpen?.items ?? [];
  const escortPendencies = state.escort ? detectEscortPendencies(state.escort) : [];
  const leadItems = buildLeadPendingItems(state);
  const paymentItems = buildPaymentPendingItems(state);
  const agendaItems = buildAgendaPendingItems(state);
  const mediaPendingItems = buildMediaPendingItems(state);
  const conversationMap = new Map(conversationItems.map((conversation) => [conversation.id, conversation]));
  return {
    conversationSampleSize: conversationItems.length,
    activeSampleCount: conversationItems.filter(isActiveInLast24h).length,
    stateCounts: countBy(conversationItems, (conversation) => conversation.state),
    flowCounts: countBy(conversationItems, (conversation) => conversation.flow_type),
    mediaCounts: countBy(mediaItems, (item) => (item.is_active ? "ACTIVE" : "INACTIVE")),
    escortPendencies,
    stalledConversationCount: conversationItems.filter(isStalledConversation).length,
    priorityQueueItems: (state.queues?.items ?? []).map((item) =>
      decorateQueueItem(item, conversationMap.get(item.conversation_id)),
    ),
    resolveCounts: {
      leads: leadItems.length,
      config: state.escort ? escortPendencies.length : 1,
      payments: paymentItems.length,
      agenda: agendaItems.length,
      media: mediaPendingItems.length,
    },
    syncPendingCount:
      state.summary?.calendar_sync_pending?.value ??
      slotItems.filter((slot) => slot.calendar_sync_status === "PENDING").length,
    syncErrorCount:
      state.summary?.calendar_sync_error?.value ??
      slotItems.filter((slot) => slot.calendar_sync_status === "ERROR").length,
    hasOldOpenHandoff: openHandoffs.some(isOldHandoff),
  };
}

function metricValueFromEnvelope<T>(
  envelope: Envelope<T> | null,
  error: BffFetchError | null,
): number | null {
  if (error) {
    return null;
  }
  return envelope?.total ?? null;
}

function detectBffOutage(errors: DashboardState["errors"]): BffFetchError | null {
  return Object.values(errors).find((error) => error?.status === 0) ?? null;
}

function handoffStatusValue(
  summary: HandoffSummaryRead | null,
  status: HandoffStatus,
): number | null {
  return summary?.current_by_status?.counts[status] ?? null;
}

function buildResolveTabs(state: DashboardState): ResolveTab[] {
  const leadItems = buildLeadPendingItems(state);
  const configItems = buildConfigPendingItems(state);
  const paymentItems = buildPaymentPendingItems(state);
  const agendaItems = buildAgendaPendingItems(state);
  const mediaItems = buildMediaPendingItems(state);
  const configError = state.errors.escort && state.errors.escort.status !== 404 ? state.errors.escort : null;

  return [
    {
      id: "config",
      label: "Configuração",
      href: "/acompanhantes",
      emptyTitle: state.escort ? "Acompanhante configurada." : "Nenhuma acompanhante cadastrada ainda.",
      emptyDescription: state.escort
        ? "Todos os campos principais da acompanhante estão preenchidos."
        : "Sem uma acompanhante configurada, o sistema não responde nem agenda horários.",
      emptyActionLabel: state.escort ? "Revisar configurações" : "Cadastrar acompanhante",
      count: configItems.length,
      items: configItems.slice(0, ATTENTION_LIMIT),
      error: configError,
    },
    {
      id: "leads",
      label: "Leads",
      href: "/conversas",
      emptyTitle: "Nenhum lead te esperando.",
      emptyDescription: "Assim que um lead pedir atendimento humano ou travar, ele aparece aqui.",
      emptyActionLabel: "Ver conversas ativas",
      count: leadItems.length,
      items: leadItems.slice(0, ATTENTION_LIMIT),
      error: state.errors.conversations ?? state.errors.handoffsOpen ?? state.errors.handoffsAck,
    },
    {
      id: "payments",
      label: "Pagamentos",
      href: "/comprovantes",
      emptyTitle: "Nenhum pagamento para revisar.",
      emptyDescription: "Comprovantes com divergência ou necessidade de conferência aparecem aqui.",
      count: paymentItems.length,
      items: paymentItems.slice(0, ATTENTION_LIMIT),
      error: state.errors.receipts,
    },
    {
      id: "agenda",
      label: "Agenda",
      href: "/agenda",
      emptyTitle: "Agenda sincronizada.",
      emptyDescription: "Sem erros de Google Calendar relevantes nos próximos ciclos.",
      count: agendaItems.length,
      items: agendaItems.slice(0, ATTENTION_LIMIT),
      error: state.errors.slots,
    },
    {
      id: "media",
      label: "Materiais",
      href: "/midias",
      emptyTitle: "Nada pendente aqui.",
      emptyDescription: "Materiais novos caem aqui antes de seguir para o agente.",
      emptyActionLabel: "Abrir materiais",
      count: mediaItems.length,
      items: mediaItems.slice(0, ATTENTION_LIMIT),
      error: state.errors.media,
    },
  ];
}

function pickDefaultResolveTab(tabs: ResolveTab[]): ResolveTabId {
  const priority: Record<ResolveTabId, number> = {
    config: 0,
    leads: 1,
    payments: 2,
    agenda: 3,
    media: 4,
  };

  const ranked = tabs
    .slice()
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return priority[a.id] - priority[b.id];
    });

  return ranked[0]?.id ?? "config";
}

function buildLeadPendingItems(state: DashboardState): PendingItemData[] {
  const items = new Map<string, PendingItemData>();
  const conversations = state.conversations?.items ?? [];

  for (const conversation of state.handoffsOpen?.items ?? []) {
    items.set(
      conversation.id,
      buildConversationPendingItem(conversation, {
        tone: isOldHandoff(conversation) ? "danger" : "warning",
        summary: "Transferido para atendimento humano e ainda sem dono.",
        context: isOldHandoff(conversation) ? "handoff antigo" : "handoff aberto",
      }),
    );
  }

  for (const conversation of state.handoffsAck?.items ?? []) {
    if (!isOldHandoff(conversation) || items.has(conversation.id)) {
      continue;
    }
    items.set(
      conversation.id,
      buildConversationPendingItem(conversation, {
        tone: "warning",
        summary: "Já está em atendimento humano, mas ficou sem resposta por mais de 30 minutos.",
        context: "humano parado",
      }),
    );
  }

  for (const conversation of conversations) {
    if (items.has(conversation.id)) {
      continue;
    }
    if (conversation.awaiting_client_decision) {
      items.set(
        conversation.id,
        buildConversationPendingItem(conversation, {
          tone: "warning",
          summary: "O lead está esperando sua resposta para seguir no funil.",
          context: "aguarda resposta",
        }),
      );
      continue;
    }
    if (isStalledConversation(conversation)) {
      items.set(
        conversation.id,
        buildConversationPendingItem(conversation, {
          tone: "warning",
          summary: "Conversa parada há mais de 48 horas sem avanço claro.",
          context: "conversa parada",
        }),
      );
      continue;
    }
    if (isUndeterminedFlowConversation(conversation)) {
      items.set(
        conversation.id,
        buildConversationPendingItem(conversation, {
          tone: "warning",
          summary: "Lead sem classificação definida há mais de 1 hora.",
          context: "sem classificação",
        }),
      );
    }
  }

  return Array.from(items.values());
}

function buildConfigPendingItems(state: DashboardState): PendingItemData[] {
  if (!state.escort) {
    return [
      {
        id: "missing-escort",
        title: "Nenhuma acompanhante cadastrada",
        summary: "Sem uma acompanhante configurada, o agente não responde nem agenda horários.",
        href: "/acompanhantes",
        actionLabel: "Cadastrar acompanhante",
        tone: "danger",
        meta: [{ label: "bloqueante", tone: "danger" }],
      },
    ];
  }

  return detectEscortPendencies(state.escort).map((pendency) => ({
    id: `${pendency.kind}:${pendency.path}`,
    title: pendency.label,
    summary: "Preencha este campo para a operação rodar sem atrito.",
    href: "/acompanhantes",
    actionLabel: "Configurar acompanhante",
    tone: "warning",
    meta: [{ label: escortPendencyKindLabel(pendency.kind), tone: "warning" }],
  }));
}

function buildAgendaPendingItems(state: DashboardState): PendingItemData[] {
  const items = new Map<string, PendingItemData>();

  for (const slot of state.slots?.items ?? []) {
    if (slot.calendar_sync_status === "ERROR") {
      items.set(slot.id, {
        id: slot.id,
        title: `Horário ${formatDateTime(slot.starts_at)}`,
        summary: slot.last_sync_error || "Este horário falhou ao sincronizar com o Google Calendar.",
        href: "/agenda",
        actionLabel: "Revisar agenda",
        tone: "danger",
        meta: [
          { label: scheduleSlotLabel(slot.status) },
          { label: "erro de sync", tone: "danger" },
        ],
      });
      continue;
    }

    if (slot.calendar_sync_status === "PENDING" && isPendingSyncTooLong(slot)) {
      items.set(slot.id, {
        id: slot.id,
        title: `Horário ${formatDateTime(slot.starts_at)}`,
        summary: "Ainda aguardando sincronização com o Google Calendar além do tempo esperado.",
        href: "/agenda",
        actionLabel: "Abrir agenda",
        tone: "warning",
        meta: [
          { label: scheduleSlotLabel(slot.status) },
          { label: "sync pendente", tone: "warning" },
        ],
      });
    }
  }

  return Array.from(items.values());
}

function buildMediaPendingItems(_state: DashboardState): PendingItemData[] {
  return [];
}

function buildPaymentPendingItems(state: DashboardState): PendingItemData[] {
  return (state.receipts?.items ?? []).map((receipt) => {
    const clientName = receipt.client.display_name || receipt.client.whatsapp_jid;
    return {
      id: receipt.id,
      title: clientName,
      summary:
        receipt.expected_amount && receipt.detected_amount && receipt.expected_amount !== receipt.detected_amount
          ? "Valor detectado diferente do valor esperado no comprovante."
          : "Comprovante aguardando conferência manual.",
      href: receipt.drilldown_href,
      actionLabel: "Revisar pagamento",
      tone: "warning",
      meta: [
        receipt.expected_amount ? { label: `esperado ${formatCurrency(receipt.expected_amount)}` } : null,
        receipt.detected_amount ? { label: `detectado ${formatCurrency(receipt.detected_amount)}` } : null,
      ].filter(Boolean) as PendingMeta[],
    };
  });
}

function buildConversationPendingItem(
  conversation: ConversationRead,
  {
    tone,
    summary,
    context,
  }: {
    tone: PendingTone;
    summary: string;
    context: string;
  },
): PendingItemData {
  const clientName = conversation.client.display_name || conversation.client.whatsapp_jid;
  const meta: PendingMeta[] = [
    { label: context, tone },
    { label: conversationStateLabel(conversation.state) },
    {
      label: flowTypeLabel(conversation.flow_type),
      tone: conversation.flow_type === "EXTERNAL" ? "warning" : "default",
    },
  ];

  const urgencyLabel = urgencyProfileLabel(conversation.urgency_profile);
  if (urgencyLabel) {
    meta.push({ label: urgencyLabel, tone: "warning" });
  }
  if (conversation.expected_amount) {
    meta.push({ label: formatCurrency(conversation.expected_amount) });
  }
  if (conversation.last_message_at) {
    meta.push({ label: `há ${formatRelativeSeconds(conversation.last_message_at)}` });
  }

  return {
    id: conversation.id,
    title: clientName,
    summary: conversation.summary ? truncate(conversation.summary, 120) : summary,
    href: `/conversas/${conversation.id}`,
    actionLabel: "Abrir conversa",
    tone,
    meta,
  };
}

function decorateQueueItem(
  item: ConversationQueueItemRead,
  conversation: ConversationRead | undefined,
): QueueListItem {
  const amount = item.expected_amount ?? conversation?.expected_amount ?? null;
  return {
    ...item,
    nextBestAction: queueNextBestAction(item, conversation),
    expectedAmountLabel: amount ? formatCurrency(amount) : null,
    urgencyLabel: urgencyProfileLabel(conversation?.urgency_profile),
    languageLabel: conversation?.client.language_hint ? `idioma ${conversation.client.language_hint}` : null,
  };
}

function queueNextBestAction(
  item: ConversationQueueItemRead,
  conversation: ConversationRead | undefined,
): string {
  if (item.next_best_action) {
    return truncate(item.next_best_action, 88);
  }
  if (conversation?.pending_action) {
    return truncate(conversation.pending_action, 88);
  }
  switch (item.queue_key) {
    case "OPEN_HANDOFF":
    case "EXTERNAL_OPEN_HANDOFF":
      return "Assumir o atendimento humano e responder o lead.";
    case "ACKNOWLEDGED_HANDOFF":
      return "Retomar a conversa humana e registrar o próximo passo.";
    case "CLIENT_WAITING_RESPONSE":
    case "AWAITING_CLIENT_DECISION":
    case "NEGOTIATING_AWAITING_INPUT":
      return "Responder a última mensagem e destravar a negociação.";
    case "UNDETERMINED_AGED":
      return "Classificar o lead e definir o fluxo de atendimento.";
    case "STALE_CONVERSATION":
      return "Reaquecer a conversa e validar se ainda existe interesse.";
    default:
      return "Abrir a conversa e revisar o contexto antes do próximo passo.";
  }
}

function priorityBadgeTone(rank: number, tone: string): string {
  if (tone === "danger" || rank <= 3) {
    return "danger";
  }
  if (tone === "warning" || rank <= 7) {
    return "warning";
  }
  return "default";
}

function shouldIgnoreQueueShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("input, textarea, select, button, a, [contenteditable='true']"));
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

function formatDurationMs(value: number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }
  return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}s`;
}

function countBy<T, K extends string>(items: T[], key: (item: T) => K): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function sortByOldestLastMessage(items: ConversationRead[]): ConversationRead[] {
  return items
    .slice()
    .sort((a, b) => lastMessageTimestamp(a) - lastMessageTimestamp(b));
}

function lastMessageTimestamp(conversation: ConversationRead): number {
  if (!conversation.last_message_at) {
    return 0;
  }
  const timestamp = new Date(conversation.last_message_at).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function isActiveInLast24h(conversation: ConversationRead): boolean {
  const timestamp = lastMessageTimestamp(conversation);
  return timestamp > 0 && Date.now() - timestamp <= 24 * 60 * 60 * 1000;
}

function isStalledConversation(conversation: ConversationRead): boolean {
  const timestamp = lastMessageTimestamp(conversation);
  if (timestamp === 0 || conversation.state === "CONFIRMADO") {
    return false;
  }
  return Date.now() - timestamp > STALLED_CONVERSATION_HOURS * 60 * 60 * 1000;
}

function isUndeterminedFlowConversation(conversation: ConversationRead): boolean {
  const timestamp = lastMessageTimestamp(conversation);
  if (timestamp === 0 || conversation.flow_type !== "UNDETERMINED") {
    return false;
  }
  return Date.now() - timestamp > UNDETERMINED_FLOW_HOURS * 60 * 60 * 1000;
}

function isPendingSyncTooLong(slot: ScheduleSlotRead): boolean {
  const reference = slot.last_synced_at ?? slot.starts_at;
  const timestamp = new Date(reference).getTime();
  if (Number.isNaN(timestamp)) {
    return true;
  }
  return Date.now() - timestamp > PENDING_SYNC_MINUTES * 60 * 1000;
}

function isOldHandoff(conversation: ConversationRead): boolean {
  const timestamp = handoffTimestamp(conversation);
  if (timestamp === 0) {
    return true;
  }
  return Date.now() - timestamp > OLD_HANDOFF_MINUTES * 60 * 1000;
}

function handoffAgeTimestamp(conversation: ConversationRead): string | null {
  if (conversation.handoff_status === "OPENED" || conversation.handoff_status === "ACKNOWLEDGED") {
    return conversation.last_handoff_at ?? conversation.last_message_at;
  }
  return conversation.last_message_at;
}

function handoffTimestamp(conversation: ConversationRead): number {
  const value = handoffAgeTimestamp(conversation);
  if (!value) {
    return 0;
  }
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}...`;
}
