"use client";

import { useMemo } from "react";

import type { ScheduleSlotRead } from "@/contracts";
import { formatDateKey, formatDayLabel, formatTime } from "@/features/shared/formatters";
import { scheduleSlotLabel, scheduleSourceLabel } from "@/features/shared/labels";

import { slotCardClass, toLocalDateStart } from "../shared";

export function WeekView({
  items,
  fromDate,
  onOpenSlot,
}: {
  items: ScheduleSlotRead[];
  fromDate: string;
  onOpenSlot?: (slot: ScheduleSlotRead) => void;
}) {
  const weekDays = useMemo(() => buildWeekDays(fromDate, items), [fromDate, items]);

  return (
    <div className="schedule-week-grid">
      {weekDays.map((day) => (
        <article className="schedule-day" key={day.key}>
          <header>
            <strong>{formatDayLabel(day.key)}</strong>
            <span>{day.items.length} itens</span>
          </header>
          {day.items.length === 0 ? (
            <p className="schedule-day-empty">Sem horários neste dia.</p>
          ) : (
            <div className="schedule-slot-list">
              {day.items.map((slot) => (
                <SlotCard key={slot.id} slot={slot} onOpen={onOpenSlot} />
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function SlotCard({
  slot,
  onOpen,
}: {
  slot: ScheduleSlotRead;
  onOpen?: (slot: ScheduleSlotRead) => void;
}) {
  const className = slotCardClass(slot);
  const handleClick = onOpen ? () => onOpen(slot) : undefined;
  return (
    <div
      className={className}
      onClick={handleClick}
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
      <div>
        <strong>
          {formatTime(slot.starts_at)} - {formatTime(slot.ends_at)}
        </strong>
        <span>{scheduleSlotLabel(slot.status)}</span>
      </div>
      <div className="schedule-slot-meta">
        <span>{scheduleSourceLabel(slot.source)}</span>
      </div>
    </div>
  );
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
