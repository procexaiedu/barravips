"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  CalendarStatusRead,
  CalendarSyncStatus,
  PaginatedEnvelope,
  ScheduleSlotRead,
  ScheduleSlotStatus,
  ScheduleSource,
} from "@/contracts";
import { bffFetch, bffSend, type BffFetchError } from "@/features/shared/bff-client";
import {
  formatDateKey,
  formatDateTime,
  formatDayLabel,
  formatNumber,
  formatTime,
} from "@/features/shared/formatters";
import { calendarSyncLabel, scheduleSlotLabel, scheduleSourceLabel } from "@/features/shared/labels";

const POLL_INTERVAL_MS = 30_000;
const DEFAULT_WINDOW_DAYS = 7;
const PAGE_SIZE = 100;

const STATUS_OPTIONS: ScheduleSlotStatus[] = [
  "AVAILABLE",
  "BLOCKED",
  "HELD",
  "CONFIRMED",
  "CANCELLED",
];
const SOURCE_OPTIONS: ScheduleSource[] = ["CALENDAR_SYNC", "MANUAL", "AUTO_BLOCK"];
const CALENDAR_SYNC_STATUS_OPTIONS: CalendarSyncStatus[] = ["PENDING", "SYNCED", "ERROR"];

type Filters = {
  from: string;
  to: string;
  status: "" | ScheduleSlotStatus;
  source: "" | ScheduleSource;
  calendar_sync_status: "" | CalendarSyncStatus;
};

type OperationalTone = "ok" | "warning" | "danger";

function defaultFilters(): Filters {
  const now = new Date();
  const to = new Date(now.getTime() + DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    from: toDateTimeLocal(now),
    to: toDateTimeLocal(to),
    status: "",
    source: "",
    calendar_sync_status: "",
  };
}

