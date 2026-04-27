"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { DashboardFinancialTimeseriesRead, DashboardSummaryRead } from "@/contracts";
import { bffFetch, type BffFetchError } from "@/features/shared/bff-client";
import { formatCurrency, formatDateTime, formatNumber } from "@/features/shared/formatters";

const POLL_INTERVAL_MS = 30_000;
const PERIOD_OPTIONS = [
  { label: "Ultimos 7 dias", days: 7 },
  { label: "Ultimos 30 dias", days: 30 },
  { label: "Ultimos 90 dias", days: 90 },
] as const;

type PeriodDays = (typeof PERIOD_OPTIONS)[number]["days"];

type DashboardState = {
  loadedAt: string | null;
  summary: DashboardSummaryRead | null;
  timeseries: DashboardFinancialTimeseriesRead | null;
  error: BffFetchError | null;
  timeseriesError: BffFetchError | null;
};

const INITIAL_STATE: DashboardState = {
  loadedAt: null,
  summary: null,
  timeseries: null,
  error: null,
  timeseriesError: null,
};

const FUNNEL_STAGES = [
  { key: "NOVO", label: "Novos" },
  { key: "QUALIFICANDO", label: "Em qualificacao" },
  { key: "NEGOCIANDO", label: "Em negociacao" },
  { key: "CONFIRMADO", label: "Confirmados" },
] as const;

