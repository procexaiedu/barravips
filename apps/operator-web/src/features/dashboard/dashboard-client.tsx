"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AgentOpsSummaryRead,
  ConversationQueueItemRead,
  ConversationRead,
  ConversationState,
  DashboardSummaryRead,
  FlowType,
  HandoffSummaryRead,
  HandoffStatus,
  MediaApprovalStatus,
  MediaRead,
  ModelRead,
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
  clientStatusLabel,
  conversationStateLabel,
  flowTypeLabel,
  handoffReasonLabel,
  handoffStatusLabel,
  mediaApprovalLabel,
  mediaTypeLabel,
  modelPendencyKindLabel,
  queueLabel,
  queueReason,
  scheduleSlotLabel,
  urgencyProfileLabel,
} from "@/features/shared/labels";
import { detectModelPendencies } from "@/features/shared/pending";

const POLL_INTERVAL_MS = 15_000;
const DASHBOARD_WINDOW_DAYS = 14;
const SAMPLE_PAGE_SIZE = 100;
const ATTENTION_PAGE_SIZE = 10;
const ATTENTION_LIMIT = 5;
const OLD_HANDOFF_MINUTES = 30;

type Envelope<T> = PaginatedEnvelope<T>;

type DashboardState = {
  loadedAt: string | null;
  summary: DashboardSummaryRead | null;
  handoffSummary: HandoffSummaryRead | null;
  queues: Envelope<ConversationQueueItemRead> | null;
  conversations: Envelope<ConversationRead> | null;
  handoffsOpen: Envelope<ConversationRead> | null;
  handoffsAck: Envelope<ConversationRead> | null;
  slots: Envelope<ScheduleSlotRead> | null;
  media: Envelope<MediaRead> | null;
  receipts: Envelope<ReceiptRead> | null;
  model: ModelRead | null;
  agentOps: AgentOpsSummaryRead | null;
  errors: {
    conversations: BffFetchError | null;
    summary: BffFetchError | null;
    handoffSummary: BffFetchError | null;
    queues: BffFetchError | null;
    handoffsOpen: BffFetchError | null;
    handoffsAck: BffFetchError | null;
    slots: BffFetchError | null;
    media: BffFetchError | null;
    receipts: BffFetchError | null;
    model: BffFetchError | null;
    agentOps: BffFetchError | null;
  };
};

