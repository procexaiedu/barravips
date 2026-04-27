"use client";

import { useMemo, useState } from "react";

import type { ScheduleSlotRead } from "@/contracts";
import { formatTime } from "@/features/shared/formatters";
import { scheduleSourceLabel } from "@/features/shared/labels";

type KanbanColumnKey = "requested" | "negotiating" | "confirmed" | "completed";

const COLUMNS: Array<{ key: KanbanColumnKey; label: string; description: string }> = [
  { key: "requested", label: "Solicitado", description: "Agente pediu o horário, cliente ainda não confirmou" },
  { key: "negotiating", label: "Em negociação", description: "Você bloqueou ou está negociando manualmente" },
  { key: "confirmed", label: "Confirmado", description: "Fechado, ainda não aconteceu" },
  { key: "completed", label: "Concluído", description: "Atendimento já realizado" },
];

export function KanbanView({
  items,
  onOpenSlot,
}: {
  items: ScheduleSlotRead[];
  onOpenSlot?: (slot: ScheduleSlotRead) => void;
}) {
  const [showCancelled, setShowCancelled] = useState(false);
  const { byColumn, cancelled } = useMemo(() => classifySlots(items), [items]);

  return (
    <div className="kanban-board kanban-board-agenda" aria-label="Kanban de agendamentos">
      <div className="kanban-columns">
        {COLUMNS.map((column) => {
          const slots = byColumn.get(column.key) ?? [];
          return (
            <section key={column.key} className="kanban-column" aria-label={`Coluna ${column.label}`}>
              <header className="kanban-column-header">
                <h3>{column.label}</h3>
                <span className="chip">{slots.length}</span>
              </header>
              <div className="kanban-column-body">
                {slots.length === 0 ? (
                  <p className="kanban-column-empty">{column.description}.</p>
                ) : (
                  slots.map((slot) => <KanbanSlotCard key={slot.id} slot={slot} onOpen={onOpenSlot} />)
                )}
              </div>
            </section>
          );
        })}
      </div>

      {cancelled.length > 0 ? (
        <section className="kanban-lane kanban-lane-cancelled" aria-label="Cancelados">
          <header className="kanban-lane-header">
            <button
              type="button"
              className="kanban-lane-toggle"
              onClick={() => setShowCancelled((open) => !open)}
              aria-expanded={showCancelled}
            >
              <h3>Cancelados</h3>
              <span className="chip muted">{cancelled.length}</span>
              <span className="kanban-lane-caret" aria-hidden="true">
                {showCancelled ? "▾" : "▸"}
              </span>
            </button>
          </header>
          {showCancelled ? (
            <div className="kanban-lane-body">
              {cancelled.map((slot) => (
                <KanbanSlotCard key={slot.id} slot={slot} onOpen={onOpenSlot} muted />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function KanbanSlotCard({
  slot,
  onOpen,
  muted = false,
}: {
  slot: ScheduleSlotRead;
  onOpen?: (slot: ScheduleSlotRead) => void;
  muted?: boolean;
}) {
  const date = new Date(slot.starts_at);
  const dayLabel = date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
  const className = ["kanban-card", "kanban-card-slot", muted ? "muted" : ""].filter(Boolean).join(" ");

  return (
    <article
      className={className}
      onClick={onOpen ? () => onOpen(slot) : undefined}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={(event) => {
        if (!onOpen) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(slot);
        }
      }}
    >
      <header className="kanban-card-header">
        <div className="kanban-card-title">
          <strong>
            {formatTime(slot.starts_at)} – {formatTime(slot.ends_at)}
          </strong>
        </div>
        <span className="kanban-card-updated">{dayLabel}</span>
      </header>
      <div className="kanban-card-badges">
        <span className="chip">{scheduleSourceLabel(slot.source)}</span>
      </div>
    </article>
  );
}

function classifySlots(items: ScheduleSlotRead[]): {
  byColumn: Map<KanbanColumnKey, ScheduleSlotRead[]>;
  cancelled: ScheduleSlotRead[];
} {
  const byColumn = new Map<KanbanColumnKey, ScheduleSlotRead[]>();
  for (const col of COLUMNS) {
    byColumn.set(col.key, []);
  }
  const cancelled: ScheduleSlotRead[] = [];
  const now = Date.now();

  for (const slot of items) {
    if (slot.status === "CANCELLED") {
      cancelled.push(slot);
      continue;
    }
    if (slot.status === "HELD" && slot.source === "AUTO_BLOCK") {
      byColumn.get("requested")!.push(slot);
      continue;
    }
    if (slot.status === "HELD") {
      byColumn.get("negotiating")!.push(slot);
      continue;
    }
    if (slot.status === "CONFIRMED") {
      const isPast = new Date(slot.ends_at).getTime() <= now;
      byColumn.get(isPast ? "completed" : "confirmed")!.push(slot);
      continue;
    }
  }

  for (const [key, list] of byColumn) {
    byColumn.set(
      key,
      list.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    );
  }
  cancelled.sort((a, b) => b.starts_at.localeCompare(a.starts_at));

  return { byColumn, cancelled };
}
