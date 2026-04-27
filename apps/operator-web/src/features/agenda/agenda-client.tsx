"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  EscortRead,
  PaginatedEnvelope,
  ScheduleSlotRead,
  ScheduleSlotStatus,
  ScheduleSource,
} from "@/contracts";
import { bffFetch, bffSend, type BffFetchError } from "@/features/shared/bff-client";
import { formatDayLabel, formatNumber } from "@/features/shared/formatters";
import { scheduleSlotLabel, scheduleSourceLabel } from "@/features/shared/labels";

import { ModelChipBar } from "./model-chip";
import {
  AGENDA_VIEWS,
  type AgendaView,
  type Filters,
  filterSlots,
  summarizeSlots,
  toDateTimeLocal,
  toIsoOrNull,
} from "./shared";
import { SlotDrawer } from "./slot-drawer";
import {
  classifyBlockError,
  classifyFetchError,
  type SystemEventOutcome,
} from "./system-event-router";
import { AgendaListView } from "./views/agenda-list-view";
import { DayView } from "./views/day-view";
import { KanbanView } from "./views/kanban-view";
import { MonthView } from "./views/month-view";
import { WeekView } from "./views/week-view";

const POLL_INTERVAL_MS = 30_000;
const DEFAULT_WINDOW_DAYS = 7;
const PAGE_SIZE = 100;
const VIEW_STORAGE_KEY = "agenda.view";

const STATUS_OPTIONS: ScheduleSlotStatus[] = [
  "AVAILABLE",
  "BLOCKED",
  "HELD",
  "CONFIRMED",
  "CANCELLED",
];
const SOURCE_OPTIONS: ScheduleSource[] = ["CALENDAR_SYNC", "MANUAL", "AUTO_BLOCK"];

function defaultFilters(): Filters {
  const now = new Date();
  const to = new Date(now.getTime() + DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    from: toDateTimeLocal(now),
    to: toDateTimeLocal(to),
    status: "",
    source: "",
  };
}

function isAgendaView(value: string | null): value is AgendaView {
  return value === "week" || value === "day" || value === "month" || value === "list" || value === "kanban";
}

