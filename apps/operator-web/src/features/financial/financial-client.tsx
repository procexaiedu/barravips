"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type {
  DashboardFinancialTimeseriesRead,
  FinancialSnapshotRead,
  FinancialWindowKey,
  PaginatedEnvelope,
  ReceiptRead,
} from "@/contracts";
import { bffFetch, type BffFetchError } from "@/features/shared/bff-client";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatTime,
} from "@/features/shared/formatters";

import { Donut, Funnel, LineChart } from "./financial-visuals";

const POLL_INTERVAL_MS = 30_000;
const DEFAULT_WINDOW: FinancialWindowKey = "30d";
const DIVERGENCE_PAGE_SIZE = 50;
const TOP_DIVERGENCES = 3;

const WINDOW_OPTIONS: { value: FinancialWindowKey; label: string }[] = [
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
];

const WINDOW_PHRASE: Record<FinancialWindowKey, string> = {
  "7d": "nos últimos 7 dias",
  "30d": "nos últimos 30 dias",
  "90d": "nos últimos 90 dias",
};

const STATE_COLORS: Record<string, string> = {
  NOVO: "var(--gold)",
  QUALIFICANDO: "color-mix(in srgb, var(--gold) 70%, white 30%)",
  NEGOCIANDO: "color-mix(in srgb, var(--green) 70%, var(--gold) 30%)",
};

const STATE_LABELS: Record<string, string> = {
  NOVO: "Novo",
  QUALIFICANDO: "Qualificando",
  NEGOCIANDO: "Negociando",
};

const RECEIPT_STATUS_COLORS: Record<string, string> = {
  VALID: "var(--green)",
  UNCERTAIN: "var(--warning)",
  NEEDS_REVIEW: "color-mix(in srgb, var(--warning) 60%, var(--muted) 40%)",
  INVALID: "var(--red)",
  PENDING: "color-mix(in srgb, var(--muted) 70%, var(--border) 30%)",
};

const RECEIPT_STATUS_LABELS: Record<string, string> = {
  VALID: "Confere",
  UNCERTAIN: "Em dúvida",
  NEEDS_REVIEW: "Aguardando revisão",
  INVALID: "Não bate",
  PENDING: "Aguardando análise",
};

const RECEIPT_STATUS_ORDER = [
  "VALID",
  "UNCERTAIN",
  "NEEDS_REVIEW",
  "INVALID",
  "PENDING",
] as const;

type SnapshotState = {
  snapshot: FinancialSnapshotRead | null;
  snapshotError: BffFetchError | null;
  pendingReviewCount: number | null;
  divergentCount: number | null;
  topDivergences: ReceiptRead[];
  timeseries: DashboardFinancialTimeseriesRead | null;
  loadedAt: string | null;
};

const INITIAL_STATE: SnapshotState = {
  snapshot: null,
  snapshotError: null,
  pendingReviewCount: null,
  divergentCount: null,
  topDivergences: [],
  timeseries: null,
  loadedAt: null,
};

