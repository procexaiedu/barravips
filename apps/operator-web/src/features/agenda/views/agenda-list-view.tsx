"use client";

import { useMemo } from "react";

import type { ScheduleSlotRead } from "@/contracts";
import { formatTime } from "@/features/shared/formatters";
import { scheduleSlotLabel, scheduleSourceLabel } from "@/features/shared/labels";

import { groupByDay, slotCardClass } from "../shared";

export function AgendaListView({
  items,
  onOpenSlot,
}: {
  items: ScheduleSlotRead[];
  onOpenSlot?: (slot: ScheduleSlotRead) => void;
}) {
  const groups = useMemo(() => {
    const map = groupByDay(items);
    return Array.from(map.entries())
      .map(([key, dayItems]) => ({
        key,
        label: relativeDayLabel(key),
        items: dayItems,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [items]);

  if (groups.length === 0) {
    return <p className="schedule-list-empty">Sem horários nesse intervalo.</p>;
  }

  return (
    <div className="schedule-list-view">
      {groups.map((group) => (
        <section key={group.key} className="schedule-list-day">
          <header>
            <strong>{group.label}</strong>
            <span>{group.items.length} itens</span>
          </header>
          <ul>
            {group.items.map((slot) => (
              <li key={slot.id} className={slotCardClass(slot) + " schedule-list-row"}>
                <button
                  type="button"
                  onClick={onOpenSlot ? () => onOpenSlot(slot) : undefined}
                  disabled={!onOpenSlot}
                  className="schedule-list-row-btn"
                >
                  <span className="schedule-list-row-time">
                    {formatTime(slot.starts_at)} – {formatTime(slot.ends_at)}
                  </span>
                  <span className="schedule-list-row-status">{scheduleSlotLabel(slot.status)}</span>
                  <span className="schedule-list-row-source">{scheduleSourceLabel(slot.source)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function relativeDayLabel(isoDate: string): string {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (isoDate === todayIso) return "Hoje";
  if (isoDate === tomorrow) return "Amanhã";
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
}
