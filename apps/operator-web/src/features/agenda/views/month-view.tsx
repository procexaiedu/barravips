"use client";

import { useMemo } from "react";

import type { ScheduleSlotRead } from "@/contracts";

import { toLocalDateStart } from "../shared";

const WEEKDAY_LABELS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export function MonthView({
  items,
  fromDate,
  onSelectDay,
}: {
  items: ScheduleSlotRead[];
  fromDate: string;
  onSelectDay?: (isoDate: string) => void;
}) {
  const { weeks, monthLabel } = useMemo(() => computeMonth(fromDate, items), [fromDate, items]);

  return (
    <div className="schedule-month-view">
      <header className="schedule-month-header">
        <strong>{monthLabel}</strong>
      </header>
      <div className="schedule-month-weekdays">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="schedule-month-grid">
        {weeks.flat().map((cell) => (
          <button
            type="button"
            key={cell.isoDate}
            className={`schedule-month-cell${cell.inMonth ? "" : " muted"}${cell.isToday ? " today" : ""}`}
            onClick={() => onSelectDay?.(cell.isoDate)}
            disabled={!onSelectDay}
          >
            <span className="schedule-month-daynum">{cell.dayNum}</span>
            {cell.counts.total > 0 ? (
              <span className="schedule-month-counts">
                {cell.counts.confirmed > 0 ? (
                  <span className="schedule-month-count reserved" title="confirmados">
                    {cell.counts.confirmed}
                  </span>
                ) : null}
                {cell.counts.negotiating > 0 ? (
                  <span className="schedule-month-count gold" title="em negociação">
                    {cell.counts.negotiating}
                  </span>
                ) : null}
                {cell.counts.blocked > 0 ? (
                  <span className="schedule-month-count blocked" title="bloqueados">
                    {cell.counts.blocked}
                  </span>
                ) : null}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

type MonthCell = {
  isoDate: string;
  dayNum: number;
  inMonth: boolean;
  isToday: boolean;
  counts: {
    total: number;
    confirmed: number;
    negotiating: number;
    blocked: number;
  };
};

function computeMonth(fromDate: string, items: ScheduleSlotRead[]): {
  weeks: MonthCell[][];
  monthLabel: string;
} {
  const anchor = toLocalDateStart(fromDate);
  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const gridStart = new Date(firstOfMonth);
  const startWeekdayIso = (gridStart.getDay() + 6) % 7;
  gridStart.setDate(gridStart.getDate() - startWeekdayIso);

  const gridEnd = new Date(lastOfMonth);
  const endWeekdayIso = (gridEnd.getDay() + 6) % 7;
  gridEnd.setDate(gridEnd.getDate() + (6 - endWeekdayIso));

  const todayIso = new Date().toISOString().slice(0, 10);
  const countsByDay = new Map<string, MonthCell["counts"]>();
  for (const slot of items) {
    const key = new Date(slot.starts_at).toISOString().slice(0, 10);
    const bucket = countsByDay.get(key) ?? { total: 0, confirmed: 0, negotiating: 0, blocked: 0 };
    bucket.total += 1;
    if (slot.status === "CONFIRMED") bucket.confirmed += 1;
    else if (slot.status === "HELD") bucket.negotiating += 1;
    else if (slot.status === "BLOCKED") bucket.blocked += 1;
    countsByDay.set(key, bucket);
  }

  const weeks: MonthCell[][] = [];
  let week: MonthCell[] = [];
  const cursor = new Date(gridStart);
  while (cursor.getTime() <= gridEnd.getTime()) {
    const isoDate = cursor.toISOString().slice(0, 10);
    const counts = countsByDay.get(isoDate) ?? { total: 0, confirmed: 0, negotiating: 0, blocked: 0 };
    week.push({
      isoDate,
      dayNum: cursor.getDate(),
      inMonth: cursor.getMonth() === month,
      isToday: isoDate === todayIso,
      counts,
    });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const monthLabel = firstOfMonth.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  return { weeks, monthLabel };
}
