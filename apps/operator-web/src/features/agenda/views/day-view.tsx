"use client";

import { useMemo } from "react";

import type { ScheduleSlotRead } from "@/contracts";
import { formatDayLabel, formatTime } from "@/features/shared/formatters";
import { scheduleSlotLabel, scheduleSourceLabel } from "@/features/shared/labels";

import { slotCardClass, toLocalDateStart } from "../shared";

export function DayView({
  items,
  fromDate,
  onOpenSlot,
}: {
  items: ScheduleSlotRead[];
  fromDate: string;
  onOpenSlot?: (slot: ScheduleSlotRead) => void;
}) {
  const { dayKey, daySlots, hourBlocks } = useMemo(() => computeDay(fromDate, items), [fromDate, items]);

  return (
    <div className="schedule-day-view">
      <header className="schedule-day-view-header">
        <strong>{formatDayLabel(dayKey)}</strong>
        <span>{daySlots.length} itens</span>
      </header>
      <div className="schedule-day-timeline">
        {hourBlocks.map((block) => (
          <div className="schedule-day-row" key={block.hour}>
            <span className="schedule-day-hour">{String(block.hour).padStart(2, "0")}:00</span>
            <div className="schedule-day-lane">
              {block.slots.length === 0 ? (
                <span className="schedule-day-lane-empty" />
              ) : (
                block.slots.map((slot) => (
                  <SlotBlock key={slot.id} slot={slot} onOpen={onOpenSlot} />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlotBlock({
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

function computeDay(fromDate: string, items: ScheduleSlotRead[]) {
  const start = toLocalDateStart(fromDate);
  const dayKey = new Date(start.getTime()).toISOString().slice(0, 10);
  const daySlots = items
    .filter((slot) => new Date(slot.starts_at).toISOString().slice(0, 10) === dayKey)
    .slice()
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const hourBlocks = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    slots: daySlots.filter((slot) => new Date(slot.starts_at).getHours() === hour),
  }));

  return { dayKey, daySlots, hourBlocks };
}
