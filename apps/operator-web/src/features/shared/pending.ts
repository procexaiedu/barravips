import type { EscortRead } from "@/contracts";

export type EscortPendencyKind =
  | "EMPTY_LANGUAGES"
  | "MISSING_CALENDAR_ID"
  | "MISSING_DISPLAY_NAME";

export type EscortPendency = {
  kind: EscortPendencyKind;
  path: string;
  label: string;
};

export function detectEscortPendencies(
  escort: EscortRead | null | undefined,
): EscortPendency[] {
  if (!escort) {
    return [];
  }
  const pendencies: EscortPendency[] = [];

  if (!escort.display_name || escort.display_name.trim() === "") {
    pendencies.push({
      kind: "MISSING_DISPLAY_NAME",
      path: "display_name",
      label: "Nome de exibição da acompanhante",
    });
  }
  if (!escort.languages || escort.languages.length === 0) {
    pendencies.push({
      kind: "EMPTY_LANGUAGES",
      path: "languages",
      label: "Idiomas que a acompanhante atende",
    });
  }
  if (!escort.calendar_external_id || escort.calendar_external_id.trim() === "") {
    pendencies.push({
      kind: "MISSING_CALENDAR_ID",
      path: "calendar_external_id",
      label: "ID do Google Calendar da acompanhante",
    });
  }
  return pendencies;
}
