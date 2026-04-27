"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import type {
  AgentExecutionStatus,
  AgentOpsSummaryRead,
  CalendarStatusRead,
  EvolutionConnectResultRead,
  EvolutionQrCodeRead,
  EvolutionStatusRead,
  HealthStatusRead,
} from "@/contracts";
import { bffFetch, bffSend, type BffFetchError } from "@/features/shared/bff-client";
import { formatDateTime, formatNumber } from "@/features/shared/formatters";

const POLL_INTERVAL_MS = 30_000;
const QR_POLL_INTERVAL_MS = 5_000;

type StatusState = {
  loadedAt: string | null;
  health: HealthStatusRead | null;
  evolution: EvolutionStatusRead | null;
  calendar: CalendarStatusRead | null;
  agent: AgentOpsSummaryRead | null;
  errors: {
    health: BffFetchError | null;
    evolution: BffFetchError | null;
    calendar: BffFetchError | null;
    agent: BffFetchError | null;
  };
};

const INITIAL_STATE: StatusState = {
  loadedAt: null,
  health: null,
  evolution: null,
  calendar: null,
  agent: null,
  errors: { health: null, evolution: null, calendar: null, agent: null },
};

export function StatusClient() {
  const [state, setState] = useState<StatusState>(INITIAL_STATE);
  const [firstLoad, setFirstLoad] = useState(true);

  const load = useCallback(async () => {
    const [health, evolution, calendar, agent] = await Promise.all([
      bffFetch<HealthStatusRead>("/api/operator/status/health"),
      bffFetch<EvolutionStatusRead>("/api/operator/status/evolution"),
      bffFetch<CalendarStatusRead>("/api/operator/status/calendar"),
      bffFetch<AgentOpsSummaryRead>("/api/operator/status/agent?window=24h"),
    ]);
    setState({
      loadedAt: new Date().toISOString(),
      health: health.data,
      evolution: evolution.data,
      calendar: calendar.data,
      agent: agent.data,
      errors: {
        health: health.error,
        evolution: evolution.error,
        calendar: calendar.error,
        agent: agent.error,
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

  const evolutionStatus = state.evolution?.status;
  const evolutionConnected = state.evolution?.connected ?? false;
  const evolutionAlerting = !state.errors.evolution
    && state.evolution
    && (evolutionStatus === "QR_REQUIRED" || evolutionStatus === "DISCONNECTED");
  const showQrPanel = evolutionStatus === "QR_REQUIRED";

  const [qr, setQr] = useState<EvolutionQrCodeRead | null>(null);
  const [qrError, setQrError] = useState<BffFetchError | null>(null);
  const [connectStatus, setConnectStatus] = useState<EvolutionConnectResultRead | null>(null);
  const [connectError, setConnectError] = useState<BffFetchError | null>(null);
  const [connectInFlight, setConnectInFlight] = useState(false);

  const loadQr = useCallback(async () => {
    const result = await bffFetch<EvolutionQrCodeRead>("/api/operator/integrations/evolution/qr");
    setQr(result.data);
    setQrError(result.error && result.error.status !== 404 ? result.error : null);
  }, []);

  useEffect(() => {
    if (!showQrPanel) {
      setQr(null);
      setQrError(null);
      return;
    }
    void loadQr();
    const id = window.setInterval(() => {
      void loadQr();
      void load();
    }, QR_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [showQrPanel, loadQr, load]);

  useEffect(() => {
    if (evolutionConnected) {
      setConnectStatus(null);
      setConnectError(null);
    }
  }, [evolutionConnected]);

  const requestConnect = useCallback(async () => {
    setConnectInFlight(true);
    const result = await bffSend<EvolutionConnectResultRead>(
      "/api/operator/integrations/evolution/connect",
      undefined,
    );
    setConnectStatus(result.data);
    setConnectError(result.error);
    setConnectInFlight(false);
    void load();
  }, [load]);

  if (firstLoad) {
    return (
      <div className="panel" role="status">
        <div className="panel-heading">
          <h2>Verificando o sistema</h2>
          <span className="badge muted">Buscando</span>
        </div>
        <p className="empty-state">Checando servidor, conexão com o WhatsApp, Google Calendar e agente.</p>
      </div>
    );
  }

  return (
    <div className="section-stack">
      <section className="panel">
        <div className="panel-heading">
          <h2>Servidor e banco de dados</h2>
          {renderHeadingBadge(state.health?.status, state.errors.health)}
        </div>
        {state.errors.health ? (
          <p>{state.errors.health.message}</p>
        ) : state.health ? (
          <dl className="kv-list">
            <Row label="Servidor" value={healthStatusLabel(state.health.status)} badge={healthBadge(state.health.status)} />
            <Row
              label="Banco de dados"
              value={databaseStatusLabel(state.health.database)}
              badge={databaseBadge(state.health.database)}
            />
            <Row label="Última verificação" value={formatDateTime(state.health.checked_at)} />
          </dl>
        ) : (
          <p className="empty-state">Sem resposta do servidor.</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Conexão com o WhatsApp</h2>
          {renderHeadingBadge(state.evolution?.status, state.errors.evolution)}
        </div>
        {evolutionAlerting ? (
          <p className="panel-notice danger" role="alert">
            {evolutionStatus === "QR_REQUIRED"
              ? "WhatsApp aguardando leitura do QR code para reconectar."
              : "WhatsApp desconectado. Gere um novo QR code e escaneie com o aparelho."}
          </p>
        ) : null}
        {state.errors.evolution ? (
          <p>{state.errors.evolution.message}</p>
        ) : state.evolution ? (
          <>
            <dl className="kv-list">
              <Row label="Número/instância" value={state.evolution.instance} />
              <Row
                label="Situação"
                value={evolutionStatusLabel(state.evolution.status)}
                badge={evolutionBadge(state.evolution.status)}
              />
              <Row
                label="QR code pendente"
                value={
                  state.evolution.qr_code_ref
                    ? `token ${state.evolution.qr_code_ref.slice(0, 8)}…${
                        state.evolution.qr_age_seconds !== null
                          ? ` (gerado há ${state.evolution.qr_age_seconds}s)`
                          : ""
                      }`
                    : "—"
                }
              />
              <Row label="Último evento" value={formatDateTime(state.evolution.last_event_at)} />
              <Row label="Conectado desde" value={formatDateTime(state.evolution.connected_since)} />
              <Row label="Última atualização" value={formatDateTime(state.evolution.updated_at)} />
            </dl>
            {showQrPanel ? (
              <div className="section-stack" style={{ marginTop: 16 }}>
                <p className="empty-state">
                  Abra o WhatsApp → <strong>Aparelhos conectados</strong> → <strong>Conectar aparelho</strong> e escaneie o QR abaixo.
                </p>
                {qr ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrSrc(qr.base64)}
                      alt="QR code do WhatsApp"
                      width={256}
                      height={256}
                      style={{ border: "1px solid var(--border, #ccc)", padding: 8, background: "#fff" }}
                    />
                    <span className="empty-state">
                      QR gerado há {qr.age_seconds}s · expira em {qr.expires_in_seconds}s
                    </span>
                  </div>
                ) : qrError ? (
                  <p className="panel-notice warning">{qrError.message}</p>
                ) : (
                  <p className="empty-state">Aguardando QR do servidor…</p>
                )}
              </div>
            ) : null}
            <div className="action-row" style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
              <button
                type="button"
                className="button"
                onClick={() => {
                  void requestConnect();
                }}
                disabled={connectInFlight || evolutionConnected}
              >
                {connectInFlight ? "Solicitando…" : evolutionConnected ? "Já conectado" : "Gerar novo QR"}
              </button>
              {connectError ? (
                <span className="panel-notice warning">{connectError.message}</span>
              ) : connectStatus ? (
                <span className="empty-state">{connectResultLabel(connectStatus)}</span>
              ) : null}
            </div>
          </>
        ) : (
          <p className="empty-state">Sem informação do WhatsApp agora.</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Google Calendar</h2>
          {renderHeadingBadge(state.calendar?.status, state.errors.calendar)}
        </div>
        {state.errors.calendar ? (
          <p>{state.errors.calendar.message}</p>
        ) : state.calendar ? (
          <>
            {state.calendar.status === "LOCAL_CACHE_ONLY" ? (
              <p className="panel-notice warning">
                A sincronização automática com o Google Calendar ainda não está ativa. A agenda funciona só localmente por enquanto.
              </p>
            ) : null}
            <dl className="kv-list">
              <Row label="Calendário" value={state.calendar.instance} />
              <Row
                label="Situação"
                value={calendarStatusLabel(state.calendar.status)}
                badge={calendarBadge(state.calendar.status)}
              />
              <Row label="Horários aguardando sincronizar" value={String(state.calendar.pending_slots)} />
              <Row
                label="Horários com erro"
                value={String(state.calendar.error_slots)}
                badge={state.calendar.error_slots > 0 ? <span className="badge danger">atenção</span> : undefined}
              />
              <Row label="Última sincronização" value={formatDateTime(state.calendar.last_synced_at)} />
              <Row label="Último erro" value={state.calendar.last_sync_error ?? "—"} />
              <Row label="Última atualização" value={formatDateTime(state.calendar.updated_at)} />
            </dl>
          </>
        ) : (
          <p className="empty-state">Sem informação do Calendar agora.</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Agente respondendo</h2>
          {state.errors.agent ? (
            <span className="badge danger">Erro</span>
          ) : state.agent && state.agent.failed_or_partial.value > 0 ? (
            <span className="badge danger">Houve falhas</span>
          ) : state.agent ? (
            <span className="badge ok">Funcionando</span>
          ) : (
            <span className="badge muted">Sem dado</span>
          )}
        </div>
        {state.errors.agent ? (
          <p>{state.errors.agent.message}</p>
        ) : state.agent ? (
          <div className="section-stack">
            <div className="metric-grid">
              <StatusMetric
                label="Respostas nas últimas 24h"
                value={state.agent.total_executions.value}
              />
              <StatusMetric
                label="Respostas com falha"
                value={state.agent.failed_or_partial.value}
                tone={state.agent.failed_or_partial.value > 0 ? "danger" : "default"}
              />
              <StatusMetric
                label="Vezes que usou plano B"
                value={state.agent.fallback_used.value}
                tone={state.agent.fallback_used.value > 0 ? "warning" : "default"}
              />
              <StatusMetric
                label="Erros em ferramentas"
                value={state.agent.tool_failures.value}
                tone={state.agent.tool_failures.value > 0 ? "danger" : "default"}
              />
            </div>
            <dl className="kv-list">
              <Row
                label="Como foram as respostas"
                value={statusCountsText(state.agent.executions_by_status.counts)}
              />
              <Row
                label="Tempo de resposta"
                value={`metade em até ${durationText(state.agent.duration.p50_ms)}, 95% em até ${durationText(
                  state.agent.duration.p95_ms,
                )}, média ${durationText(state.agent.duration.average_ms)}`}
              />
            </dl>
            <div>
              <div className="panel-heading compact">
                <h3>Últimas falhas</h3>
              </div>
              {state.agent.latest_failures.length > 0 ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Quando</th>
                        <th>Como foi</th>
                        <th>ID interno</th>
                        <th>Erro</th>
                        <th>Abrir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.agent.latest_failures.map((failure) => (
                        <tr key={failure.id}>
                          <td>{formatDateTime(failure.created_at)}</td>
                          <td>{executionStatusBadge(failure.status)}</td>
                          <td className="mono">{failure.trace_id}</td>
                          <td>{failure.error_summary || "—"}</td>
                          <td>
                            <Link href={failure.drilldown_href}>Ver conversa</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-state">Nenhuma falha nas últimas 24 horas.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="empty-state">Sem dados do agente agora.</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Integrações ainda sem monitoramento</h2>
          <span className="badge muted">em desenvolvimento</span>
        </div>
        <p className="empty-state">
          LangFuse (observabilidade), Whisper (transcrição de áudio) e Chatwoot (central de atendimento) ainda não têm
          verificação automática. Não dá para afirmar que estão funcionando só porque aparecem aqui.
        </p>
      </section>

      <p className="empty-state">Atualizado em {formatDateTime(state.loadedAt)}.</p>
    </div>
  );
}

function Row({
  label,
  value,
  badge,
}: {
  label: string;
  value: string | number | null | undefined;
  badge?: React.ReactNode;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <span>{value === null || value === undefined || value === "" ? "—" : value}</span>
        {badge ? <span style={{ marginLeft: 8 }}>{badge}</span> : null}
      </dd>
    </div>
  );
}

function StatusMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warning" | "danger";
}) {
  const className = tone === "danger" ? "metric danger" : tone === "warning" ? "metric warning" : "metric";
  return (
    <div className={className}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{formatNumber(value)}</strong>
    </div>
  );
}

function statusCountsText(counts: Record<string, number>): string {
  const labels: [string, string][] = [
    ["SUCCESS", "bem"],
    ["PARTIAL", "parciais"],
    ["FAILED", "falharam"],
    ["SKIPPED", "ignoradas"],
  ];
  return labels
    .map(([status, label]) => `${formatNumber(counts[status] ?? 0)} ${label}`)
    .join(" · ");
}

function durationText(value: number | null): string {
  if (value === null) {
    return "—";
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}s`;
  }
  return `${formatNumber(value)}ms`;
}

function executionStatusBadge(status: AgentExecutionStatus) {
  if (status === "FAILED") {
    return <span className="badge danger">Falhou</span>;
  }
  if (status === "PARTIAL") {
    return <span className="badge warning">Parcial</span>;
  }
  if (status === "SUCCESS") {
    return <span className="badge ok">Sucesso</span>;
  }
  return <span className="badge muted">Ignorada</span>;
}

function renderHeadingBadge(status: string | null | undefined, error: BffFetchError | null) {
  if (error) {
    return <span className="badge danger">Erro</span>;
  }
  if (!status) {
    return <span className="badge muted">Sem dado</span>;
  }
  return healthBadge(status);
}

function healthStatusLabel(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "ok") return "No ar";
  if (normalized === "degraded") return "Instável";
  if (normalized === "down") return "Fora do ar";
  if (normalized === "error") return "Com erro";
  return status;
}

function databaseStatusLabel(status: string): string {
  return status === "ok" ? "No ar" : status;
}

function evolutionStatusLabel(status: string): string {
  switch (status) {
    case "CONNECTED":
      return "Conectado";
    case "QR_REQUIRED":
      return "Aguardando leitura do QR code";
    case "DISCONNECTED":
      return "Desconectado";
    case "UNKNOWN":
      return "Sem informação";
    default:
      return status;
  }
}

function calendarStatusLabel(status: string): string {
  switch (status) {
    case "SYNCED":
      return "Sincronizado";
    case "LOCAL_CACHE_ONLY":
      return "Apenas local (sem sync)";
    case "UNKNOWN":
      return "Sem informação";
    case "ERROR":
      return "Com erro";
    default:
      return status;
  }
}

function healthBadge(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "ok") {
    return <span className="badge ok">{healthStatusLabel(status)}</span>;
  }
  if (normalized === "degraded") {
    return <span className="badge warning">{healthStatusLabel(status)}</span>;
  }
  if (normalized === "down" || normalized === "disconnected" || normalized === "error") {
    return <span className="badge danger">{healthStatusLabel(status)}</span>;
  }
  return <span className="badge">{status}</span>;
}

function databaseBadge(status: string) {
  return status === "ok" ? (
    <span className="badge ok">No ar</span>
  ) : (
    <span className="badge danger">{status}</span>
  );
}

function evolutionBadge(status: string) {
  const label = evolutionStatusLabel(status);
  if (status === "CONNECTED") {
    return <span className="badge ok">{label}</span>;
  }
  if (status === "QR_REQUIRED" || status === "UNKNOWN") {
    return <span className="badge warning">{label}</span>;
  }
  return <span className="badge danger">{label}</span>;
}

function calendarBadge(status: string) {
  const label = calendarStatusLabel(status);
  if (status === "SYNCED") {
    return <span className="badge ok">{label}</span>;
  }
  if (status === "LOCAL_CACHE_ONLY" || status === "UNKNOWN") {
    return <span className="badge warning">{label}</span>;
  }
  return <span className="badge danger">{label}</span>;
}

function qrSrc(base64: string): string {
  return base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
}

function connectResultLabel(result: EvolutionConnectResultRead): string {
  switch (result.status) {
    case "requested":
      return "Conexão solicitada. Aguarde o QR aparecer aqui.";
    case "already_connected":
      return "Instância já está conectada.";
    case "failed":
      return result.detail
        ? `Não foi possível solicitar conexão: ${result.detail}`
        : "Não foi possível solicitar conexão.";
    default:
      return "";
  }
}