export function AgendaClient() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [committed, setCommitted] = useState<Filters>(filters);
  const [envelope, setEnvelope] = useState<PaginatedEnvelope<ScheduleSlotRead> | null>(null);
  const [error, setError] = useState<BffFetchError | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<AgendaView>("week");

  const [blockForm, setBlockForm] = useState({
    starts_at: "",
    ends_at: "",
    reason: "",
  });
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockNotice, setBlockNotice] = useState<{ tone: "ok" | "error"; message: string } | null>(
    null,
  );
  const [blockModalOpen, setBlockModalOpen] = useState(false);

  const openBlockModal = useCallback(() => {
    setBlockNotice(null);
    setBlockForm({ starts_at: "", ends_at: "", reason: "" });
    setBlockModalOpen(true);
  }, []);

  const closeBlockModal = useCallback(() => {
    if (blockBusy) return;
    setBlockModalOpen(false);
    setBlockNotice(null);
  }, [blockBusy]);

  useEffect(() => {
    if (!blockModalOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeBlockModal();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blockModalOpen, closeBlockModal]);
  const [selectedSlot, setSelectedSlot] = useState<ScheduleSlotRead | null>(null);
  const [models, setModels] = useState<EscortRead[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (isAgendaView(stored)) {
      setView(stored);
    }
  }, []);

  const changeView = useCallback((next: AgendaView) => {
    setView(next);
    window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (target?.isContentEditable) return;
      const key = event.key.toLowerCase();
      switch (key) {
        case "w":
          changeView("week");
          break;
        case "d":
          changeView("day");
          break;
        case "m":
          changeView("month");
          break;
        case "a":
          changeView("list");
          break;
        case "k":
          changeView("kanban");
          break;
        default:
          return;
      }
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changeView]);

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

    const slots = await bffFetch<PaginatedEnvelope<ScheduleSlotRead>>(
      `/api/operator/schedule/slots?${params.toString()}`,
    );

    setEnvelope(slots.data);
    setError(slots.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await bffFetch<EscortRead[] | { items: EscortRead[] }>("/api/operator/escorts");
      if (cancelled || !result.data) return;
      const list = Array.isArray(result.data) ? result.data : result.data.items;
      setModels(list ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleModel = useCallback((id: string) => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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

  const visibleSlots = useMemo(() => {
    const base = filterSlots(envelope?.items ?? [], committed);
    if (selectedModelIds.size === 0) return base;
    return base.filter((slot) => selectedModelIds.has(slot.model_id));
  }, [committed, envelope, selectedModelIds]);
  const stats = useMemo(() => summarizeSlots(visibleSlots), [visibleSlots]);

  const selectDayFromMonth = useCallback(
    (isoDate: string) => {
      const newFrom = `${isoDate}T00:00`;
      const newTo = `${isoDate}T23:59`;
      const next = { ...committed, from: newFrom, to: newTo };
      setFilters(next);
      setCommitted(next);
      changeView("day");
    },
    [changeView, committed],
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
        const outcome = classifyBlockError(result.error.status);
        if (outcome.class === "toast" || outcome.class === "banner") {
          setBlockNotice({ tone: "error", message: outcome.message });
        }
      } else {
        setBlockNotice({
          tone: "ok",
          message: "Período bloqueado. O agente não vai oferecer esse horário.",
        });
        setBlockForm({ starts_at: "", ends_at: "", reason: "" });
        await load(committed);
      }
    },
    [blockForm, committed, load],
  );

  return (
    <div className="section-stack agenda-shell">
      <section className="agenda-summary">
        <div className="agenda-summary-copy">
          <span className="agenda-summary-line">
            <strong>{formatNumber(stats.confirmed)}</strong> confirmados
            <span className="agenda-summary-sep">·</span>
            <strong>{formatNumber(stats.negotiating)}</strong> em negociação
          </span>
          <span className="agenda-summary-range">
            {formatDayLabel(committed.from.slice(0, 10))} → {formatDayLabel(committed.to.slice(0, 10))}
          </span>
        </div>
        <div className="agenda-summary-actions">
          <button className="button" type="button" onClick={openBlockModal}>
            Bloquear período
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="agenda-view-toolbar">
          <div
            className="view-toggle agenda-view-toggle"
            role="tablist"
            aria-label="Alternar visualização da agenda"
          >
            {AGENDA_VIEWS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={view === entry.key}
                className={view === entry.key ? "active" : undefined}
                onClick={() => changeView(entry.key)}
                title={`Atalho: ${entry.shortcut}`}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div className="agenda-view-toolbar-end">
            <span className={loading ? "badge warning" : "badge muted"}>
              {loading ? "Atualizando" : `${formatNumber(envelope?.total ?? 0)} horários`}
            </span>
            <Link className="link-pill" href="/agenda/configuracoes">
              ⚙ Configurações
            </Link>
          </div>
        </div>

        <SystemEventBanner outcome={classifyFetchError(error)} />
        <SystemEventToast outcome={classifyFetchError(error)} />

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
          <div className="form-field">
            <span>&nbsp;</span>
            <button className="button" type="submit">
              Aplicar filtros
            </button>
          </div>
        </form>

        <ModelChipBar models={models} selected={selectedModelIds} onToggle={toggleModel} />

        {view !== "kanban" && view !== "month" ? (
          <div className="schedule-legend" aria-label="Legenda da agenda">
            <span><i className="slot-dot available" /> Livre</span>
            <span><i className="slot-dot reserved" /> Reservado</span>
            <span><i className="slot-dot blocked" /> Bloqueado</span>
          </div>
        ) : null}

        {renderView(view, visibleSlots, committed, selectDayFromMonth, setSelectedSlot)}

        {visibleSlots.length === 0 && view !== "month" ? (
          <EmptyStateCard
            title="Nenhum horário disponível para o agente oferecer"
            description="Defina disponibilidade semanal ou desbloqueie períodos para o agente voltar a sugerir horários com segurança."
            actionLabel="Bloquear período"
            onAction={openBlockModal}
          />
        ) : null}
      </section>

      {blockModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeBlockModal();
          }}
        >
          <section
            className="modal block-period-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="block-period-title"
          >
            <div className="panel-heading" style={{ marginBottom: 0 }}>
              <div>
                <h2 id="block-period-title" style={{ margin: 0 }}>
                  Bloquear período
                </h2>
                <p className="section-subtitle" style={{ margin: "4px 0 0" }}>
                  Use para folgas, compromissos ou qualquer período em que o agente não deve atender.
                </p>
              </div>
              <button
                className="drawer-close"
                type="button"
                onClick={closeBlockModal}
                aria-label="Fechar"
                disabled={blockBusy}
              >
                ×
              </button>
            </div>
            <form className="form-grid" onSubmit={onBlockSubmit} aria-label="Bloquear período">
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
                <span>Motivo opcional</span>
                <input
                  type="text"
                  value={blockForm.reason}
                  onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                  placeholder="Ex.: folga, reunião, viagem"
                />
              </label>
              {blockNotice ? (
                <div
                  className={blockNotice.tone === "ok" ? "panel-notice ok" : "panel-notice"}
                  style={{ gridColumn: "1 / -1" }}
                >
                  {blockNotice.message}
                </div>
              ) : null}
              <div
                className="button-row"
                style={{ gridColumn: "1 / -1", justifyContent: "flex-end" }}
              >
                <button
                  className="button secondary"
                  type="button"
                  onClick={closeBlockModal}
                  disabled={blockBusy}
                >
                  Cancelar
                </button>
                <button className="button" type="submit" disabled={blockBusy}>
                  {blockBusy ? "Bloqueando..." : "Bloquear período"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {selectedSlot ? (
        <SlotDrawer
          slot={selectedSlot}
          onClose={() => setSelectedSlot(null)}
          onChanged={(next) => {
            setSelectedSlot(next);
            void load(committed);
          }}
        />
      ) : null}
    </div>
  );
}

function SystemEventBanner({ outcome }: { outcome: SystemEventOutcome }) {
  if (outcome.class !== "banner") return null;
  return (
    <div className="panel-notice warning" role="status">
      <span>{outcome.message}</span>
      {outcome.action?.href ? (
        <a className="button secondary" href={outcome.action.href} style={{ marginLeft: 12 }}>
          {outcome.action.label}
        </a>
      ) : null}
    </div>
  );
}

function SystemEventToast({ outcome }: { outcome: SystemEventOutcome }) {
  if (outcome.class !== "toast") return null;
  return <div className="panel-notice">{outcome.message}</div>;
}

function renderView(
  view: AgendaView,
  items: ScheduleSlotRead[],
  committed: Filters,
  onSelectDay: (isoDate: string) => void,
  onOpenSlot: (slot: ScheduleSlotRead) => void,
) {
  const fromDate = committed.from;
  switch (view) {
    case "week":
      return <WeekView items={items} fromDate={fromDate} onOpenSlot={onOpenSlot} />;
    case "day":
      return <DayView items={items} fromDate={fromDate} onOpenSlot={onOpenSlot} />;
    case "month":
      return <MonthView items={items} fromDate={fromDate} onSelectDay={onSelectDay} />;
    case "list":
      return <AgendaListView items={items} onOpenSlot={onOpenSlot} />;
    case "kanban":
      return <KanbanView items={items} onOpenSlot={onOpenSlot} />;
    default:
      return null;
  }
}

function EmptyStateCard({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="empty-state-card" style={{ marginTop: 14 }}>
      <span className="empty-state-icon" aria-hidden="true" />
      <div className="empty-state-copy">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <button
        className="button secondary empty-state-action"
        type="button"
        onClick={onAction}
      >
        {actionLabel}
      </button>
    </div>
  );
}

