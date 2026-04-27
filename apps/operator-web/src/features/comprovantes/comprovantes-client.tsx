"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { PaginatedEnvelope, ReceiptRead } from "@/contracts";
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

type QueueMode = "pending" | "all";

export function ComprovantesClient() {
  const [mode, setMode] = useState<QueueMode>("pending");
  const [envelope, setEnvelope] = useState<PaginatedEnvelope<ReceiptRead> | null>(null);
  const [error, setError] = useState<BffFetchError | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptRead | null>(null);

  const load = useCallback(async (active: QueueMode) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("page_size", String(PAGE_SIZE));
    if (active === "pending") {
      params.set("needs_review", "true");
    }
    const result = await bffFetch<PaginatedEnvelope<ReceiptRead>>(
      `/api/operator/receipts?${params.toString()}`,
    );
    setEnvelope(result.data);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(mode);
    const id = window.setInterval(() => {
      void load(mode);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [mode, load]);

  const items = useMemo(() => {
    const list = envelope?.items ?? [];
    return [...list].sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return aTime - bTime;
    });
  }, [envelope]);

  const pendingCount = useMemo(
    () => items.filter((receipt) => receipt.needs_review).length,
    [items],
  );

  const hasLoaded = envelope !== null || error !== null;

  return (
    <div className="section-stack">
      <section className="panel receipt-queue-panel" id="fila-comprovantes">
        <div className="receipt-queue-toolbar">
          <div className="receipt-queue-counter">
            <strong>{formatNumber(mode === "pending" ? pendingCount : items.length)}</strong>
            <span>{mode === "pending" ? "aguardando revisão" : "no período"}</span>
          </div>
          <div className="receipt-queue-tabs" role="tablist" aria-label="Filtro da fila">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "pending"}
              className={mode === "pending" ? "queue-tab active" : "queue-tab"}
              onClick={() => setMode("pending")}
            >
              Aguardando
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "all"}
              className={mode === "all" ? "queue-tab active" : "queue-tab"}
              onClick={() => setMode("all")}
            >
              Todos
            </button>
          </div>
          <span className={loading ? "badge warning" : "badge muted"}>
            {loading ? "Atualizando" : "Atualizado"}
          </span>
        </div>

        {error ? <div className="panel-notice">{error.message}</div> : null}

        {!hasLoaded ? (
          <p className="empty-state">Carregando comprovantes...</p>
        ) : items.length === 0 ? (
          <div className="empty-state-card">
            <div className="empty-state-copy">
              <strong>
                {mode === "pending"
                  ? "Nenhum comprovante aguardando revisão"
                  : "Nenhum comprovante no período"}
              </strong>
              <p>
                Quando um lead enviar comprovante, ele entra aqui para você conferir se o valor bate
                com o combinado pela IA.
              </p>
            </div>
            <Link className="button secondary empty-state-action" href="/conversas">
              Ver conversas
            </Link>
          </div>
        ) : (
          <ul className="receipt-queue-list">
            {items.map((receipt) => (
              <ReceiptQueueRow
                key={receipt.id}
                receipt={receipt}
                onReview={() => setSelectedReceipt(receipt)}
              />
            ))}
          </ul>
        )}
      </section>

      {selectedReceipt ? (
        <ReceiptReviewModal receipt={selectedReceipt} onClose={() => setSelectedReceipt(null)} />
      ) : null}
    </div>
  );
}

function ReceiptQueueRow({ receipt, onReview }: { receipt: ReceiptRead; onReview: () => void }) {
  const clientName = receipt.client.display_name || receipt.client.whatsapp_jid;
  const expected = parseAmount(receipt.expected_amount);
  const detected = parseAmount(receipt.detected_amount);
  const diff = detected !== null && expected !== null ? detected - expected : null;
  const tolerance = Math.abs(parseAmount(receipt.tolerance_applied) ?? 0);
  const diffTone: "ok" | "warning" | "danger" =
    diff === null
      ? "warning"
      : Math.abs(diff) === 0
        ? "ok"
        : Math.abs(diff) <= tolerance
          ? "warning"
          : "danger";
  const confidence = confidenceValue(receipt);
  const confidenceTone: "high" | "mid" | "low" =
    confidence === null ? "low" : confidence >= 0.8 ? "high" : confidence >= 0.6 ? "mid" : "low";

  return (
    <li className={`receipt-queue-row tone-${diffTone}`}>
      <div className="queue-col client">
        <strong>{clientName}</strong>
        <span>{formatWhatsAppJid(receipt.client.whatsapp_jid)}</span>
      </div>

      <div className="queue-col amounts">
        <div className="amount-block">
          <span className="amount-label">Combinado</span>
          <span className="amount-value">{formatCurrency(receipt.expected_amount)}</span>
        </div>
        <div className="amount-arrow" aria-hidden="true">
          →
        </div>
        <div className="amount-block">
          <span className="amount-label">Recebido</span>
          <span className="amount-value">{formatCurrency(receipt.detected_amount)}</span>
          <DiffTag diff={diff} tone={diffTone} />
        </div>
      </div>

      <div className="queue-col confidence">
        <span className={`confidence-dot dot-${confidenceTone}`} aria-hidden="true" />
        <div>
          <span className="confidence-value">{formatConfidence(confidence)}</span>
          <span className="confidence-sub">confiança IA</span>
        </div>
      </div>

      <div className="queue-col wait">
        <span className="wait-value" title={formatDateTime(receipt.created_at)}>
          {formatRelativeSeconds(receipt.created_at)}
        </span>
        <span className="wait-sub">na fila</span>
      </div>

      <div className="queue-col actions">
        <button className="button" type="button" onClick={onReview}>
          Revisar
        </button>
        <Link className="link-pill" href={receipt.drilldown_href}>
          Conversa
        </Link>
      </div>
    </li>
  );
}

function DiffTag({ diff, tone }: { diff: number | null; tone: "ok" | "warning" | "danger" }) {
  if (diff === null) {
    return <span className="diff-tag diff-warning">Sem valor combinado</span>;
  }
  if (diff === 0) {
    return <span className="diff-tag diff-ok">Bate</span>;
  }
  const sign = diff > 0 ? "+" : "−";
  const label = `${sign}${formatCurrency(Math.abs(diff))}`;
  return <span className={`diff-tag diff-${tone}`}>{label}</span>;
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
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

function parseAmount(value: string | number | null): number | null {
  if (value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value.replace(",", "."));
  return Number.isNaN(parsed) ? null : parsed;
}

function formatWhatsAppJid(jid: string): string {
  const digits = jid.split("@")[0]?.replace(/\D/g, "") ?? jid;
  if (digits.length >= 12) {
    const country = digits.slice(0, 2);
    const area = digits.slice(2, 4);
    const rest = digits.slice(4);
    const split = rest.length > 8 ? `${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}` : rest;
    return `+${country} ${area} ${split}`;
  }
  return jid;
}