export function FinancialClient() {
  const [activeWindow, setActiveWindow] =
    useState<FinancialWindowKey>(DEFAULT_WINDOW);
  const [state, setState] = useState<SnapshotState>(INITIAL_STATE);
  const [firstLoad, setFirstLoad] = useState(true);
  const [showDivergent, setShowDivergent] = useState(false);

  const load = useCallback(async (win: FinancialWindowKey) => {
    const [snapshot, pending, divergent, divergentList, timeseries] =
      await Promise.all([
        bffFetch<FinancialSnapshotRead>(
          `/api/operator/dashboard/financial?window=${win}`,
        ),
        bffFetch<PaginatedEnvelope<ReceiptRead>>(
          "/api/operator/receipts?needs_review=true&page_size=1",
        ),
        bffFetch<PaginatedEnvelope<ReceiptRead>>(
          `/api/operator/receipts?is_divergent=true&window=${win}&page_size=1`,
        ),
        bffFetch<PaginatedEnvelope<ReceiptRead>>(
          `/api/operator/receipts?is_divergent=true&window=${win}&page_size=10`,
        ),
        bffFetch<DashboardFinancialTimeseriesRead>(
          `/api/operator/dashboard/financial/timeseries?window=${win}`,
        ),
      ]);
    const topDivergences = (divergentList.data?.items ?? [])
      .map((receipt) => ({ receipt, diff: divergenceMagnitude(receipt) }))
      .sort((a, b) => b.diff - a.diff)
      .slice(0, TOP_DIVERGENCES)
      .map((entry) => entry.receipt);
    setState({
      snapshot: snapshot.data,
      snapshotError: snapshot.error,
      pendingReviewCount: pending.data?.total ?? null,
      divergentCount: divergent.data?.total ?? null,
      topDivergences,
      timeseries: timeseries.data,
      loadedAt: new Date().toISOString(),
    });
    setFirstLoad(false);
  }, []);

  useEffect(() => {
    void load(activeWindow);
    const id = window.setInterval(() => {
      void load(activeWindow);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [activeWindow, load]);

  if (firstLoad) {
    return <FinancialLoadingState />;
  }

  if (
    state.snapshotError &&
    state.snapshotError.status === 0 &&
    !state.snapshot
  ) {
    return (
      <div className="bff-outage" role="alert">
        <strong>Sem conexão com o servidor</strong>
        <span>
          Tentamos de novo em cerca de{" "}
          {Math.round(POLL_INTERVAL_MS / 1000)} segundos.
        </span>
      </div>
    );
  }

  if (state.snapshotError && !state.snapshot) {
    return (
      <section className="panel error-panel">
        <div className="panel-heading">
          <h2>Financeiro</h2>
          <span className="badge danger">Erro</span>
        </div>
        <p>{state.snapshotError.message}</p>
      </section>
    );
  }

  const snapshot = state.snapshot;
  if (!snapshot) {
    return (
      <section className="panel">
        <div className="panel-heading">
          <h2>Financeiro</h2>
          <span className="badge muted">sem dados</span>
        </div>
        <p className="empty-state">
          Volte após a 1ª venda fechada para acompanhar o caixa.
        </p>
      </section>
    );
  }

  const pendingCount = state.pendingReviewCount ?? 0;
  const divergentCount = state.divergentCount ?? 0;

  const inNegotiationValue = toAmount(snapshot.open_pipeline_total.value);
  const inNegotiationCount = snapshot.open_pipeline_total.meta.sample_size;
  const pipelineByState = snapshot.open_pipeline_by_state.amounts;
  const pipelineSegments = ["NOVO", "QUALIFICANDO", "NEGOCIANDO"].map(
    (key) => ({
      label: STATE_LABELS[key] ?? key,
      value: toAmount(pipelineByState[key]),
      color: STATE_COLORS[key] ?? "var(--gold)",
    }),
  );

  const confirmedValue = toAmount(snapshot.detected_total.value);
  const confirmedCount = snapshot.detected_total.meta.sample_size;
  const matchRate = snapshot.receipt_match_rate.value_percent;
  const paymentLag = snapshot.payment_lag.average_days;

  const divergenceValue = toAmount(snapshot.divergence_abs.value);
  const divergenceSample = snapshot.divergence_abs.meta.sample_size;
  const aging = snapshot.divergence_aging;
  const largest = snapshot.largest_divergence;

  const forecast = snapshot.projected_revenue;
  const hasForecast = forecast.value !== null && forecast.value !== undefined;
  const forecastSample = forecast.meta.sample_size;
  const forecastMissing = forecast.minimum_sample_size - forecastSample;

  const statusSegments = RECEIPT_STATUS_ORDER.map((key) => ({
    label: RECEIPT_STATUS_LABELS[key],
    value: toAmount(snapshot.receipts_by_status.amounts[key]),
    color: RECEIPT_STATUS_COLORS[key],
  })).filter((segment) => segment.value > 0);
  const statusTotalCount = snapshot.receipts_by_status.meta.sample_size;

  const funnel = snapshot.revenue_funnel;
  const funnelStages = [
    {
      label: "Em negociação",
      value: toAmount(funnel.in_negotiation_amount),
      color: "var(--gold)",
      hint: "Pipeline aberto agora",
    },
    {
      label: "Conversas fechadas",
      value: toAmount(funnel.closed_amount),
      color: "color-mix(in srgb, var(--gold) 60%, var(--green) 40%)",
      hint: `Confirmadas ${WINDOW_PHRASE[activeWindow]}`,
    },
    {
      label: "Comprovante recebido",
      value: toAmount(funnel.receipt_received_amount),
      color: "color-mix(in srgb, var(--green) 65%, var(--gold) 35%)",
      hint: "Valor que chegou em comprovantes",
    },
    {
      label: "Valor confere",
      value: toAmount(funnel.receipt_match_amount),
      color: "var(--green)",
      hint: "Comprovantes validados sem diferença",
    },
  ];

  const timeseriesPoints = state.timeseries?.points ?? [];
  const expectedSeries = timeseriesPoints.map((point) =>
    toAmount(point.pipeline_new_amount),
  );
  const detectedSeries = timeseriesPoints.map((point) =>
    toAmount(point.detected_total_amount),
  );
  const firstDayLabel = timeseriesPoints[0]?.date ?? null;
  const lastDayLabel =
    timeseriesPoints[timeseriesPoints.length - 1]?.date ?? null;
  const hasSeries = expectedSeries.some((v) => v > 0) || detectedSeries.some((v) => v > 0);

  return (
    <section className="panel fin-panel">
      <div className="panel-heading fin-panel-heading">
        <div>
          <h2>Financeiro</h2>
          <p className="fin-kicker">
            Quanto entrou, quanto falta e o que precisa de ação{" "}
            {WINDOW_PHRASE[activeWindow]}.
          </p>
        </div>
        <div className="fin-header-meta">
          <span className="badge muted">
            atualização {formatTime(state.loadedAt)}
          </span>
          <div
            className="fin-window-toggle"
            role="tablist"
            aria-label="Janela de tempo"
          >
            {WINDOW_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={activeWindow === option.value}
                className={
                  activeWindow === option.value
                    ? "queue-tab active"
                    : "queue-tab"
                }
                onClick={() => setActiveWindow(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="fin-inbox" aria-label="Pendências">
        <Link href="/comprovantes" className="fin-inbox-card">
          <span className="fin-eyebrow">Comprovantes para revisar</span>
          <strong className="fin-inbox-value">
            {formatNumber(pendingCount)}
          </strong>
          <span className="fin-inbox-detail">
            {pendingCount === 0
              ? "Nada na fila"
              : pendingCount === 1
                ? "1 aguardando você"
                : `${formatNumber(pendingCount)} aguardando você`}
          </span>
        </Link>

        <button
          type="button"
          className="fin-inbox-card fin-inbox-card-button"
          onClick={() => setShowDivergent(true)}
          disabled={divergentCount === 0}
          aria-disabled={divergentCount === 0}
        >
          <span className="fin-eyebrow">Diferenças nos comprovantes</span>
          <strong
            className={`fin-inbox-value ${divergentCount > 0 ? "warning" : "ok"}`}
          >
            {formatNumber(divergentCount)}
          </strong>
          <span className="fin-inbox-detail">
            {divergentCount === 0
              ? "Tudo bate"
              : divergentCount === 1
                ? "1 valor não bateu — abrir lista"
                : `${formatNumber(divergentCount)} valores não bateram — abrir lista`}
          </span>
        </button>
      </div>

      <div className="fin-cards">
        <article className="fin-card fin-card-stack">
          <span className="fin-eyebrow">Em negociação</span>
          <div className="fin-card-row">
            <div>
              <strong className="fin-card-value">
                {formatCurrency(inNegotiationValue)}
              </strong>
              <p className="fin-card-description">
                {inNegotiationCount === 0
                  ? "Nenhuma conversa em aberto."
                  : `${formatNumber(inNegotiationCount)} conversa${inNegotiationCount === 1 ? "" : "s"} aguardando fechamento.`}
              </p>
            </div>
          </div>
          {inNegotiationValue > 0 ? (
            <Donut
              segments={pipelineSegments}
              centerLabel="total"
              centerValue={formatCurrency(inNegotiationValue)}
            />
          ) : (
            <p className="fin-card-description">
              Volte quando uma nova conversa começar.
            </p>
          )}
        </article>

        <article className="fin-card fin-card-stack">
          <span className="fin-eyebrow">Caixa confirmado</span>
          <div className="fin-card-row">
            <div>
              <strong className="fin-card-value">
                {formatCurrency(confirmedValue)}
              </strong>
              <p className="fin-card-description">
                Valor recebido em comprovantes validados{" "}
                {WINDOW_PHRASE[activeWindow]}.
              </p>
            </div>
            <div className="fin-card-side-stats">
              <div>
                <span className="fin-card-side-stat-label">
                  Comprovantes que conferem
                </span>
                <span className="fin-card-side-stat-value">
                  {matchRate === null
                    ? "—"
                    : `${formatNumber(matchRate)}% (${formatNumber(snapshot.receipt_match_rate.numerator)}/${formatNumber(snapshot.receipt_match_rate.denominator)})`}
                </span>
              </div>
              <div>
                <span className="fin-card-side-stat-label">
                  Tempo médio até pagar
                </span>
                <span className="fin-card-side-stat-value">
                  {paymentLag === null
                    ? "Sem amostra"
                    : `${formatNumber(Math.round(paymentLag))} dia${Math.round(paymentLag) === 1 ? "" : "s"}`}
                </span>
              </div>
              <div>
                <span className="fin-card-side-stat-label">
                  Comprovantes confirmados
                </span>
                <span className="fin-card-side-stat-value">
                  {formatNumber(confirmedCount)}
                </span>
              </div>
            </div>
          </div>
        </article>

        <article className="fin-card fin-card-stack fin-card-wide">
          <span className="fin-eyebrow">Esperado vs. recebido por dia</span>
          <p className="fin-card-description">
            Linha dourada: valor que entrou em negociação a cada dia. Linha
            verde: valor que chegou em comprovantes validados.
          </p>
          {hasSeries ? (
            <LineChart
              series={[
                {
                  label: "Esperado (pipeline)",
                  points: expectedSeries,
                  color: "var(--gold)",
                  fill: true,
                },
                {
                  label: "Recebido (comprovantes)",
                  points: detectedSeries,
                  color: "var(--green)",
                  fill: true,
                },
              ]}
              labels={
                firstDayLabel && lastDayLabel
                  ? [firstDayLabel, lastDayLabel]
                  : undefined
              }
            />
          ) : (
            <p className="empty-state">
              Sem movimento {WINDOW_PHRASE[activeWindow]}. Quando entrar
              negociação ou chegar comprovante, o gráfico aparece aqui.
            </p>
          )}
        </article>

        <article className="fin-card fin-card-stack">
          <span className="fin-eyebrow">Funil de receita (R$)</span>
          <p className="fin-card-description">
            Quanto do que está em negociação vira caixa, em valor.
          </p>
          <Funnel stages={funnelStages} />
        </article>

        <article className="fin-card fin-card-stack">
          <span className="fin-eyebrow">Caixa por status do comprovante</span>
          <p className="fin-card-description">
            {statusTotalCount === 0
              ? `Nenhum comprovante recebido ${WINDOW_PHRASE[activeWindow]}.`
              : `Como os ${formatNumber(statusTotalCount)} comprovante${statusTotalCount === 1 ? "" : "s"} ${WINDOW_PHRASE[activeWindow]} foram classificados.`}
          </p>
          {statusSegments.length > 0 ? (
            <Donut segments={statusSegments} />
          ) : (
            <p className="empty-state">Sem comprovantes para classificar.</p>
          )}
        </article>

        <article className="fin-card fin-card-stack">
          <span className="fin-eyebrow">Diferenças nos comprovantes</span>
          <div className="fin-card-row">
            <div>
              <strong
                className={`fin-card-value ${divergenceValue > 0 ? "warning" : "ok"}`}
              >
                {formatCurrency(divergenceValue)}
              </strong>
              <p className="fin-card-description">
                {divergenceSample === 0
                  ? "Nenhum comprovante para comparar ainda."
                  : divergentCount === 0
                    ? "Todos os valores bateram com o combinado."
                    : "Soma das diferenças entre o combinado e o que chegou."}
              </p>
            </div>
            <span
              className={`fin-aging-pill ${aging.count > 0 ? "" : "ok"}`}
              title={`Diferenças com mais de ${aging.threshold_days} dias sem resolução`}
            >
              {aging.count === 0
                ? `Nenhuma com mais de ${aging.threshold_days} dias`
                : `${formatNumber(aging.count)} há ${aging.threshold_days}+ dias · ${formatCurrency(toAmount(aging.total_amount))}`}
            </span>
          </div>

          {largest ? (
            <div className="fin-largest-divergence">
              <div className="fin-largest-divergence-head">
                <span className="fin-eyebrow">Maior diferença</span>
                <span className="fin-largest-divergence-diff">
                  {formatCurrency(toAmount(largest.diff_abs))}
                </span>
              </div>
              <span className="fin-largest-divergence-name">
                {largest.client_display_name ?? "Cliente"}
              </span>
              <span className="fin-largest-divergence-detail">
                Esperado {formatCurrency(largest.expected_amount)} · Recebido{" "}
                {formatCurrency(largest.detected_amount)} · há{" "}
                {formatNumber(largest.age_days)} dia
                {largest.age_days === 1 ? "" : "s"}
              </span>
              <Link className="link-pill" href={largest.drilldown_href}>
                Abrir conversa
              </Link>
            </div>
          ) : null}

          {state.topDivergences.length > 0 ? (
            <div className="fin-card-stack">
              <span className="fin-eyebrow">Top diferenças</span>
              <ul className="fin-donut-legend">
                {state.topDivergences.map((receipt) => {
                  const expected = toAmountOrNull(receipt.expected_amount);
                  const detected = toAmountOrNull(receipt.detected_amount);
                  const diff =
                    expected !== null && detected !== null
                      ? Math.abs(detected - expected)
                      : 0;
                  const name =
                    receipt.client.display_name ||
                    receipt.client.whatsapp_jid;
                  return (
                    <li
                      key={receipt.id}
                      className="fin-donut-legend-item"
                    >
                      <span
                        aria-hidden="true"
                        className="fin-donut-dot"
                        style={
                          {
                            ["--dot-color" as string]: "var(--warning)",
                          } as React.CSSProperties
                        }
                      />
                      <div className="fin-donut-legend-copy">
                        <Link
                          className="fin-donut-legend-label"
                          href={receipt.drilldown_href}
                        >
                          {name}
                        </Link>
                        <span className="fin-donut-legend-meta">
                          {formatCurrency(diff)} de diferença ·{" "}
                          {formatDateTime(receipt.created_at)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {divergentCount > 0 ? (
            <button
              type="button"
              className="link-pill"
              onClick={() => setShowDivergent(true)}
            >
              Ver todas ({formatNumber(divergentCount)})
            </button>
          ) : null}
        </article>

        <article className="fin-card fin-card-stack">
          <span className="fin-eyebrow">Receita projetada</span>
          {hasForecast ? (
            <>
              <strong className="fin-card-value">
                {formatCurrency(toAmount(forecast.value))}
              </strong>
              <p className="fin-card-description">
                Estimativa baseada no que está em negociação e na taxa de
                fechamento dos últimos 30 dias.
              </p>
            </>
          ) : (
            <>
              <strong className="fin-card-value muted">—</strong>
              <p className="fin-card-description">
                {forecastSample === 0
                  ? "Volte após a 1ª venda fechada."
                  : `Faltam ${formatNumber(Math.max(forecastMissing, 1))} venda${forecastMissing === 1 ? "" : "s"} para calcular com segurança.`}
              </p>
            </>
          )}
        </article>
      </div>

      {showDivergent ? (
        <DivergenceModal
          activeWindow={activeWindow}
          onClose={() => setShowDivergent(false)}
        />
      ) : null}
    </section>
  );
}

function FinancialLoadingState() {
  return (
    <section className="panel fin-panel" role="status">
      <div className="panel-heading fin-panel-heading">
        <div>
          <h2>Carregando financeiro</h2>
          <p className="fin-kicker">Buscando caixa, pendências e diferenças.</p>
        </div>
        <span className="badge muted">buscando</span>
      </div>
      <div className="fin-inbox">
        <div className="fin-inbox-card fin-skeleton-card" />
        <div className="fin-inbox-card fin-skeleton-card" />
      </div>
      <div className="fin-cards">
        <div className="fin-card fin-skeleton-card" />
        <div className="fin-card fin-skeleton-card" />
        <div className="fin-card fin-card-wide fin-skeleton-card" />
        <div className="fin-card fin-skeleton-card" />
        <div className="fin-card fin-skeleton-card" />
        <div className="fin-card fin-skeleton-card" />
        <div className="fin-card fin-skeleton-card" />
      </div>
    </section>
  );
}

type DivergenceState = {
  envelope: PaginatedEnvelope<ReceiptRead> | null;
  error: BffFetchError | null;
  loading: boolean;
};

function DivergenceModal({
  activeWindow,
  onClose,
}: {
  activeWindow: FinancialWindowKey;
  onClose: () => void;
}) {
  const [state, setState] = useState<DivergenceState>({
    envelope: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await bffFetch<PaginatedEnvelope<ReceiptRead>>(
        `/api/operator/receipts?is_divergent=true&window=${activeWindow}&page_size=${DIVERGENCE_PAGE_SIZE}`,
      );
      if (cancelled) {
        return;
      }
      setState({
        envelope: result.data,
        error: result.error,
        loading: false,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [activeWindow]);

  const items = state.envelope?.items ?? [];
  const total = state.envelope?.total ?? 0;

  return (
    <div
      className="modal-backdrop review-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        className="review-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Comprovantes com diferença"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-heading">
          <div>
            <h2>Diferenças nos comprovantes</h2>
            <p className="section-subtitle">
              {state.loading
                ? "Carregando..."
                : total === 0
                  ? `Sem diferenças ${WINDOW_PHRASE[activeWindow]}.`
                  : `${formatNumber(total)} comprovante${total === 1 ? "" : "s"} ${WINDOW_PHRASE[activeWindow]}.`}
            </p>
          </div>
          <button className="button secondary" type="button" onClick={onClose}>
            Fechar
          </button>
        </div>

        {state.error ? (
          <div className="panel-notice">{state.error.message}</div>
        ) : null}

        {state.loading ? null : items.length === 0 ? (
          <p className="empty-state">
            Tudo bate {WINDOW_PHRASE[activeWindow]}. Quando um comprovante
            chegar com valor diferente do combinado, ele aparece aqui.
          </p>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table inbox-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Valor esperado</th>
                  <th>Valor recebido</th>
                  <th>Diferença</th>
                  <th>Recebido em</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {items.map((receipt) => (
                  <DivergenceRow key={receipt.id} receipt={receipt} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function DivergenceRow({ receipt }: { receipt: ReceiptRead }) {
  const expected = toAmountOrNull(receipt.expected_amount);
  const detected = toAmountOrNull(receipt.detected_amount);
  const diff =
    expected !== null && detected !== null ? detected - expected : null;
  const clientName =
    receipt.client.display_name || receipt.client.whatsapp_jid;
  return (
    <tr>
      <td>{clientName}</td>
      <td>{formatCurrency(receipt.expected_amount)}</td>
      <td>{formatCurrency(receipt.detected_amount)}</td>
      <td>
        {diff === null ? (
          "—"
        ) : (
          <span className={diff < 0 ? "fin-diff-short" : "fin-diff-extra"}>
            {diff > 0 ? "+" : ""}
            {formatCurrency(diff)}
          </span>
        )}
      </td>
      <td>{formatDateTime(receipt.created_at)}</td>
      <td>
        <Link className="link-pill" href={receipt.drilldown_href}>
          Abrir conversa
        </Link>
      </td>
    </tr>
  );
}

function divergenceMagnitude(receipt: ReceiptRead): number {
  const expected = toAmountOrNull(receipt.expected_amount);
  const detected = toAmountOrNull(receipt.detected_amount);
  if (expected === null || detected === null) {
    return 0;
  }
  return Math.abs(detected - expected);
}

function toAmount(value: string | number | null | undefined): number {
  const parsed = toAmountOrNull(value);
  return parsed ?? 0;
}

function toAmountOrNull(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed =
    typeof value === "number"
      ? value
      : Number(value.toString().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
