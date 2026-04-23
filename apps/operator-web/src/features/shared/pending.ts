import type { ModelRead } from "@/contracts";

export type ModelPendencyKind =
  | "PENDING_DECISION"
  | "EMPTY_LANGUAGES"
  | "MISSING_CALENDAR_ID";

export type ModelPendency = {
  kind: ModelPendencyKind;
  path: string;
  label: string;
};

const PENDING_TOKEN = "PENDING_DECISION";

const PATH_LABELS: Record<string, string> = {
  "persona_json.persona": "Tom e personalidade da modelo",
  "persona_json.tom": "Tom e personalidade da modelo",
  "persona_json.style": "Estilo de escrita da modelo",
  "services_json.offered": "Serviços que a modelo oferece",
  "services_json.not_offered": "Serviços que a modelo não faz",
  "services_json.constraints.min_duration_minutes": "Duração mínima de atendimento",
  "services_json.constraints.advance_booking_minutes": "Antecedência mínima para agendar",
  "services_json.constraints.max_bookings_per_day": "Máximo de atendimentos por dia",
  "pricing_json.durations": "Tabela de preços por duração",
  "pricing_json.currency": "Moeda usada nos preços",
  "pricing_json.negotiation_floor_pct": "Desconto máximo permitido",
  "pricing_json.external_surcharge": "Taxa extra para deslocamento",
};

export function humanizeModelPath(path: string): string {
  const known = PATH_LABELS[path];
  if (known) return known;
  const tail = path.split(".").pop() ?? path;
  return tail
    .replace(/_/g, " ")
    .replace(/\[\d+\]/g, "")
    .replace(/^./, (c) => c.toUpperCase());
}

export function detectModelPendencies(model: ModelRead | null | undefined): ModelPendency[] {
  if (!model) {
    return [];
  }
  const pendencies: ModelPendency[] = [];
  collectPendingDecision(model.persona_json, "persona_json", pendencies);
  collectPendingDecision(model.services_json, "services_json", pendencies);
  collectPendingDecision(model.pricing_json, "pricing_json", pendencies);

  if (!model.languages || model.languages.length === 0) {
    pendencies.push({
      kind: "EMPTY_LANGUAGES",
      path: "languages",
      label: "Idiomas que a modelo atende",
    });
  }
  if (!model.calendar_external_id || model.calendar_external_id.trim() === "") {
    pendencies.push({
      kind: "MISSING_CALENDAR_ID",
      path: "calendar_external_id",
      label: "ID do Google Calendar da modelo",
    });
  }
  return pendencies;
}

function collectPendingDecision(
  node: unknown,
  prefix: string,
  out: ModelPendency[],
): void {
  if (node === undefined || node === null) {
    return;
  }
  if (typeof node === "string") {
    if (node === PENDING_TOKEN) {
      out.push({
        kind: "PENDING_DECISION",
        path: prefix,
        label: humanizeModelPath(prefix),
      });
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectPendingDecision(item, `${prefix}[${index}]`, out));
    return;
  }
  if (typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      collectPendingDecision(value, `${prefix}.${key}`, out);
    }
  }
}
