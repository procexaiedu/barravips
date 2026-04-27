import type { ScheduleSlotRead, ScheduleSlotStatus, ScheduleSource } from "@/contracts";

export type AgendaView = "week" | "day" | "month" | "list" | "kanban";

export const AGENDA_VIEWS: Array<{ key: AgendaView; label: string; shortcut: string }> = [
  { key: "week", label: "Semana", shortcut: "W" },
  { key: "day", label: "Dia", shortcut: "D" },
  { key: "month", label: "Mês", shortcut: "M" },
  { key: "list", label: "Agenda", shortcut: "A" },
  { key: "kanban", label: "Kanban", shortcut: "K" },
];

export type Filters = {
  from: string;
  to: string;
  status: "" | ScheduleSlotStatus;
  source: "" | ScheduleSource;
};

export function slotCardClass(slot: ScheduleSlotRead): string {
  if (slot.status === "CANCELLED") return "schedule-slot-card cancelled";
  if (slot.status === "BLOCKED") return "schedule-slot-card blocked";
  if (slot.status === "HELD" || slot.status === "CONFIRMED") return "schedule-slot-card reserved";
  return "schedule-slot-card available";
}

export function filterSlots(items: ScheduleSlotRead[], filters: Filters): ScheduleSlotRead[] {
  return items.filter((slot) => {
    if (filters.source && slot.source !== filters.source) return false;
    if (filters.status && slot.status !== filters.status) return false;
    return true;
  });
}

export function summarizeSlots(items: ScheduleSlotRead[]) {
  return {
    confirmed: items.filter((slot) => slot.status === "CONFIRMED").length,
    negotiating: items.filter((slot) => slot.status === "HELD").length,
  };
}

export function toLocalDateStart(value: string): Date {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function toIsoOrNull(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function groupByDay(items: ScheduleSlotRead[]): Map<string, ScheduleSlotRead[]> {
  const map = new Map<string, ScheduleSlotRead[]>();
  for (const item of items) {
    const key = new Date(item.starts_at).toISOString().slice(0, 10);
    const existing = map.get(key);
    if (existing) {
      existing.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  for (const [key, list] of map) {
    map.set(
      key,
      list.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    );
  }
  return map;
}
