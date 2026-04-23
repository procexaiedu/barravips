"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  PaginatedEnvelope,
  ScheduleSlotRead,
  ScheduleSlotStatus,
} from "@/contracts";
import { bffFetch, bffSend, type BffFetchError } from "@/features/shared/bff-client";
import {
  formatDateKey,
  formatDateTime,
  formatDayLabel,
  formatTime,
} from "@/features/shared/formatters";
import { calendarSyncLabel, scheduleSlotLabel } from "@/features/shared/labels";

const POLL_INTERVAL_MS = 30_000;
const DEFAULT_WINDOW_DAYS = 14;
const PAGE_SIZE = 100;

const STATUS_OPTIONS: ScheduleSlotStatus[] = [
  "AVAILABLE",
  "BLOCKED",
  "HELD",
  "CONFIRMED",
  "CANCELLED",
];

type Filters = {
  from: string;
  to: string;
  status: "" | ScheduleSlotStatus;
};

function defaultFilters(): Filters {
  const now = new Date();
  const to = new Date(now.getTime() + DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    from: toDateTimeLocal(now),
    to: toDateTimeLocal(to),
    status: "",
  };
}

export function AgendaClient() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [committed, setCommitted] = useState<Filters>(filters);
  const [envelope, setEnvelope] = useState<PaginatedEnvelope<ScheduleSlotRead> | null>(null);
  const [error, setError] = useState<BffFetchError | null>(null);
  const [loading, setLoading] = useState(false);

  const [blockForm, setBlockForm] = useState({
    starts_at: "",
    ends_at: "",
    reason: "",
  });
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockNotice, setBlockNotice] = useState<{ tone: "ok" | "error"; message: string } | null>(
    null,
  );

  const load = useCallback(
    async (active: Filters) => {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("page_size", String(PAGE_SIZE));
      const fromIso = toIsoOrNull(active.from);
      const toIso = toIsoOrNull(active.to);
      if (fromIso) {
        params.set("from", fromIso);
      }
      if (toIso) {
        params.set("to", toIso);
      }
      if (active.status) {
        params.set("status", active.status);
      }
      const result = await bffFetch<PaginatedEnvelope<ScheduleSlotRead>>(
        `/api/operator/schedule/slots?${params.toString()}`,
      );
      setEnvelope(result.data);
      setError(result.error);
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    void load(committed);
    const id = window.setInterval(() => {
      void load(committed);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [committed, load]);

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setCommitted(filters);
    },
    [filters],
  );

  const grouped = useMemo(() => groupByDay(envelope?.items ?? []), [envelope]);

  const hasErrorSlots = useMemo(
    () => (envelope?.items ?? []).some((slot) => slot.calendar_sync_status === "ERROR"),
    [envelope],
  );

  const onBlockSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setBlockNotice(null);
      const startsIso = toIsoOrNull(blockForm.starts_at);
      const endsIso = toIsoOrNull(blockForm.ends_at);
      if (!startsIso || !endsIso) {
        setBlockNotice({ tone: "error", message: "Informe o início e o fim do bloqueio." });
        return;
      }
      if (new Date(endsIso).getTime() <= new Date(startsIso).getTime()) {
        setBlockNotice({ tone: "error", message: "O fim precisa ser depois do início." });
        return;
      }
      setBlockBusy(true);
      const result = await bffSend("/api/operator/schedule/slots/block", {
        starts_at: startsIso,
        ends_at: endsIso,
        reason: blockForm.reason || null,
      });
      setBlockBusy(false);
      if (result.error) {
        setBlockNotice({ tone: "error", message: blockErrorMessage(result.error.status) });
      } else {
        setBlockNotice({ tone: "ok", message: "Horário bloqueado. A IA não vai mais oferecer esse período." });
        setBlockForm({ starts_at: "", ends_at: "", reason: "" });
        await load(committed);
      }
    },
    [blockForm, committed, load],
  );

  return (
    <div className="section-stack">
      <section className="panel">
        <div className="panel-heading">
          <h2>Agenda da modelo</h2>
          <span className="badge muted">
            {loading ? "Atualizando" : `${envelope?.total ?? 0} horários`}
          </span>
        </div>

        {hasErrorSlots ? (
          <div className="panel-notice">
            Pelo menos um horário não conseguiu sincronizar com o Google Calendar. Veja detalhes em Status do sistema.
          </div>
        ) : null}
        <div className="panel-notice warning">
          Por enquanto a agenda é só local. A sincronização automática com o Google Calendar ainda está em desenvolvimento.
        </div>

        <form className="filter-bar" onSubmit={onSubmit} aria-label="Filtros da agenda">
          <label>
            <span>De</span>
            <input
              type="datetime-local"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </label>
          <label>
            <span>Até</span>
            <input
              type="datetime-local"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </label>
          <label>
            <span>Situação</span>
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value as Filters["status"] })
              }
            >
              <option value="">Todas</option>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {scheduleSlotLabel(opt)}
                </option>
              ))}
            </select>
          </label>
          <div className="form-field">
            <span>&nbsp;</span>
            <button className="button" type="submit">
              Aplicar filtros
            </button>
          </div>
        </form>

        {error ? <div className="panel-notice">{error.message}</div> : null}

        {grouped.length === 0 ? (
          <p className="empty-state">Nenhum horário no período escolhido.</p>
        ) : (
          <div className="stack-md">
            {grouped.map((day) => (
              <div key={day.key}>
                <h3>{formatDayLabel(day.key)}</h3>
                <table className="data-table" aria-label={`Horários de ${day.key}`}>
                  <thead>
                    <tr>
                      <th>Início</th>
                      <th>Fim</th>
                      <th>Situação</th>
                      <th>Origem</th>
                      <th>Google Calendar</th>
                      <th>ID no Calendar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.items.map((slot) => (
                      <tr key={slot.id}>
                        <td>{formatTime(slot.starts_at)}</td>
                        <td>{formatTime(slot.ends_at)}</td>
                        <td>
                          <span className={slotStatusClass(slot.status)}>
                            {scheduleSlotLabel(slot.status)}
                          </span>
                        </td>
                        <td className="muted-cell">{slotSourceLabel(slot.source)}</td>
                        <td>
                          <SyncBadge slot={slot} />
                        </td>
                        <td className="muted-cell">{slot.external_event_id || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Bloquear um horário manualmente</h2>
          <span className="badge muted">Feito por você</span>
        </div>
        <p className="empty-state" style={{ textAlign: "left", padding: "0 0 10px 0" }}>
          Use para folgas, compromissos fora ou qualquer período em que a modelo não pode atender. A IA deixa de oferecer esse horário imediatamente.
        </p>
        <form className="form-grid" onSubmit={onBlockSubmit} aria-label="Bloquear horário">
          <label className="form-field">
            <span>Início</span>
            <input
              type="datetime-local"
              required
              value={blockForm.starts_at}
              onChange={(e) => setBlockForm({ ...blockForm, starts_at: e.target.value })}
            />
          </label>
          <label className="form-field">
            <span>Fim</span>
            <input
              type="datetime-local"
              required
              value={blockForm.ends_at}
              onChange={(e) => setBlockForm({ ...blockForm, ends_at: e.target.value })}
            />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>Motivo (opcional, só para você lembrar)</span>
            <input
              type="text"
              value={blockForm.reason}
              onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
              placeholder="Ex.: folga, consulta médica, viagem"
            />
          </label>
          <div className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>&nbsp;</span>
            <div className="inline-actions">
              <button className="button" type="submit" disabled={blockBusy}>
                {blockBusy ? "Bloqueando..." : "Bloquear horário"}
              </button>
            </div>
          </div>
        </form>
        {blockNotice ? (
          <div
            className={
              blockNotice.tone === "ok" ? "panel-notice ok" : "panel-notice"
            }
            style={{ marginTop: 12 }}
          >
            {blockNotice.message}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function SyncBadge({ slot }: { slot: ScheduleSlotRead }) {
  const status = slot.calendar_sync_status;
  const title = slot.last_sync_error ?? formatDateTime(slot.last_synced_at);
  const label = calendarSyncLabel(status);
  if (status === "SYNCED") {
    return (
      <span className="chip gold" title={title}>
        {label}
      </span>
    );
  }
  if (status === "PENDING") {
    return <span className="chip warning" title={title}>{label}</span>;
  }
  return <span className="chip danger" title={title}>{label}</span>;
}

function slotStatusClass(status: ScheduleSlotStatus): string {
  if (status === "BLOCKED") {
    return "chip danger";
  }
  if (status === "HELD" || status === "CONFIRMED") {
    return "chip gold";
  }
  if (status === "CANCELLED") {
    return "chip";
  }
  return "chip";
}

function slotSourceLabel(source: string): string {
  switch (source) {
    case "MANUAL":
      return "Você";
    case "AUTO_BLOCK":
      return "IA (negociação)";
    case "CALENDAR":
      return "Google Calendar";
    case "AGENT":
      return "IA";
    default:
      return source;
  }
}

function groupByDay(items: ScheduleSlotRead[]): { key: string; items: ScheduleSlotRead[] }[] {
  const map = new Map<string, ScheduleSlotRead[]>();
  for (const item of items) {
    const key = formatDateKey(item.starts_at);
    const existing = map.get(key);
    if (existing) {
      existing.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, dayItems]) => ({
      key,
      items: dayItems.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    }));
}

function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function toIsoOrNull(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function blockErrorMessage(status: number): string {
  if (status === 409) {
    return "Já existe um bloqueio nesse período, ou nenhuma modelo está ativa no sistema.";
  }
  if (status === 401) {
    return "Sua sessão expirou. Entre novamente para continuar.";
  }
  if (status === 422) {
    return "Algum dado do bloqueio está inválido. Revise os horários.";
  }
  return "Não consegui bloquear o horário. Tente de novo em alguns segundos.";
}
