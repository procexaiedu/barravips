"use client";

import { useCallback, useEffect, useState } from "react";

import type { DashboardFinancialRead, DashboardFinancialTimeseriesRead, DashboardSummaryRead } from "@/contracts";
import { bffFetch, type BffFetchError } from "@/features/shared/bff-client";
import { formatCurrency, formatNumber, formatTime } from "@/features/shared/formatters";

import {
  DeltaArrow,
  DualBar,
  Gauge,
  RadialRing,
  Sparkline,
  StackedBar,
} from "./financial-visuals";
import { useCountUp } from "./hooks/use-count-up";

const SUMMARY_POLL_INTERVAL_MS = 30_000;
const TIMESERIES_POLL_INTERVAL_MS = 60_000;

type FinancialState = {
  summaryLoadedAt: string | null;
  timeseriesLoadedAt: string | null;
  summary: DashboardSummaryRead | null;
  timeseries: DashboardFinancialTimeseriesRead | null;
  summaryError: BffFetchError | null;
  timeseriesError: BffFetchError | null;
};

const INITIAL_STATE: FinancialState = {
  summaryLoadedAt: null,
  timeseriesLoadedAt: null,
  summary: null,
  timeseries: null,
  summaryError: null,
  timeseriesError: null,
};

export function FinancialClient() {
  const [state, setState] = useState<FinancialState>(INITIAL_STATE);
  const [firstLoad, setFirstLoad] = useState(true);

  const loadSummary = useCallback(async () => {
    const summary = await bffFetch<DashboardSummaryRead>(
      "/api/operator/dashboard/summary?window=24h",
    );
    setState((current) => ({
      ...current,
      summaryLoadedAt: new Date().toISOString(),
      summary: summary.data,
      summaryError: summary.error,
    }));
    setFirstLoad(false);
  }, []);

  const loadTimeseries = useCallback(async () => {
    const timeseries = await bffFetch<DashboardFinancialTimeseriesRead>(
      "/api/operator/dashboard/financial/timeseries?days=30",
    );
    setState((current) => ({
      ...current,
      timeseriesLoadedAt: new Date().toISOString(),
      timeseries: timeseries.data,
      timeseriesError: timeseries.error,
    }));
  }, []);

  useEffect(() => {
    void loadSummary();
    const id = window.setInterval(() => {
      void loadSummary();
    }, SUMMARY_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [loadSummary]);

  useEffect(() => {
    void loadTimeseries();
    const id = window.setInterval(() => {
      void loadTimeseries();
    }, TIMESERIES_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [loadTimeseries]);

  if (firstLoad) {
    return <FinancialLoadingState />;
  }

  if (state.summaryError && state.summaryError.status === 0 && !state.summary) {
    return (
      <div className="bff-outage" role="alert">
        <strong>Sem conexão com o servidor</strong>
        <span>
          Vamos tentar de novo em cerca de {Math.round(SUMMARY_POLL_INTERVAL_MS / 1000)} segundos.
        </span>
      </div>
    );
  }

  if (state.summaryError && !state.summary) {
    return (
      <section className="panel error-panel">
        <div className="panel-heading">
          <h2>Financeiro</h2>
          <span className="badge danger">Erro</span>
        </div>
        <p>{state.summaryError.message}</p>
      </section>
    );
  }

  const financial = state.summary?.financial;
  if (!financial) {
    return (
      <section className="panel">
        <div className="panel-heading">
          <h2>Financeiro</h2>
          <span className="badge muted">sem dados</span>
        </div>
        <p className="empty-state">Ainda não há dados financeiros para mostrar.</p>
      </section>
    );
  }

  const pipelineByState = financial.open_pipeline_by_state?.amounts ?? {};
  const divergenceValue = toAmount(financial.divergence_abs_last_7d.value);
  const totalPipeline = toAmount(financial.open_pipeline_total.value);
  const detectedTotal = toAmount(financial.detected_total_last_7d.value);
  const growth = financial.pipeline_growth;
  const growthDelta = growth.delta_percent;
  const conversion = financial.conversion_rate_last_30d;
  const forecast = financial.projected_revenue;
  const hasForecast = forecast.value !== null && forecast.value !== undefined;
  const forecastDescription = hasForecast
    ? "Pipeline aberto × taxa de conversão dos últimos 30 dias."
    : `Amostra insuficiente: ${formatNumber(forecast.meta.sample_size)} conversas fechadas em 30d (mínimo ${formatNumber(forecast.minimum_sample_size)}).`;
  const timeseries = state.timeseries?.points ?? buildFallbackPoints(financial);
  const pipelineSeries = timeseries.map((point) => toAmount(point.pipeline_new_amount));
  const ticketSeries = timeseries.map((point) => toAmount(point.avg_ticket_amount));
  const detectedSeries = timeseries.map((point) => toAmount(point.detected_total_amount));
  const currentGrowthAmount = toAmount(growth.current_amount);
  const previousGrowthAmount = toAmount(growth.previous_amount);
  const pipelineSegments = [
    { label: "Novo", value: toAmount(pipelineByState.NOVO), color: "var(--gold)" },
    {
      label: "Qualificando",
      value: toAmount(pipelineByState.QUALIFICANDO),
      color: "color-mix(in srgb, var(--gold) 72%, white 28%)",
    },
    {
      label: "Negociando",
      value: toAmount(pipelineByState.NEGOCIANDO),
      color: "color-mix(in srgb, var(--green) 70%, var(--gold) 30%)",
    },
  ];
  const latestPoint = timeseries.at(-1)?.date ?? null;

  return (
    <section className="panel fin-panel">
      <div className="panel-heading fin-panel-heading">
        <div>
          <h2>Financeiro</h2>
          <p className="fin-kicker">
            Snapshot operacional com leitura de 30 dias para pipeline, conversão e recebimentos.
          </p>
        </div>
        <div className="fin-header-meta">
          <span className="badge muted">
            atualização {formatTime(state.summaryLoadedAt)}
          </span>
          <span className={`badge ${state.timeseriesError ? "warning" : "muted"}`}>
            {state.timeseriesError ? "histórico parcial" : "histórico 30d"}
          </span>
          <span className="badge muted">valores em R$</span>
        </div>
      </div>
      <div className="fin-grid">
        <article className="fin-card fin-card-hero">
          <div className="fin-card-surface fin-card-surface-hero">
            <div className="fin-card-copy">
              <span className="fin-eyebrow">Pipeline aberto</span>
              <AnimatedCurrency className="fin-hero-value" value={totalPipeline} />
              <p className="fin-card-description">
                Volume esperado ainda em negociação, com trilha diária do pipeline criado.
              </p>
              <div className="fin-inline-metrics">
                <div>
                  <span className="fin-inline-label">janela</span>
                  <strong>{latestPoint ? latestPoint : "30 dias"}</strong>
                </div>
                <div>
                  <span className="fin-inline-label">tendência</span>
                  <DeltaArrow delta={growthDelta} />
                </div>
              </div>
            </div>
            <div className="fin-hero-chart">
              <Sparkline
                fill="color-mix(in srgb, var(--gold) 90%, transparent)"
                points={pipelineSeries}
                stroke="var(--gold)"
                title="Pipeline diário"
              />
            </div>
          </div>
        </article>

        <article className="fin-card fin-card-ring">
          <div className="fin-card-copy">
            <span className="fin-eyebrow">Conversão 30d</span>
            <RadialRing
              detail={`${formatNumber(conversion.numerator)}/${formatNumber(conversion.denominator)} fechadas`}
              label="confirmadas"
              max={100}
              value={conversion.value_percent ?? 0}
            />
          </div>
        </article>

        <article className="fin-card fin-card-breakdown">
          <div className="fin-card-copy">
            <span className="fin-eyebrow">Pipeline por estado</span>
            <strong className="fin-card-value">{formatCurrency(totalPipeline)}</strong>
            <p className="fin-card-description">
              Distribuição do pipeline ainda aberto entre NOVO, QUALIFICANDO e NEGOCIANDO.
            </p>
          </div>
          <StackedBar segments={pipelineSegments} />
        </article>

        <article className="fin-card fin-card-growth">
          <div className="fin-card-copy">
            <span className="fin-eyebrow">Crescimento do pipeline</span>
            <div className="fin-card-heading-row">
              <strong className="fin-card-value">
                {growthDelta === null ? "—" : `${growthDelta >= 0 ? "+" : ""}${formatNumber(growthDelta)}%`}
              </strong>
              <DeltaArrow delta={growthDelta} />
            </div>
            <p className="fin-card-description">
              Comparação entre os últimos 7 dias e a semana anterior.
            </p>
          </div>
          <DualBar
            leftColor="color-mix(in srgb, var(--gold) 70%, white 30%)"
            leftLabel="Semana anterior"
            leftValue={previousGrowthAmount}
            rightColor={growthDelta !== null && growthDelta < 0 ? "var(--warning)" : "var(--green)"}
            rightLabel="Últimos 7 dias"
            rightValue={currentGrowthAmount}
          />
        </article>

        <SparkMetricCard
          className="fin-card-ticket"
          description="Média de expected_amount das conversas criadas na última semana."
          points={ticketSeries}
          title="Ticket médio (7d)"
          value={toAmount(financial.avg_ticket_last_7d.value)}
        />

        <SparkMetricCard
          className="fin-card-detected"
          description="Soma de detected_amount em comprovantes validados nos últimos 7 dias."
          points={detectedSeries}
          stroke="var(--green)"
          value={detectedTotal}
          title="Detectado (7d)"
        />

        <article className="fin-card fin-card-divergence">
          <div className="fin-card-copy">
            <span className="fin-eyebrow">Divergência (7d)</span>
            <div className="fin-card-heading-row">
              <strong className={`fin-card-value ${divergenceValue > 0 ? "warning" : "ok"}`}>
                {formatCurrency(divergenceValue)}
              </strong>
              <span className={`fin-pill ${divergenceValue > 0 ? "warning" : "ok"}`}>
                {divergenceValue > 0 ? "atenção" : "controlado"}
              </span>
            </div>
            <p className="fin-card-description">
              Quanto do volume aprovado virou diferença absoluta entre esperado e detectado.
            </p>
          </div>
          <DualBar
            leftColor="var(--green)"
            leftLabel="Detectado"
            leftValue={detectedTotal}
            rightColor="var(--warning)"
            rightLabel="Gap absoluto"
            rightValue={divergenceValue}
          />
        </article>

        <article className="fin-card fin-card-forecast">
          <div className="fin-card-copy">
            <span className="fin-eyebrow">Receita projetada</span>
            <p className="fin-card-description">{forecastDescription}</p>
          </div>
          <Gauge
            color={hasForecast ? "var(--gold)" : "var(--warning)"}
            detail={`amostra ${formatNumber(forecast.meta.sample_size)}/${formatNumber(forecast.minimum_sample_size)}`}
            max={Math.max(totalPipeline, toAmount(forecast.value), 1)}
            title={hasForecast ? "projeção" : "sem base suficiente"}
            value={hasForecast ? toAmount(forecast.value) : 0}
          />
        </article>
      </div>
    </section>
  );
}

function SparkMetricCard({
  title,
  value,
  description,
  points,
  stroke = "var(--gold)",
  className,
}: {
  title: string;
  value: number;
  description: string;
  points: number[];
  stroke?: string;
  className?: string;
}) {
  return (
    <article className={`fin-card ${className ?? ""}`}>
      <div className="fin-card-copy">
        <span className="fin-eyebrow">{title}</span>
        <AnimatedCurrency className="fin-card-value" value={value} />
        <p className="fin-card-description">{description}</p>
      </div>
      <div className="fin-mini-chart">
        <Sparkline
          fill={stroke === "var(--green)" ? "color-mix(in srgb, var(--green) 80%, transparent)" : "color-mix(in srgb, var(--gold) 80%, transparent)"}
          points={points}
          stroke={stroke}
          title={title}
        />
      </div>
    </article>
  );
}

function FinancialLoadingState() {
  return (
    <section className="panel fin-panel" role="status">
      <div className="panel-heading fin-panel-heading">
        <div>
          <h2>Carregando financeiro</h2>
          <p className="fin-kicker">Montando leituras de pipeline, conversão, divergência e projeção.</p>
        </div>
        <span className="badge muted">buscando</span>
      </div>
      <div className="fin-grid">
        <div className="fin-card fin-card-hero fin-skeleton-card" />
        <div className="fin-card fin-card-ring fin-skeleton-card" />
        <div className="fin-card fin-card-breakdown fin-skeleton-card" />
        <div className="fin-card fin-card-growth fin-skeleton-card" />
        <div className="fin-card fin-card-ticket fin-skeleton-card" />
        <div className="fin-card fin-card-detected fin-skeleton-card" />
        <div className="fin-card fin-card-divergence fin-skeleton-card" />
        <div className="fin-card fin-card-forecast fin-skeleton-card" />
      </div>
    </section>
  );
}

function buildFallbackPoints(financial: DashboardFinancialRead): DashboardFinancialTimeseriesRead["points"] {
  const today = new Date();
  const pipeline = toAmount(financial.open_pipeline_total.value);
  const detected = toAmount(financial.detected_total_last_7d.value);
  const ticket = toAmount(financial.avg_ticket_last_7d.value);
  return Array.from({ length: 30 }, (_, index) => {
    const pointDate = new Date(today);
    pointDate.setDate(today.getDate() - (29 - index));
    const isLast = index === 29;
    return {
      date: pointDate.toISOString().slice(0, 10),
      pipeline_new_amount: isLast ? pipeline : 0,
      detected_total_amount: isLast ? detected : 0,
      avg_ticket_amount: isLast ? ticket : 0,
      conversions_count: 0,
      terminal_count: 0,
    };
  });
}

function toAmount(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  const parsed = typeof value === "number" ? value : Number(value.toString().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function AnimatedCurrency({ value, className }: { value: number; className?: string }) {
  const animated = useCountUp(value, {
    durationMs: 1000,
    decimals: Number.isInteger(value) ? 0 : 2,
  });
  return <strong className={className}>{formatCurrency(animated)}</strong>;
}