export function AgendaClient() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [committed, setCommitted] = useState<Filters>(filters);
  const [envelope, setEnvelope] = useState<PaginatedEnvelope<ScheduleSlotRead> | null>(null);
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatusRead | null>(null);
  const [error, setError] = useState<BffFetchError | null>(null);
  const [calendarError, setCalendarError] = useState<BffFetchError | null>(null);
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

  const load = useCallback(async (active: Filters) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("page_size", String(PAGE_SIZE));
    const fromIso = toIsoOrNull(active.from);
    const toIso = toIsoOrNull(active.to);
    if (fromIso) params.set("from", fromIso);
    if (toIso) params.set("to", toIso);
    if (active.status) params.set("status", active.status);
    if (active.source) params.set("source", active.source);
    if (active.calendar_sync_status) {
      params.set("calendar_sync_status", active.calendar_sync_status);
    }

    const [slots, calendar] = await Promise.all([
      bffFetch<PaginatedEnvelope<ScheduleSlotRead>>(
        `/api/operator/schedule/slots?${params.toString()}`,
      ),
      bffFetch<CalendarStatusRead>("/api/operator/status/calendar"),
    ]);

    setEnvelope(slots.data);
    setError(slots.error);
    setCalendarStatus(calendar.data);
    setCalendarError(calendar.error);
    setLoading(false);
  }, []);

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

  const visibleSlots = useMemo(
    () => filterSlots(envelope?.items ?? [], committed),
    [committed, envelope],
  );

  const weekDays = useMemo(() => buildWeekDays(committed.from, visibleSlots), [committed.from, visibleSlots]);
  const stats = useMemo(() => summarizeSlots(visibleSlots), [visibleSlots]);
  const readiness = useMemo(
    () => agendaReadiness(stats, calendarStatus, Boolean(error)),
    [calendarStatus, error, stats],
  );

  const onBlockSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setBlockNotice(null);
      const startsIso = toIsoOrNull(blockForm.starts_at);
      const endsIso = toIsoOrNull(blockForm.ends_at);
      if (!startsIso || !endsIso) {
        setBlockNotice({ tone: "error", message: "Informe o inicio e o fim do bloqueio." });
        return;
      }
      if (new Date(endsIso).getTime() <= new Date(startsIso).getTime()) {
        setBlockNotice({ tone: "error", message: "O fim precisa ser depois do inicio." });
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
        setBlockNotice({
          tone: "ok",
          message: "Periodo bloqueado. O agente nao vai oferecer esse horario.",
        });
        setBlockForm({ starts_at: "", ends_at: "", reason: "" });
        await load(committed);
      }
    },
    [blockForm, committed, load],
  );

  return (
    <div className="section-stack">
      <section className={`operations-hero ${readiness.tone}`}>
        <div className="operations-hero-copy">
          <span className="badge muted">Status da agenda</span>
          <h2>{readiness.title}</h2>
          <p>{readiness.description}</p>
        </div>
        <div className="operations-hero-actions">
          <a className="button" href="#regras-agendamento">
            Adicionar disponibilidade
          </a>
          <a className="button secondary" href="#bloquear-periodo">
            Bloquear periodo
          </a>
          <a className="button secondary" href="/status">
            Conectar Google Calendar
          </a>
        </div>
      </section>

      <section className="metric-grid compact" aria-label="Resumo da agenda">
        <MetricCard label="Horarios livres" value={stats.available} detail="podem ser oferecidos ao lead" />
        <MetricCard label="Reservados" value={stats.reserved} detail="em negociacao ou confirmados" />
        <MetricCard label="Bloqueados" value={stats.blocked} detail="fora da oferta do agente" />
        <MetricCard label="Erros de sync" value={stats.errors} detail="precisam de revisao" danger={stats.errors > 0} />
        <MetricCard label="Sync pendente" value={stats.pending} detail="aguardando Calendar" warning={stats.pending > 0} />
        <MetricCard
          label="Fonte ativa"
          value={calendarSourceLabel(calendarStatus)}
          detail={calendarStatus?.last_synced_at ? `ultima sync ${formatDateTime(calendarStatus.last_synced_at)}` : "agenda local"}
        />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Semana operacional</h2>
            <p className="section-subtitle">
              Visualizacao padrao para saber se o agente pode oferecer horarios sem conflito.
            </p>
          </div>
          <span className={loading ? "badge warning" : "badge muted"}>
            {loading ? "Atualizando" : `${formatNumber(envelope?.total ?? 0)} horarios`}
          </span>
        </div>

        {error ? <div className="panel-notice">{error.message}</div> : null}
        {calendarError ? <div className="panel-notice warning">{calendarError.message}</div> : null}
        {calendarStatus ? <CalendarStatusNotice calendar={calendarStatus} /> : null}

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
            <span>Ate</span>
            <input
              type="datetime-local"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </label>
          <label>
            <span>Situacao</span>
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
          <label>
            <span>Origem</span>
            <select
              value={filters.source}
              onChange={(e) =>
                setFilters({ ...filters, source: e.target.value as Filters["source"] })
              }
            >
              <option value="">Todas</option>
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {scheduleSourceLabel(opt)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Sync Calendar</span>
            <select
              value={filters.calendar_sync_status}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  calendar_sync_status: e.target.value as Filters["calendar_sync_status"],
                })
              }
            >
              <option value="">Todos</option>
              {CALENDAR_SYNC_STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {calendarSyncLabel(opt)}
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

        <div className="schedule-legend" aria-label="Legenda da agenda">
          <span><i className="slot-dot available" /> Livre</span>
          <span><i className="slot-dot reserved" /> Reservado</span>
          <span><i className="slot-dot blocked" /> Bloqueado</span>
          <span><i className="slot-dot error" /> Erro de sync</span>
        </div>

        <div className="schedule-week-grid">
          {weekDays.map((day) => (
            <article className="schedule-day" key={day.key}>
              <header>
                <strong>{formatDayLabel(day.key)}</strong>
                <span>{day.items.length} itens</span>
              </header>
              {day.items.length === 0 ? (
                <p className="schedule-day-empty">Sem horarios neste dia.</p>
              ) : (
                <div className="schedule-slot-list">
                  {day.items.map((slot) => (
                    <ScheduleSlotCard key={slot.id} slot={slot} />
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>

        {visibleSlots.length === 0 ? (
          <EmptyStateCard
            title="Nenhum horario disponivel para o agente oferecer"
            description="Defina disponibilidade semanal ou desbloqueie periodos para o agente voltar a sugerir horarios com seguranca."
            actionHref="#regras-agendamento"
            actionLabel="Adicionar disponibilidade"
          />
        ) : null}
      </section>

      <div className="dashboard-columns">
        <section className="panel" id="regras-agendamento">
          <div className="panel-heading">
            <h2>Regras de agendamento</h2>
            <span className="badge muted">Operacao local</span>
          </div>
          <dl className="detail-list">
            <DetailRow label="Disponibilidade" value="Use os horarios livres da semana como fonte do que a IA pode oferecer." />
            <DetailRow label="Reservas" value="Horarios reservados ou confirmados nao devem aparecer como opcao para novos leads." />
            <DetailRow label="Bloqueios" value="Folgas, compromissos e indisponibilidades bloqueiam a oferta imediatamente." />
            <DetailRow label="Sincronizacao" value="Quando o Google Calendar estiver conectado, erros de sync precisam ser resolvidos antes de confiar na agenda externa." />
          </dl>
        </section>

        <section className="panel" id="bloquear-periodo">
          <div className="panel-heading">
            <h2>Bloquear periodo</h2>
            <span className="badge muted">Feito por voce</span>
          </div>
          <p className="section-subtitle">
            Use para folgas, compromissos ou qualquer periodo em que o agente nao deve atender.
          </p>
          <form className="form-grid" onSubmit={onBlockSubmit} aria-label="Bloquear periodo">
            <label className="form-field">
              <span>Inicio</span>
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
              <span>Motivo opcional</span>
              <input
                type="text"
                value={blockForm.reason}
                onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                placeholder="Ex.: folga, reuniao, viagem"
              />
            </label>
            <div className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span>&nbsp;</span>
              <button className="button" type="submit" disabled={blockBusy}>
                {blockBusy ? "Bloqueando..." : "Bloquear periodo"}
              </button>
            </div>
          </form>
          {blockNotice ? (
            <div
              className={blockNotice.tone === "ok" ? "panel-notice ok" : "panel-notice"}
              style={{ marginTop: 12 }}
            >
              {blockNotice.message}
            </div>
          ) : null}
        </section>
      </div>
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
  value: number | string;
  detail: string;
  warning?: boolean;
  danger?: boolean;
}) {
  return (
    <div className={danger ? "metric compact danger" : warning ? "metric compact warning" : "metric compact"}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{typeof value === "number" ? formatNumber(value) : value}</span>
      <span className="metric-sub">{detail}</span>
    </div>
  );
}

function ScheduleSlotCard({ slot }: { slot: ScheduleSlotRead }) {
  const statusClass = slotCardClass(slot);
  return (
    <div className={statusClass} title={syncBadgeTitle(slot)}>
      <div>
        <strong>
          {formatTime(slot.starts_at)} - {formatTime(slot.ends_at)}
        </strong>
        <span>{scheduleSlotLabel(slot.status)}</span>
      </div>
      <div className="schedule-slot-meta">
        <span>{scheduleSourceLabel(slot.source)}</span>
        <span>{calendarSyncLabel(slot.calendar_sync_status)}</span>
      </div>
    </div>
  );
}

function CalendarStatusNotice({ calendar }: { calendar: CalendarStatusRead }) {
  const message = calendarStatusMessage(calendar);
  if (!message) return null;
  return <div className={`panel-notice ${message.tone}`}>{message.text}</div>;
}

function EmptyStateCard({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className="empty-state-card" style={{ marginTop: 14 }}>
      <span className="empty-state-icon" aria-hidden="true" />
      <div className="empty-state-copy">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <a className="button secondary empty-state-action" href={actionHref}>
        {actionLabel}
      </a>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function agendaReadiness(
  stats: ReturnType<typeof summarizeSlots>,
  calendar: CalendarStatusRead | null,
  hasError: boolean,
): { tone: OperationalTone; title: string; description: string } {
  if (hasError || calendar?.status === "ERROR" || stats.errors > 0) {
    return {
      tone: "danger",
      title: "Agenda precisa de atencao antes de oferecer horarios",
      description:
        calendar?.last_sync_error ||
        "Ha erro de sincronizacao. Revise a agenda para evitar conflito com leads.",
    };
  }
  if (stats.available === 0) {
    return {
      tone: "warning",
      title: "Sem horarios livres para o agente oferecer",
      description:
        "Nao ha disponibilidade no periodo filtrado. Adicione horarios livres ou desbloqueie periodos.",
    };
  }
  if (calendar?.status === "LOCAL_CACHE_ONLY" || !calendar) {
    return {
      tone: "warning",
      title: "Agenda local ativa",
      description:
        "O agente pode usar os horarios livres desta plataforma, mas eventos externos nao entram automaticamente.",
    };
  }
  if (calendar.status === "UNKNOWN") {
    return {
      tone: "warning",
      title: "Status do Calendar indisponivel",
      description:
        "Nao foi possivel confirmar a sincronizacao agora. Use os horarios locais com cautela.",
    };
  }
  if (stats.pending > 0 || calendar.pending_slots > 0) {
    return {
      tone: "warning",
      title: "Sincronizacao pendente",
      description:
        "O agente usa a ultima disponibilidade conhecida enquanto o Google Calendar termina de atualizar.",
    };
  }
  return {
    tone: "ok",
    title: "Agenda pronta para o agente oferecer horarios",
    description:
      "Existem horarios livres e nenhum erro critico de sincronizacao no recorte semanal.",
  };
}

function summarizeSlots(items: ScheduleSlotRead[]) {
  return {
    available: items.filter((slot) => slot.status === "AVAILABLE").length,
    reserved: items.filter((slot) => slot.status === "HELD" || slot.status === "CONFIRMED").length,
    blocked: items.filter((slot) => slot.status === "BLOCKED").length,
    errors: items.filter((slot) => slot.calendar_sync_status === "ERROR").length,
    pending: items.filter((slot) => slot.calendar_sync_status === "PENDING").length,
  };
}

function buildWeekDays(from: string, items: ScheduleSlotRead[]) {
  const start = toLocalDateStart(from);
  const map = new Map<string, ScheduleSlotRead[]>();
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    map.set(formatDateKey(day.toISOString()), []);
  }
  for (const item of items) {
    const key = formatDateKey(item.starts_at);
    const existing = map.get(key);
    if (existing) existing.push(item);
  }
  return Array.from(map.entries()).map(([key, dayItems]) => ({
    key,
    items: dayItems.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
  }));
}

function filterSlots(items: ScheduleSlotRead[], filters: Filters): ScheduleSlotRead[] {
  return items.filter((slot) => {
    if (filters.source && slot.source !== filters.source) return false;
    if (filters.status && slot.status !== filters.status) return false;
    if (filters.calendar_sync_status && slot.calendar_sync_status !== filters.calendar_sync_status) {
      return false;
    }
    return true;
  });
}

function slotCardClass(slot: ScheduleSlotRead): string {
  if (slot.calendar_sync_status === "ERROR") return "schedule-slot-card error";
  if (slot.status === "BLOCKED") return "schedule-slot-card blocked";
  if (slot.status === "HELD" || slot.status === "CONFIRMED") return "schedule-slot-card reserved";
  return "schedule-slot-card available";
}

function calendarSourceLabel(calendar: CalendarStatusRead | null): string {
  if (!calendar) return "Local";
  if (calendar.status === "SYNCED") return "Google";
  if (calendar.status === "ERROR") return "Erro";
  if (calendar.status === "LOCAL_CACHE_ONLY") return "Local";
  return "Pendente";
}

function calendarStatusMessage(calendar: CalendarStatusRead): { tone: "warning" | "ok"; text: string } | null {
  if (calendar.status === "LOCAL_CACHE_ONLY") {
    return {
      tone: "warning",
      text:
        "Google Calendar nao conectado. Conecte para evitar conflitos e permitir que o agente ofereca horarios com mais seguranca.",
    };
  }
  if (calendar.status === "ERROR") {
    return {
      tone: "warning",
      text:
        calendar.last_sync_error ||
        "Erro de sincronizacao. Revise a conexao antes de liberar novos horarios para o agente.",
    };
  }
  if (calendar.pending_slots > 0) {
    return {
      tone: "warning",
      text: "Sincronizacao pendente. O agente usa a ultima disponibilidade conhecida.",
    };
  }
  if (calendar.status === "SYNCED") {
    return {
      tone: "ok",
      text: "Google Calendar sincronizado. Horarios externos estao sendo considerados.",
    };
  }
  if (calendar.status === "UNKNOWN") {
    return {
      tone: "warning",
      text: "Status do Google Calendar indisponivel. A agenda local continua visivel, mas exige conferencia.",
    };
  }
  return null;
}

function syncBadgeTitle(slot: ScheduleSlotRead): string {
  const lastSynced = slot.last_synced_at ? formatDateTime(slot.last_synced_at) : "-";
  const lines = [`Ultima sincronizacao: ${lastSynced}`];
  if (slot.last_sync_error) lines.push(`Erro: ${slot.last_sync_error}`);
  if (slot.external_event_id) lines.push(`Evento externo: ${slot.external_event_id}`);
  return lines.join("\n");
}

function toLocalDateStart(value: string): Date {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function toIsoOrNull(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function blockErrorMessage(status: number): string {
  if (status === 409) {
    return "Ja existe um bloqueio nesse periodo, ou nenhum agente esta ativo no sistema.";
  }
  if (status === 401) {
    return "Sua sessao expirou. Entre novamente para continuar.";
  }
  if (status === 422) {
    return "Algum dado do bloqueio esta invalido. Revise os horarios.";
  }
  return "Nao consegui bloquear o periodo. Tente de novo em alguns segundos.";
}