const INITIAL_STATE: DashboardState = {
  loadedAt: null,
  summary: null,
  handoffSummary: null,
  queues: null,
  conversations: null,
  handoffsOpen: null,
  handoffsAck: null,
  slots: null,
  media: null,
  receipts: null,
  model: null,
  agentOps: null,
  errors: {
    conversations: null,
    summary: null,
    handoffSummary: null,
    queues: null,
    handoffsOpen: null,
    handoffsAck: null,
    slots: null,
    media: null,
    receipts: null,
    model: null,
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
const MEDIA_STATUS_LABELS: MediaApprovalStatus[] = ["PENDING", "APPROVED"];

export function DashboardClient() {
  const [state, setState] = useState<DashboardState>(INITIAL_STATE);
  const [firstLoad, setFirstLoad] = useState(true);

  const load = useCallback(async () => {
    const now = new Date();
    const from = now.toISOString();
    const to = new Date(now.getTime() + DASHBOARD_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const [summary, handoffSummary, queues, conversations, handoffsOpen, handoffsAck, slots, media, receipts, model, agentOps] = await Promise.all([
      bffFetch<DashboardSummaryRead>("/api/operator/dashboard/summary?window=24h"),
      bffFetch<HandoffSummaryRead>("/api/operator/handoffs/summary?window=7d"),
      bffFetch<Envelope<ConversationQueueItemRead>>(
        `/api/operator/dashboard/queues?page_size=${ATTENTION_PAGE_SIZE}`,
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
      bffFetch<ModelRead>("/api/operator/models/active"),
      bffFetch<AgentOpsSummaryRead>("/api/operator/status/agent?window=24h"),
    ]);

    setState({
      loadedAt: new Date().toISOString(),
      summary: summary.data,
      handoffSummary: handoffSummary.data,
      queues: queues.data,
      conversations: conversations.data,
      handoffsOpen: handoffsOpen.data,
      handoffsAck: handoffsAck.data,
      slots: slots.data,
      media: media.data,
      receipts: receipts.data,
      model: model.data,
      agentOps: agentOps.data,
      errors: {
        summary: summary.error,
        handoffSummary: handoffSummary.error,
        queues: queues.error,
        conversations: conversations.error,
        handoffsOpen: handoffsOpen.error,
        handoffsAck: handoffsAck.error,
        slots: slots.error,
        media: media.error,
        receipts: receipts.error,
        model: model.error,
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
  const summaryError = state.errors.summary;
  const hasAgentFailure = (state.agentOps?.failed_or_partial.value ?? 0) > 0;
  const bffOutage = detectBffOutage(state.errors);

  if (firstLoad) {
    return (
      <div className="panel" role="status">
        <div className="panel-heading">
          <h2>Carregando painel</h2>
          <span className="badge muted">Buscando</span>
        </div>
        <p className="empty-state">Buscando conversas, transferências, agenda, mídias e dados da modelo.</p>
      </div>
    );
  }

  const heroSlotTone =
    derived.syncErrorCount > 0 ? "danger" : derived.syncPendingCount > 0 ? "warning" : "default";
  const mediaPendingValue = state.summary?.media_pending.value ?? derived.mediaCounts.PENDING ?? 0;
  const handoffOpenValue =
    handoffStatusValue(state.handoffSummary, "OPENED") ??
    state.summary?.handoffs_opened.value ??
    metricValueFromEnvelope(state.handoffsOpen, state.errors.handoffsOpen);
  const slotsValue =
    state.summary?.schedule_slots_next_14d_total.value ??
    metricValueFromEnvelope(state.slots, state.errors.slots);

  return (
    <div className="section-stack stagger-in">
      {bffOutage ? (
        <div className="bff-outage" role="alert">
          <strong>Sem conexão com o servidor</strong>
          <span>
            Os números e listas podem estar desatualizados. Estamos tentando novamente a cada {Math.round(POLL_INTERVAL_MS / 1000)} segundos.
          </span>
        </div>
      ) : null}

      <section className="panel">
        <div className="panel-heading">
          <h2>Números do momento</h2>
          <div className="inline-actions">
            <span className="live-dot" aria-live="polite">
              atualizado {formatDateTime(state.loadedAt)}
            </span>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                void load();
              }}
            >
              Atualizar agora
            </button>
          </div>
        </div>
        {!bffOutage && summaryError ? (
          <div className="panel-notice">
            Não consegui montar o resumo completo. Mostrando o que já carreguei abaixo.
          </div>
        ) : null}
        {hasAgentFailure ? (
          <div className="panel-notice warning">
            A IA teve falhas nas últimas 24 horas. <Link href="/status">Ver detalhes</Link>.
          </div>
        ) : null}

        <div className="metric-grid hero">
          <MetricCard
            href="/handoffs"
            label="Clientes esperando a modelo"
            value={handoffOpenValue}
            sub="Conversas que a IA transferiu e ainda não foram assumidas"
            tone={derived.hasOldOpenHandoff ? "danger" : (handoffOpenValue ?? 0) > 0 ? "warning" : "default"}
            variant="hero"
          />
          <MetricCard
            href="/midias"
            label="Mídias para aprovar"
            value={mediaPendingValue}
            sub="Fotos, vídeos e áudios aguardando você liberar o uso"
            tone={mediaPendingValue > 0 ? "warning" : "default"}
            variant="hero"
          />
          <MetricCard
            href="/agenda"
            label="Horários nos próximos 14 dias"
            value={slotsValue}
            sub="Tudo que já está na agenda da modelo"
            tone={heroSlotTone}
            variant="hero"
          />
        </div>

        <div className="metric-grid compact">
          <MetricCard
            href="/handoffs"
            label="Modelo já atendendo"
            value={handoffStatusValue(state.handoffSummary, "ACKNOWLEDGED") ?? state.summary?.handoffs_acknowledged.value ?? metricValueFromEnvelope(state.handoffsAck, state.errors.handoffsAck)}
            sub=""
            variant="compact"
          />
          <MetricCard
            href="/conversas"
            label="Total de conversas"
            value={state.summary?.total_conversations.value ?? metricValueFromEnvelope(state.conversations, state.errors.conversations)}
            sub=""
            variant="compact"
          />
          <MetricCard
            href="/conversas"
            label="Ativas nas últimas 24h"
            value={state.summary?.active_conversations.value ?? sampleCount(derived.activeSampleCount, state.errors.conversations)}
            sub=""
            variant="compact"
          />
          <MetricCard
            href="/conversas"
            label="Novas hoje"
            value={state.summary?.new_conversations_today.value ?? null}
            sub=""
            variant="compact"
          />
          <MetricCard
            href="/conversas"
            label="Tipo ainda indefinido"
            value={state.summary?.conversations_by_flow_type.counts.UNDETERMINED ?? sampleCount(derived.flowCounts.UNDETERMINED ?? 0, state.errors.conversations)}
            sub=""
            variant="compact"
          />
          <MetricCard
            href="/conversas"
            label="Em negociação"
            value={state.summary?.conversations_by_state.counts.NEGOCIANDO ?? sampleCount(derived.stateCounts.NEGOCIANDO ?? 0, state.errors.conversations)}
            sub=""
            variant="compact"
          />
        </div>
      </section>

      <OperationalQueuePanel queues={state.queues} error={state.errors.queues} suppressError={Boolean(bffOutage)} />

      <AttentionNowPanel
        opened={state.handoffsOpen}
        acknowledged={state.handoffsAck}
        conversations={state.conversations}
        media={state.media}
        receipts={state.receipts}
        model={state.model}
        errors={state.errors}
        suppressErrors={Boolean(bffOutage)}
      />

      <div className="dashboard-columns">
        <ConversationBreakdownPanel
          summary={state.summary}
          conversations={state.conversations}
          error={state.errors.conversations}
          suppressError={Boolean(bffOutage)}
        />
        <HandoffSummaryPanel summary={state.handoffSummary} error={state.errors.handoffSummary} suppressError={Boolean(bffOutage)} />
        <ScheduleSummaryPanel
          summary={state.summary}
          slots={state.slots}
          error={state.errors.slots}
          syncPendingCount={derived.syncPendingCount}
          syncErrorCount={derived.syncErrorCount}
          suppressError={Boolean(bffOutage)}
        />
        <MediaSummaryPanel summary={state.summary} media={state.media} error={state.errors.media} suppressError={Boolean(bffOutage)} />
        <ModelPendenciesPanel model={state.model} error={state.errors.model} suppressError={Boolean(bffOutage)} />
      </div>
    </div>
  );
}

function MetricCard({
  href,
  label,
  value,
  sub,
  tone = "default",
  variant = "default",
}: {
  href: string;
  label: string;
  value: number | null | undefined;
  sub: string;
  tone?: "default" | "warning" | "danger";
  variant?: "default" | "hero" | "compact";
}) {
  const toneClass = tone === "danger" ? " danger" : tone === "warning" ? " warning" : "";
  const variantClass = variant === "hero" ? " hero" : variant === "compact" ? " compact" : "";
  return (
    <Link className={`metric metric-link${toneClass}${variantClass}`} href={href}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{formatNumber(value ?? null)}</span>
      {sub ? <span className="metric-sub">{sub}</span> : null}
    </Link>
  );
}

function OperationalQueuePanel({
  queues,
  error,
  suppressError = false,
}: {
  queues: Envelope<ConversationQueueItemRead> | null;
  error: BffFetchError | null;
  suppressError?: boolean;
}) {
  const items = queues?.items ?? [];
  const showError = error && !suppressError;
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Fila de prioridade</h2>
        <span className="badge muted">
          {queues ? `${formatNumber(items.length)} de ${formatNumber(queues.total)}` : "—"}
        </span>
      </div>
      {showError ? <div className="panel-notice">{error.message}</div> : null}
      {!showError && items.length === 0 ? (
        <p className="empty-state">
          {error ? "Sem dados no momento — servidor fora do ar." : "Nenhuma conversa precisando de atenção agora."}
        </p>
      ) : null}
      {!showError && items.length > 0 ? (
        <ol className="queue-list">
          {items.map((item) => (
            <li key={`${item.queue_key}:${item.conversation_id}`}>
              <Link className={`queue-item ${queueTone(item)}`} href={item.drilldown_href}>
                <span className="queue-rank">{item.queue_priority}</span>
                <span className="queue-body">
                  <span className="attention-title">
                    {item.client_display_name || item.client_identifier}
                  </span>
                  <span className="attention-summary">{queueReason(item.queue_key, item.reason)}</span>
                  <span className="attention-meta">
                    <span className="chip warning">{queueLabel(item.queue_key, item.queue_label)}</span>
                    <span className="chip">{conversationStateLabel(item.state)}</span>
                    <span className={item.flow_type === "EXTERNAL" ? "chip warning" : "chip"}>
                      {flowTypeLabel(item.flow_type)}
                    </span>
                    <span className={item.handoff_status === "NONE" ? "chip" : "chip warning"}>
                      {handoffStatusLabel(item.handoff_status)}
                    </span>
                    <span title={formatDateTime(item.relevant_at)}>
                      há {formatRelativeSeconds(item.relevant_at)}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
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

function AttentionNowPanel({
  opened,
  acknowledged,
  conversations,
  media,
  receipts,
  model,
  errors,
  suppressErrors = false,
}: {
  opened: Envelope<ConversationRead> | null;
  acknowledged: Envelope<ConversationRead> | null;
  conversations: Envelope<ConversationRead> | null;
  media: Envelope<MediaRead> | null;
  receipts: Envelope<ReceiptRead> | null;
  model: ModelRead | null;
  errors: DashboardState["errors"];
  suppressErrors?: boolean;
}) {
  const conversationItems = conversations?.items ?? [];
  const mediaItems = media?.items ?? [];
  const staleConversations = sortByOldestLastMessage(conversationItems).slice(0, ATTENTION_LIMIT);
  const awaitingDecision = conversationItems
    .filter((conversation) => conversation.awaiting_client_decision)
    .slice(0, ATTENTION_LIMIT);
  const undetermined = conversationItems
    .filter((conversation) => conversation.flow_type === "UNDETERMINED")
    .slice(0, ATTENTION_LIMIT);
  const pendingMedia = mediaItems
    .filter((item) => item.approval_status === "PENDING")
    .slice(0, ATTENTION_LIMIT);
  const reviewReceipts = (receipts?.items ?? []).slice(0, ATTENTION_LIMIT);
  const modelPendencies = model ? detectModelPendencies(model).slice(0, ATTENTION_LIMIT) : [];
  const modelError = errors.model && errors.model.status !== 404 ? errors.model : null;

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Para resolver agora</h2>
      </div>
      <div className="attention-grid">
        <AttentionList
          title="Aguardando a modelo assumir"
          href="/handoffs"
          error={suppressErrors ? null : errors.handoffsOpen}
          emptyMessage="Nenhum cliente esperando transferência."
          items={(opened?.items ?? []).slice(0, ATTENTION_LIMIT).map((conversation) => (
            <ConversationAttentionItem
              key={conversation.id}
              conversation={conversation}
              context="Transferida"
              highlightOld
            />
          ))}
        />
        <AttentionList
          title="Modelo atendendo há um tempo"
          href="/handoffs"
          error={suppressErrors ? null : errors.handoffsAck}
          emptyMessage="Nenhuma conversa com a modelo agora."
          items={(acknowledged?.items ?? []).slice(0, ATTENTION_LIMIT).map((conversation) => (
            <ConversationAttentionItem
              key={conversation.id}
              conversation={conversation}
              context="Modelo atendendo"
              highlightOld
            />
          ))}
        />
        <AttentionList
          title="Clientes que ainda não responderam"
          href="/conversas"
          error={suppressErrors ? null : errors.conversations}
          emptyMessage="Ninguém aguardando resposta do cliente."
          items={awaitingDecision.map((conversation) => (
            <ConversationAttentionItem
              key={conversation.id}
              conversation={conversation}
              context="aguardando cliente"
            />
          ))}
        />
        <AttentionList
          title="Conversas paradas há mais tempo"
          href="/conversas"
          error={suppressErrors ? null : errors.conversations}
          emptyMessage="Nenhuma conversa carregada."
          items={staleConversations.map((conversation) => (
            <ConversationAttentionItem
              key={conversation.id}
              conversation={conversation}
              context="parada"
            />
          ))}
        />
        <AttentionList
          title="Tipo de atendimento indefinido"
          href="/conversas"
          error={suppressErrors ? null : errors.conversations}
          emptyMessage="Todo mundo com tipo de atendimento definido."
          items={undetermined.map((conversation) => (
            <ConversationAttentionItem
              key={conversation.id}
              conversation={conversation}
              context={conversationStateLabel(conversation.state)}
            />
          ))}
        />
        <AttentionList
          title="Comprovantes para conferir"
          href="/conversas"
          error={suppressErrors ? null : errors.receipts}
          emptyMessage="Nenhum comprovante aguardando conferência."
          items={reviewReceipts.map((receipt) => (
            <ReceiptAttentionItem key={receipt.id} receipt={receipt} />
          ))}
        />
        <AttentionList
          title="Mídias aguardando aprovação"
          href="/midias"
          error={errors.media}
          emptyMessage="Nenhuma mídia pendente."
          items={pendingMedia.map((item) => (
            <MediaAttentionItem key={item.id} media={item} />
          ))}
        />
        <AttentionList
          title="Dados da modelo para completar"
          href="/modelos"
          error={modelError}
          emptyMessage={
            model ? "Dados da modelo estão completos." : "Nenhuma modelo cadastrada."
          }
          items={modelPendencies.map((pendency) => (
            <li key={`${pendency.kind}:${pendency.path}`}>
              <Link className="attention-item" href="/modelos">
                <span className="attention-title">{pendency.label}</span>
                <span className="attention-meta">
                  <span className="chip warning">{modelPendencyKindLabel(pendency.kind)}</span>
                  completar cadastro
                </span>
              </Link>
            </li>
          ))}
        />
      </div>
    </section>
  );
}

function AttentionList({
  title,
  href,
  error,
  emptyMessage,
  items,
}: {
  title: string;
  href: string;
  error: BffFetchError | null;
  emptyMessage: string;
  items: React.ReactNode[];
}) {
  return (
    <section className="attention-list" aria-label={title}>
      <div className="attention-heading">
        <h3>{title}</h3>
        <Link className="link-pill" href={href}>
          Ver tudo
        </Link>
      </div>
      {error ? <div className="panel-notice">{error.message}</div> : null}
      {!error && items.length === 0 ? <p className="empty-state">{emptyMessage}</p> : null}
      {!error && items.length > 0 ? <ul>{items}</ul> : null}
    </section>
  );
}

function ConversationAttentionItem({
  conversation,
  context,
  highlightOld = false,
}: {
  conversation: ConversationRead;
  context: string;
  highlightOld?: boolean;
}) {
  const isOld = highlightOld && isOldHandoff(conversation);
  const clientName = conversation.client.display_name || conversation.client.whatsapp_jid;
  const ageAt = handoffAgeTimestamp(conversation) ?? conversation.last_message_at;
  const ageLabel = conversation.last_handoff_at ? "transferida há" : "última mensagem há";
  return (
    <li>
      <Link
        className={isOld ? "attention-item danger" : "attention-item"}
        href={`/conversas/${conversation.id}`}
      >
        <span className="attention-title">{clientName}</span>
        {conversation.summary ? (
          <span className="attention-summary">{truncate(conversation.summary, 96)}</span>
        ) : null}
        <span className="attention-meta">
          <span className="chip">{context}</span>
          {conversation.awaiting_client_decision ? (
            <span className="chip warning">aguarda resposta</span>
          ) : null}
          {urgencyProfileLabel(conversation.urgency_profile) ? (
            <span className="chip warning">{urgencyProfileLabel(conversation.urgency_profile)}</span>
          ) : null}
          {clientStatusLabel(conversation.client.client_status) ? (
            <span className="chip">cliente {clientStatusLabel(conversation.client.client_status)}</span>
          ) : null}
          {conversation.client.language_hint ? (
            <span className="chip">idioma {conversation.client.language_hint}</span>
          ) : null}
          {conversation.expected_amount ? (
            <span className="chip">valor combinado {formatCurrency(conversation.expected_amount)}</span>
          ) : null}
          <span title={formatDateTime(ageAt)}>
            {ageLabel} {formatRelativeSeconds(ageAt)}
          </span>
        </span>
      </Link>
    </li>
  );
}

function MediaAttentionItem({ media }: { media: MediaRead }) {
  return (
    <li>
      <Link className="attention-item warning" href="/midias">
        <span className="attention-title">
          {mediaTypeLabel(media.media_type)} {media.category ? `· ${media.category}` : "· sem categoria"}
        </span>
        <span className="attention-meta">
          <span className="chip warning">Aguardando</span>
          Recebida {formatDateTime(media.updated_at)}
        </span>
      </Link>
    </li>
  );
}

function ReceiptAttentionItem({ receipt }: { receipt: ReceiptRead }) {
  const clientName = receipt.client.display_name || receipt.client.whatsapp_jid;
  return (
    <li>
      <Link className="attention-item warning" href={receipt.drilldown_href}>
        <span className="attention-title">{clientName}</span>
        <span className="attention-meta">
          <span className="chip warning">precisa conferir</span>
          {receipt.expected_amount ? (
            <span className="chip">esperado {formatCurrency(receipt.expected_amount)}</span>
          ) : null}
          {receipt.detected_amount ? (
            <span className="chip">detectado {formatCurrency(receipt.detected_amount)}</span>
          ) : null}
          Recebido {formatDateTime(receipt.created_at)}
        </span>
      </Link>
    </li>
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
    const total = summary.total_conversations.value;
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
            title="Por situação"
            labels={STATE_LABELS}
            formatLabel={(l) => conversationStateLabel(l as ConversationState)}
            counts={summary.conversations_by_state.counts}
            total={total}
          />
          <CountBars
            title="Por tipo de atendimento"
            labels={FLOW_LABELS}
            formatLabel={(l) => flowTypeLabel(l as FlowType)}
            counts={summary.conversations_by_flow_type.counts}
            total={total}
          />
          <CountBars
            title="Por quem está atendendo"
            labels={HANDOFF_LABELS}
            formatLabel={(l) => handoffStatusLabel(l as HandoffStatus)}
            counts={summary.conversations_by_handoff_status.counts}
            total={total}
          />
        </div>
        <div className="link-strip">
          <Link className="link-pill" href="/conversas">
            Abrir conversas
          </Link>
          <Link className="link-pill" href="/handoffs">
            Abrir transferências
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
          title="Por situação"
          labels={STATE_LABELS}
          formatLabel={(l) => conversationStateLabel(l as ConversationState)}
          counts={countBy(items, (conversation) => conversation.state)}
          total={items.length}
        />
        <CountBars
          title="Por tipo de atendimento"
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
          Abrir transferências
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
  const max = Math.max(1, ...labels.map((label) => counts[label] ?? 0));
  return (
    <div>
      <h3>{title}</h3>
      <div className="bar-list">
        {labels.map((label) => {
          const value = counts[label] ?? 0;
          const width = `${Math.max(4, Math.round((value / max) * 100))}%`;
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
    return <ErrorPanel title="Transferências nos últimos 7 dias" error={error} />;
  }
  if (!summary) {
    return (
      <EmptyPanel
        title="Transferências nos últimos 7 dias"
        message="Sem dados de transferências agora."
        href="/handoffs"
      />
    );
  }

  const reasonEntries = Object.entries(summary.reasons.counts).slice(0, 4);
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Transferências nos últimos 7 dias</h2>
        <Link className="link-pill" href="/handoffs">
          Abrir transferências
        </Link>
      </div>
      <div className="stack-md">
        <table className="data-table" aria-label="Resumo de transferências">
          <tbody>
            <tr>
              <td>Aguardando modelo agora</td>
              <td className="numeric">{formatNumber(summary.current_by_status.counts.OPENED ?? 0)}</td>
            </tr>
            <tr>
              <td>Modelo atendendo agora</td>
              <td className="numeric">{formatNumber(summary.current_by_status.counts.ACKNOWLEDGED ?? 0)}</td>
            </tr>
            <tr>
              <td>Esperando há 1–4h</td>
              <td className="numeric">{formatNumber(summary.open_age_buckets.counts["1-4h"] ?? 0)}</td>
            </tr>
            <tr>
              <td>Esperando há mais de 4h</td>
              <td className={summary.open_age_buckets.counts["4h+"] ? "numeric warning-cell" : "numeric"}>
                {formatNumber(summary.open_age_buckets.counts["4h+"] ?? 0)}
              </td>
            </tr>
            <tr>
              <td>Tempo médio até a modelo assumir</td>
              <td className="numeric">{formatDurationSeconds(summary.time_to_acknowledge?.average_seconds)}</td>
            </tr>
            <tr>
              <td>Tempo médio até devolver à IA</td>
              <td className="numeric">{formatDurationSeconds(summary.time_to_release?.average_seconds)}</td>
            </tr>
          </tbody>
        </table>
        {reasonEntries.length > 0 ? (
          <div className="stack-sm">
            <h3>Por que a IA transferiu</h3>
            {reasonEntries.map(([reason, value]) => (
              <div className="bar-row" key={reason}>
                <span className="bar-label">{handoffReasonLabel(reason) ?? reason}</span>
                <span className="bar-track" aria-hidden="true">
                  <span
                    className="bar-fill"
                    style={{ width: `${Math.max(4, Math.round((value / Math.max(1, summary.reasons.meta.sample_size)) * 100))}%` }}
                  />
                </span>
                <span className="bar-value">{formatNumber(value)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">Nenhuma transferência na semana.</p>
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
    const statusCounts = summary.schedule_slots_next_14d_by_status.counts;
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
                <td className="numeric">{formatNumber(summary.schedule_slots_next_14d_total.value)}</td>
              </tr>
              {SCHEDULE_STATUS_LABELS.map((label) => (
                <tr key={label}>
                  <td>{scheduleSlotLabel(label)}</td>
                  <td className="numeric">{formatNumber(statusCounts[label] ?? 0)}</td>
                </tr>
              ))}
              <tr>
                <td>Sincronizando com Google Calendar</td>
                <td className={summary.calendar_sync_pending.value > 0 ? "numeric warning-cell" : "numeric muted-cell"}>
                  {formatNumber(summary.calendar_sync_pending.value)}
                </td>
              </tr>
              <tr>
                <td>Com erro de sincronização</td>
                <td className={summary.calendar_sync_error.value > 0 ? "numeric danger-cell" : "numeric muted-cell"}>
                  {formatNumber(summary.calendar_sync_error.value)}
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
    return (
      <section className="panel">
        <div className="panel-heading">
          <h2>Mídias</h2>
          <Link className="link-pill" href="/midias">
            Abrir galeria
          </Link>
        </div>
        <div className="stack-md">
          <table className="data-table" aria-label="Resumo de mídias">
            <tbody>
              <tr>
                <td>Aguardando aprovação</td>
                <td className={summary.media_pending.value > 0 ? "numeric warning-cell" : "numeric"}>
                  {formatNumber(summary.media_pending.value)}
                </td>
              </tr>
              <tr>
                <td>Sem categoria definida</td>
                <td className="numeric">{formatNumber(summary.media_without_category.value)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    );
  }
  if (error && !suppressError) {
    return <ErrorPanel title="Mídias" error={error} />;
  }
  const items = media?.items ?? [];
  const counts = countBy(items, (item) => item.approval_status);
  const withoutCategory = items.filter((item) => !item.category).length;

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Mídias</h2>
        <Link className="link-pill" href="/midias">
          Abrir galeria
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="empty-state">Nenhuma mídia cadastrada.</p>
      ) : (
        <div className="stack-md">
          <table className="data-table" aria-label="Mídias por situação">
            <tbody>
              {MEDIA_STATUS_LABELS.map((label) => (
                <tr key={label}>
                  <td>{mediaApprovalLabel(label)}</td>
                  <td className={label === "PENDING" && (counts[label] ?? 0) > 0 ? "numeric warning-cell" : "numeric"}>
                    {formatNumber(counts[label] ?? 0)}
                  </td>
                </tr>
              ))}
              <tr>
                <td>Sem categoria definida</td>
                <td className="numeric">{formatNumber(withoutCategory)}</td>
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

function ModelPendenciesPanel({
  model,
  error,
  suppressError = false,
}: {
  model: ModelRead | null;
  error: BffFetchError | null;
  suppressError?: boolean;
}) {
  if (error && error.status !== 404 && !suppressError) {
    return <ErrorPanel title="Dados da modelo" error={error} />;
  }
  if (!model) {
    return (
      <section className="panel">
        <div className="panel-heading">
          <h2>Dados da modelo</h2>
          <span className="badge warning">Sem cadastro</span>
        </div>
        <p className="empty-state">
          Nenhuma modelo cadastrada ainda. Sem isso a IA não responde e a agenda fica parada.
        </p>
        <div className="link-strip">
          <Link className="link-pill" href="/modelos">
            Ver detalhes
          </Link>
        </div>
      </section>
    );
  }
  const pendencies = detectModelPendencies(model);
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Dados da modelo</h2>
        <Link className="link-pill" href="/modelos">
          Ver modelo
        </Link>
      </div>
      <dl className="kv-list">
        <div>
          <dt>Modelo</dt>
          <dd>{model.display_name}</dd>
        </div>
        <div>
          <dt>Google Calendar</dt>
          <dd>{model.calendar_external_id || "—"}</dd>
        </div>
        <div>
          <dt>Idiomas</dt>
          <dd>{model.languages?.length ? model.languages.join(", ") : "—"}</dd>
        </div>
      </dl>
      <h3 style={{ marginTop: 14 }}>Pendências</h3>
      {pendencies.length === 0 ? (
        <p className="empty-state">Tudo preenchido.</p>
      ) : (
        <ul className="stack-sm" aria-label="Pendências">
          {pendencies.map((pendency) => (
            <li key={`${pendency.kind}:${pendency.path}`}>
              <span className="chip warning">{modelPendencyKindLabel(pendency.kind)}</span>
              <span>{pendency.label}</span>
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
        <Link className="link-pill" href={href}>
          Ver tudo
        </Link>
      </div>
      <p className="empty-state">{message}</p>
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
  return {
    conversationSampleSize: conversationItems.length,
    activeSampleCount: conversationItems.filter(isActiveInLast24h).length,
    stateCounts: countBy(conversationItems, (conversation) => conversation.state),
    flowCounts: countBy(conversationItems, (conversation) => conversation.flow_type),
    mediaCounts: countBy(mediaItems, (item) => item.approval_status),
    syncPendingCount:
      state.summary?.calendar_sync_pending.value ??
      slotItems.filter((slot) => slot.calendar_sync_status === "PENDING").length,
    syncErrorCount:
      state.summary?.calendar_sync_error.value ??
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

function sampleCount(value: number, error: BffFetchError | null): number | null {
  return error ? null : value;
}

function detectBffOutage(errors: DashboardState["errors"]): BffFetchError | null {
  return Object.values(errors).find((error) => error?.status === 0) ?? null;
}

function handoffStatusValue(
  summary: HandoffSummaryRead | null,
  status: HandoffStatus,
): number | null {
  return summary?.current_by_status.counts[status] ?? null;
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
