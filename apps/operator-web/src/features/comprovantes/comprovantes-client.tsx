"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { PaginatedEnvelope, ReceiptAnalysisStatus, ReceiptRead } from "@/contracts";
import { bffFetch, type BffFetchError } from "@/features/shared/bff-client";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatRelativeSeconds,
} from "@/features/shared/formatters";
import { receiptAnalysisStatusLabel } from "@/features/shared/labels";

const POLL_INTERVAL_MS = 30_000;
const PAGE_SIZE = 100;

const STATUS_OPTIONS: ReceiptAnalysisStatus[] = [
  "PENDING",
  "VALID",
  "INVALID",
  "UNCERTAIN",
  "NEEDS_REVIEW",
];

type WindowFilter = "7d" | "30d" | "all";

type AmountField = "detected" | "expected";

type Filters = {
  needsReview: "" | "true" | "false";
  status: "" | ReceiptAnalysisStatus;
  window: WindowFilter;
  minAmount: string;
  maxAmount: string;
  amountField: AmountField;
};

const INITIAL_FILTERS: Filters = {
  needsReview: "true",
  status: "",
  window: "30d",
  minAmount: "",
  maxAmount: "",
  amountField: "detected",
};

function parseAmountInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function ComprovantesClient() {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [committed, setCommitted] = useState<Filters>(INITIAL_FILTERS);
  const [envelope, setEnvelope] = useState<PaginatedEnvelope<ReceiptRead> | null>(null);
  const [error, setError] = useState<BffFetchError | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptRead | null>(null);

  const load = useCallback(async (active: Filters) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("page_size", String(PAGE_SIZE));
    if (active.needsReview) params.set("needs_review", active.needsReview);
    if (active.status) params.set("status", active.status);
    const min = parseAmountInput(active.minAmount);
    if (min !== null) params.set("min_amount", String(min));
    const max = parseAmountInput(active.maxAmount);
    if (max !== null) params.set("max_amount", String(max));
    if (min !== null || max !== null) {
      params.set("amount_field", active.amountField);
    }
    const result = await bffFetch<PaginatedEnvelope<ReceiptRead>>(
      `/api/operator/receipts?${params.toString()}`,
    );
    setEnvelope(result.data);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(committed);
    const id = window.setInterval(() => {
      void load(committed);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [committed, load]);

  const visibleItems = useMemo(() => {
    const items = envelope?.items ?? [];
    return items.filter((receipt) => isInsideWindow(receipt.created_at, committed.window));
  }, [committed.window, envelope]);

  const stats = useMemo(() => summarizeReceipts(visibleItems), [visibleItems]);

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
      setCommitted(filters);
    },
    [amountRangeError, filters],
  );

  const onReset = useCallback(() => {
    setFilters(INITIAL_FILTERS);
    setCommitted(INITIAL_FILTERS);
  }, []);

  const hasLoaded = envelope !== null || error !== null;
  const filtersActive = !sameFilters(committed, INITIAL_FILTERS);
  const canReset = filtersActive || !sameFilters(filters, INITIAL_FILTERS);

  return (
    <div className="section-stack">
      <section className={stats.needsReview > 0 ? "operations-hero warning" : "operations-hero ok"}>
        <div className="operations-hero-copy">
          <span className="badge muted">Fila de revisão</span>
          <h2>
            {stats.needsReview > 0
              ? "Comprovantes aguardando validação humana"
              : "Nenhum comprovante crítico aguardando revisão"}
          </h2>
          <p>
            Pagamentos, contratos, propostas assinadas e documentos enviados pelos leads aparecem
            aqui para reduzir risco antes de avançar a operação.
          </p>
        </div>
        <div className="operations-hero-actions">
          <a className="button" href="#fila-comprovantes">
            Revisar fila
          </a>
          <Link className="button secondary" href="/conversas">
            Abrir conversas
          </Link>
        </div>
      </section>

      <section className="metric-grid compact" aria-label="Resumo dos comprovantes">
        <MetricCard label="Na fila" value={stats.total} detail="no filtro atual" />
        <MetricCard label="Revisão humana" value={stats.needsReview} detail="precisam de decisão" warning={stats.needsReview > 0} />
        <MetricCard label="Baixa confiança" value={stats.lowConfidence} detail="IA abaixo de 80%" warning={stats.lowConfidence > 0} />
        <MetricCard label="Divergentes" value={stats.invalid} detail="valor ou leitura incoerente" danger={stats.invalid > 0} />
      </section>

      <section className="panel" id="fila-comprovantes">
        <div className="panel-heading">
          <div>
            <h2>Fila de revisão</h2>
            <p className="section-subtitle">
              Revise evidências recebidas dos leads antes de confirmar pagamento, contrato ou proposta.
            </p>
          </div>
          <span className={loading ? "badge warning" : "badge muted"}>
            {loading ? "Atualizando" : `${formatNumber(visibleItems.length)} visíveis`}
          </span>
        </div>

        <form className="filter-bar" onSubmit={onSubmit} aria-label="Filtros de comprovantes">
          <label>
            <span>Revisão humana</span>
            <select
              value={filters.needsReview}
              onChange={(event) =>
                setFilters({ ...filters, needsReview: event.target.value as Filters["needsReview"] })
              }
            >
              <option value="">Todos</option>
              <option value="true">Precisa revisar</option>
              <option value="false">Sem revisão pendente</option>
            </select>
          </label>
          <label>
            <span>Status da análise</span>
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters({ ...filters, status: event.target.value as Filters["status"] })
              }
            >
              <option value="">Todos</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {receiptAnalysisStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Janela</span>
            <select
              value={filters.window}
              onChange={(event) =>
                setFilters({ ...filters, window: event.target.value as Filters["window"] })
              }
            >
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="all">Tudo</option>
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
          <fieldset className="form-field" aria-label="Comparar por">
            <span>Comparar por</span>
            <div className="inline-actions">
              <label style={{ display: "inline-flex", gap: "0.25rem", alignItems: "center" }}>
                <input
                  type="radio"
                  name="amount_field"
                  value="detected"
                  checked={filters.amountField === "detected"}
                  onChange={() => setFilters({ ...filters, amountField: "detected" })}
                />
                <span>Detectado</span>
              </label>
              <label style={{ display: "inline-flex", gap: "0.25rem", alignItems: "center" }}>
                <input
                  type="radio"
                  name="amount_field"
                  value="expected"
                  checked={filters.amountField === "expected"}
                  onChange={() => setFilters({ ...filters, amountField: "expected" })}
                />
                <span>Esperado</span>
              </label>
            </div>
          </fieldset>
          <div className="form-field">
            <span>&nbsp;</span>
            <div className="inline-actions">
              <button className="button" type="submit" disabled={Boolean(amountRangeError)}>
                Aplicar filtros
              </button>
              <button className="button secondary" type="button" onClick={onReset} disabled={!canReset}>
                Limpar
              </button>
            </div>
          </div>
          {amountRangeError ? (
            <div className="panel-notice warning" role="alert">
              {amountRangeError}
            </div>
          ) : null}
        </form>

        {error ? <div className="panel-notice">{error.message}</div> : null}

        {!hasLoaded ? (
          <p className="empty-state">Carregando comprovantes...</p>
        ) : visibleItems.length === 0 ? (
          <div className="empty-state-card">
            <span className="empty-state-icon" aria-hidden="true" />
            <div className="empty-state-copy">
              <strong>Nenhum comprovante aguardando revisão</strong>
              <p>
                Quando leads enviarem comprovantes, contratos, propostas assinadas ou documentos
                importantes, eles aparecerão aqui para validação.
              </p>
            </div>
            <Link className="button secondary empty-state-action" href="/conversas">
              Ver conversas
            </Link>
          </div>
        ) : (
          <div className="receipt-review-list">
            {visibleItems.map((receipt) => (
              <ReceiptReviewItem
                key={receipt.id}
                receipt={receipt}
                onReview={() => setSelectedReceipt(receipt)}
              />
            ))}
          </div>
        )}
      </section>

      {selectedReceipt ? (
        <ReceiptReviewModal receipt={selectedReceipt} onClose={() => setSelectedReceipt(null)} />
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  warning = false,
  danger = false,
}: {
  label: string;
  value: number;
  detail: string;
  warning?: boolean;
  danger?: boolean;
}) {
  return (
    <div className={danger ? "metric compact danger" : warning ? "metric compact warning" : "metric compact"}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{formatNumber(value)}</span>
      <span className="metric-sub">{detail}</span>
    </div>
  );
}

function ReceiptReviewItem({ receipt, onReview }: { receipt: ReceiptRead; onReview: () => void }) {
  const clientName = receipt.client.display_name || receipt.client.whatsapp_jid;
  const confidence = confidenceValue(receipt);
  const amountTone = amountComparisonTone(
    receipt.detected_amount,
    receipt.expected_amount,
    receipt.tolerance_applied,
  );

  return (
    <article className={receipt.needs_review ? "receipt-review-item warning" : "receipt-review-item"}>
      <DocumentPreview receipt={receipt} />
      <div className="receipt-review-main">
        <div className="receipt-review-header">
          <div>
            <h3>{clientName}</h3>
            <p>{receipt.client.whatsapp_jid}</p>
          </div>
          <AnalysisBadge status={receipt.analysis_status} />
        </div>
        <div className="receipt-review-facts">
          <span>
            <strong>Valor detectado</strong>
            <em className={amountTone ? `${amountTone}-cell` : ""}>{formatCurrency(receipt.detected_amount)}</em>
          </span>
          <span>
            <strong>Confianca da IA</strong>
            <em>{formatConfidence(confidence)}</em>
          </span>
          <span>
            <strong>Recebido</strong>
            <em title={formatDateTime(receipt.created_at)}>{formatRelativeSeconds(receipt.created_at)}</em>
          </span>
        </div>
        <div className="receipt-review-actions">
          <Link className="link-pill" href={receipt.drilldown_href}>
            Conversa relacionada
          </Link>
          <button className="button" type="button" onClick={onReview}>
            Revisar
          </button>
        </div>
      </div>
    </article>
  );
}

function ReceiptReviewModal({ receipt, onClose }: { receipt: ReceiptRead; onClose: () => void }) {
  const clientName = receipt.client.display_name || receipt.client.whatsapp_jid;
  const confidence = confidenceValue(receipt);
  const extractedEntries = extractedDataEntries(receipt);

  return (
    <div className="modal-backdrop review-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="review-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Revisar comprovante"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-heading">
          <div>
            <h2>Revisar comprovante</h2>
            <p className="section-subtitle">{clientName}</p>
          </div>
          <button className="button secondary" type="button" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="review-modal-grid">
          <DocumentPreview receipt={receipt} large />

          <section className="review-modal-section">
            <h3>Dados extraídos</h3>
            <dl className="detail-list">
              {extractedEntries.map((entry) => (
                <div key={entry.label}>
                  <dt>{entry.label}</dt>
                  <dd>{entry.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="review-modal-section">
            <h3>Contexto da conversa</h3>
            <dl className="detail-list">
              <div>
                <dt>Lead</dt>
                <dd>{clientName}</dd>
              </div>
              <div>
                <dt>Conversa</dt>
                <dd>{receipt.conversation_id}</dd>
              </div>
              <div>
                <dt>Recebido em</dt>
                <dd>{formatDateTime(receipt.created_at)}</dd>
              </div>
              <div>
                <dt>Confiança da IA</dt>
                <dd>{formatConfidence(confidence)}</dd>
              </div>
            </dl>
            <div className="button-row">
              <button className="button" type="button" disabled title="Ação depende do endpoint de revisão">
                Aprovar
              </button>
              <button className="button danger" type="button" disabled title="Ação depende do endpoint de revisão">
                Rejeitar
              </button>
              <button className="button secondary" type="button" disabled title="Ação depende do endpoint de revisão">
                Pedir novo comprovante
              </button>
              <Link className="button secondary" href={receipt.drilldown_href}>
                Abrir conversa
              </Link>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function DocumentPreview({ receipt, large = false }: { receipt: ReceiptRead; large?: boolean }) {
  return (
    <div className={large ? "document-preview large" : "document-preview"}>
      <span>{documentKind(receipt)}</span>
      <strong>{formatCurrency(receipt.detected_amount)}</strong>
      <em>{receiptAnalysisStatusLabel(receipt.analysis_status)}</em>
    </div>
  );
}

function AnalysisBadge({ status }: { status: ReceiptAnalysisStatus }) {
  if (status === "INVALID") {
    return <span className="badge danger">{receiptAnalysisStatusLabel(status)}</span>;
  }
  if (status === "UNCERTAIN" || status === "NEEDS_REVIEW" || status === "PENDING") {
    return <span className="badge warning">{receiptAnalysisStatusLabel(status)}</span>;
  }
  return <span className="badge ok">{receiptAnalysisStatusLabel(status)}</span>;
}

function summarizeReceipts(items: ReceiptRead[]) {
  return {
    total: items.length,
    needsReview: items.filter((receipt) => receipt.needs_review).length,
    lowConfidence: items.filter((receipt) => {
      const confidence = confidenceValue(receipt);
      return confidence !== null && confidence < 0.8;
    }).length,
    invalid: items.filter((receipt) => receipt.analysis_status === "INVALID").length,
  };
}

function extractedDataEntries(receipt: ReceiptRead): { label: string; value: string }[] {
  return [
    { label: "Valor detectado", value: formatCurrency(receipt.detected_amount) },
    { label: "Valor esperado", value: formatCurrency(receipt.expected_amount) },
    { label: "Tolerância aplicada", value: formatCurrency(receipt.tolerance_applied) },
    { label: "Status da análise", value: receiptAnalysisStatusLabel(receipt.analysis_status) },
    { label: "Mensagem", value: receipt.message_id },
  ];
}

function documentKind(receipt: ReceiptRead): string {
  const kind = receipt.metadata_json.document_type ?? receipt.metadata_json.kind;
  return typeof kind === "string" && kind.trim() ? kind : "Documento recebido";
}

function confidenceValue(receipt: ReceiptRead): number | null {
  const value =
    receipt.metadata_json.confidence ??
    receipt.metadata_json.analysis_confidence ??
    receipt.metadata_json.ocr_confidence;
  if (typeof value === "number") return value > 1 ? value / 100 : value;
  if (typeof value === "string") {
    const parsed = Number(value.replace("%", "").replace(",", "."));
    if (!Number.isNaN(parsed)) return parsed > 1 ? parsed / 100 : parsed;
  }
  return null;
}

function formatConfidence(value: number | null): string {
  if (value === null) return "Não informada";
  return `${Math.round(value * 100)}%`;
}

function isInsideWindow(iso: string, windowFilter: WindowFilter): boolean {
  if (windowFilter === "all") return true;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return true;
  const days = windowFilter === "7d" ? 7 : 30;
  return Date.now() - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

function amountComparisonTone(
  detected: string | number | null,
  expected: string | number | null,
  tolerance: string | number | null,
): "warning" | "danger" | null {
  const detectedNumber = parseAmount(detected);
  const expectedNumber = parseAmount(expected);
  if (detectedNumber === null || expectedNumber === null) return null;
  const diff = Math.abs(detectedNumber - expectedNumber);
  if (diff === 0) return null;
  const toleranceNumber = Math.abs(parseAmount(tolerance) ?? 0);
  return diff > toleranceNumber ? "danger" : "warning";
}

function parseAmount(value: string | number | null): number | null {
  if (value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value.replace(",", "."));
  return Number.isNaN(parsed) ? null : parsed;
}

function sameFilters(a: Filters, b: Filters): boolean {
  return (
    a.needsReview === b.needsReview &&
    a.status === b.status &&
    a.window === b.window &&
    a.minAmount === b.minAmount &&
    a.maxAmount === b.maxAmount &&
    a.amountField === b.amountField
  );
}