export function DashboardClient() {
  const [state, setState] = useState<DashboardState>(INITIAL_STATE);
  const [firstLoad, setFirstLoad] = useState(true);
  const [periodDays, setPeriodDays] = useState<PeriodDays>(7);

  const load = useCallback(async () => {
    const [summary, timeseries] = await Promise.all([
      bffFetch<DashboardSummaryRead>("/api/operator/dashboard/summary?window=24h"),
      bffFetch<DashboardFinancialTimeseriesRead>(
        `/api/operator/dashboard/financial/timeseries?days=${periodDays}`,
      ),
    ]);

    setState({
      loadedAt: new Date().toISOString(),
      summary: summary.data,
      timeseries: timeseries.data,
      error: summary.error,
      timeseriesError: timeseries.error,
    });
    setFirstLoad(false);
  }, [periodDays]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const view = useMemo(
    () => buildClientView(state.summary, state.timeseries),
    [state.summary, state.timeseries],
  );
  const selectedPeriod = PERIOD_OPTIONS.find((option) => option.days === periodDays) ?? PERIOD_OPTIONS[0];

  if (firstLoad) {
    return (
      <section className="panel" role="status">
        <div className="panel-heading">
          <h2>Carregando acompanhamento</h2>
          <span className="badge muted">Buscando dados</span>
        </div>
        <p className="empty-state">Buscando os principais indicadores comerciais.</p>
      </section>
    );
  }

  return (
    <div className="section-stack stagger-in">
      {state.error ? (
        <div className="panel-notice warning" role="status">
          Alguns dados ainda nao foram carregados. Tentaremos atualizar automaticamente.
        </div>
      ) : null}

      <section className="panel command-center">
        <div className="panel-heading">
          <div>
            <h2>Resumo de hoje</h2>
            <p className="empty-state">Indicadores principais para acompanhar o movimento comercial.</p>
          </div>
          <div className="dashboard-refresh">
            <span className="live-dot" aria-live="polite">
              atualizado {formatDateTime(state.loadedAt)}
            </span>
            <button className="button secondary" type="button" onClick={() => void load()}>
              Atualizar
            </button>
          </div>
        </div>

        <div className="command-center-grid client-summary-grid">
          <MetricCard
            label="Novos leads hoje"
            value={formatNumber(view.newToday)}
            description="Entraram no atendimento desde o inicio do dia."
            delta={view.qualificationDelta}
          />
          <MetricCard
            label="Conversas ativas"
            value={formatNumber(view.activeConversations)}
            description="Leads com movimento recente e acompanhamento em andamento."
          />
          <MetricCard
            label="Pipeline aberto"
            value={formatCurrency(view.pipelineTotal)}
            description="Valor esperado nas conversas comerciais ainda em aberto."
            tone="warning"
            delta={view.pipelineGrowthLabel}
          />
          <MetricCard
            label="Conversao 30d"
            value={view.conversionRateLabel}
            description={view.conversionDetail}
            tone={view.conversionTone}
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading client-period-heading">
          <div>
            <h2>Evolucao no periodo</h2>
            <p className="empty-state">Valores comerciais agregados por dia.</p>
          </div>
          <div className="period-filter" aria-label="Periodo do dashboard">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.days}
                className={periodDays === option.days ? "period-filter-button active" : "period-filter-button"}
                type="button"
                onClick={() => setPeriodDays(option.days)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {state.timeseriesError ? (
          <p className="empty-state">Nao foi possivel carregar a evolucao do periodo agora.</p>
        ) : (
          <div className="client-trend-layout">
            <TrendChart points={view.trendPoints} />
            <div className="performance-strip client-trend-stats">
              <StatCard
                label="Pipeline criado"
                value={formatCurrency(view.periodPipeline)}
                detail={selectedPeriod.label}
                tone="warning"
              />
              <StatCard
                label="Receita detectada"
                value={formatCurrency(view.periodDetected)}
                detail={selectedPeriod.label}
              />
              <StatCard
                label="Conversoes"
                value={formatNumber(view.periodConversions)}
                detail={`${formatNumber(view.periodTerminals)} oportunidades encerradas.`}
                tone="ok"
              />
            </div>
          </div>
        )}
      </section>

      <section className="dashboard-columns client-dashboard-columns">
        <section className="panel performance-zone">
          <div className="panel-heading compact">
            <h2>Funil comercial</h2>
          </div>
          <p className="empty-state">Distribuicao atual das conversas por etapa.</p>
          <div className="funnel-grid client-funnel-grid">
            {FUNNEL_STAGES.map((stage) => (
              <div
                key={stage.key}
                className={`funnel-stage ${stage.key === "CONFIRMADO" ? "highlight" : ""}`}
              >
                <span className="funnel-stage-label">{stage.label}</span>
                <strong className="funnel-stage-value">
                  {formatNumber(view.funnelCounts[stage.key] ?? 0)}
                </strong>
                <span className="funnel-stage-rate">{view.funnelRates[stage.key]}</span>
              </div>
            ))}
          </div>
          <div className="link-strip">
            <Link className="link-pill" href="/conversas">
              Ver conversas
            </Link>
          </div>
        </section>

        <section className="panel performance-zone">
          <div className="panel-heading compact">
            <h2>Receita acompanhada</h2>
          </div>
          <p className="empty-state">Valores estimados a partir das conversas e comprovantes registrados.</p>
          <div className="performance-strip client-finance-strip">
            <StatCard
              label="Ticket medio"
              value={formatCurrency(view.avgTicket)}
              detail="Media dos ultimos 7 dias."
            />
            <StatCard
              label="Detectado 7d"
              value={formatCurrency(view.detectedTotal)}
              detail="Total identificado em comprovantes recentes."
            />
            <StatCard
              label="Receita projetada"
              value={formatCurrency(view.projectedRevenue)}
              detail="Estimativa com base na taxa recente de conversao."
            />
          </div>
          <div className="link-strip">
            <Link className="link-pill" href="/financeiro">
              Ver financeiro
            </Link>
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="panel-heading compact">
          <h2>Leitura rapida</h2>
        </div>
        <div className="performance-strip client-insight-strip">
          <StatCard
            label="Qualificacao"
            value={`${formatNumber(view.qualificationRate)}%`}
            detail={`${formatNumber(view.qualificationSample)} leads usados na amostra.`}
            tone="ok"
          />
          <StatCard
            label="Leads quentes"
            value={formatNumber(view.hotLeads)}
            detail="Conversas com maior sinal comercial."
            tone="warning"
          />
          <StatCard
            label="Total acompanhado"
            value={formatNumber(view.totalConversations)}
            detail="Base total registrada na operacao."
          />
          <StatCard
            label="Crescimento"
            value={view.pipelineGrowthLabel}
            detail="Variacao do pipeline nos ultimos 7 dias."
          />
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  description,
  delta,
  tone,
}: {
  label: string;
  value: string;
  description: string;
  delta?: string;
  tone?: "ok" | "warning" | "danger";
}) {
  return (
    <div className={`command-card ${tone ?? ""}`}>
      <span className="command-card-label">{label}</span>
      <strong className="command-card-value">{value}</strong>
      {delta ? <span className="command-card-delta">{delta}</span> : null}
      <p className="command-card-description">{description}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "ok" | "warning" | "danger";
}) {
  return (
    <div className={`performance-stat ${tone ?? ""}`}>
      <span className="performance-stat-label">{label}</span>
      <strong className="performance-stat-value">{value}</strong>
      <p className="performance-stat-detail">{detail}</p>
    </div>
  );
}

function TrendChart({
  points,
}: {
  points: { label: string; pipeline: number; detected: number; conversion: number }[];
}) {
  const maxValue = Math.max(
    1,
    ...points.flatMap((point) => [point.pipeline, point.detected, point.conversion]),
  );

  if (points.length === 0) {
    return <p className="empty-state">Sem dados suficientes para montar a evolucao.</p>;
  }

  return (
    <div className="trend-chart" aria-label="Evolucao diaria no periodo">
      {points.map((point) => (
        <div className="trend-day" key={point.label}>
          <div className="trend-bars">
            <span
              className="trend-bar pipeline"
              title={`Pipeline ${formatCurrency(point.pipeline)}`}
              style={{ height: `${barHeight(point.pipeline, maxValue)}%` }}
            />
            <span
              className="trend-bar detected"
              title={`Receita detectada ${formatCurrency(point.detected)}`}
              style={{ height: `${barHeight(point.detected, maxValue)}%` }}
            />
            <span
              className="trend-bar conversion"
              title={`${formatNumber(point.conversion)} conversoes`}
              style={{ height: `${barHeight(point.conversion, maxValue)}%` }}
            />
          </div>
          <span className="trend-day-label">{point.label}</span>
        </div>
      ))}
    </div>
  );
}

function buildClientView(
  summary: DashboardSummaryRead | null,
  timeseries: DashboardFinancialTimeseriesRead | null,
) {
  const financial = summary?.financial;
  const conversionRate = financial?.conversion_rate_last_30d.value_percent ?? null;
  const conversionNumerator = financial?.conversion_rate_last_30d.numerator ?? 0;
  const conversionDenominator = financial?.conversion_rate_last_30d.denominator ?? 0;
  const pipelineGrowthDelta = financial?.pipeline_growth.delta_percent ?? null;
  const funnelCounts = {
    ...summary?.conversations_by_state.counts,
    ...summary?.conversation_funnel.counts,
  };
  const periodTotals = summarizeTimeseries(timeseries);
  const trendPoints = buildTrendPoints(timeseries);
  const funnelRates = buildFunnelRates(funnelCounts);

  return {
    newToday: summary?.new_conversations_today.value ?? 0,
    activeConversations: summary?.active_conversations.value ?? 0,
    totalConversations: summary?.total_conversations.value ?? 0,
    hotLeads: summary?.hot_leads_count.value ?? 0,
    qualificationRate: summary?.qualification_rate.value ?? 0,
    qualificationSample: summary?.qualification_rate.meta.sample_size ?? 0,
    pipelineTotal: financial?.open_pipeline_total.value ?? 0,
    avgTicket: financial?.avg_ticket_last_7d.value ?? 0,
    detectedTotal: financial?.detected_total_last_7d.value ?? 0,
    projectedRevenue: financial?.projected_revenue.value ?? null,
    periodPipeline: periodTotals.pipeline,
    periodDetected: periodTotals.detected,
    periodConversions: periodTotals.conversions,
    periodTerminals: periodTotals.terminals,
    trendPoints,
    funnelCounts,
    funnelRates,
    conversionRateLabel: conversionRate === null ? "-" : `${formatNumber(conversionRate)}%`,
    conversionDetail:
      conversionDenominator > 0
        ? `${formatNumber(conversionNumerator)} de ${formatNumber(conversionDenominator)} oportunidades fechadas.`
        : "Sem historico suficiente para comparar.",
    conversionTone: conversionRate !== null && conversionRate >= 30 ? ("ok" as const) : undefined,
    qualificationDelta:
      (summary?.qualification_rate.meta.sample_size ?? 0) > 0
        ? `${formatNumber(summary?.qualification_rate.value ?? 0)}% qualificados nos ultimos 7 dias`
        : undefined,
    pipelineGrowthLabel:
      pipelineGrowthDelta === null
        ? "-"
        : `${pipelineGrowthDelta > 0 ? "+" : ""}${formatNumber(pipelineGrowthDelta)}%`,
  };
}

function summarizeTimeseries(timeseries: DashboardFinancialTimeseriesRead | null) {
  return (timeseries?.points ?? []).reduce(
    (acc, point) => ({
      pipeline: acc.pipeline + toNumber(point.pipeline_new_amount),
      detected: acc.detected + toNumber(point.detected_total_amount),
      conversions: acc.conversions + point.conversions_count,
      terminals: acc.terminals + point.terminal_count,
    }),
    { pipeline: 0, detected: 0, conversions: 0, terminals: 0 },
  );
}

function buildTrendPoints(timeseries: DashboardFinancialTimeseriesRead | null) {
  const points = timeseries?.points ?? [];
  const step = points.length > 30 ? 7 : points.length > 14 ? 3 : 1;
  return points
    .filter((_, index) => index % step === 0 || index === points.length - 1)
    .map((point) => ({
      label: formatShortDate(point.date),
      pipeline: toNumber(point.pipeline_new_amount),
      detected: toNumber(point.detected_total_amount),
      conversion: point.conversions_count,
    }));
}

function buildFunnelRates(counts: Record<string, number>) {
  const novo = counts.NOVO ?? 0;
  const qualificando = counts.QUALIFICANDO ?? 0;
  const negociando = counts.NEGOCIANDO ?? 0;
  const confirmado = counts.CONFIRMADO ?? 0;

  return {
    NOVO: novo > 0 ? "100%" : "sem entrada",
    QUALIFICANDO: rateLabel(qualificando, novo),
    NEGOCIANDO: rateLabel(negociando, qualificando),
    CONFIRMADO: rateLabel(confirmado, negociando),
  };
}

function rateLabel(value: number, base: number): string {
  if (base <= 0) {
    return "sem base";
  }
  return `${formatNumber(Math.round((value / base) * 100))}% da etapa anterior`;
}

function barHeight(value: number, maxValue: number): number {
  if (value <= 0) {
    return 4;
  }
  return Math.max(10, Math.round((value / maxValue) * 100));
}

function formatShortDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
