"use client";

import {
  asStringArray,
  isPending,
  PENDING_TOKEN,
  PendingValueInput,
  SectionShell,
  setKey,
  setNested,
  StringListEditor,
  type JsonObject,
} from "./section-utils";

const KNOWN_KEYS = new Set(["offered", "not_offered", "constraints", "fixture_only"]);

type OfferedItem = {
  id: string;
  label: string;
  flow_type: string;
};

function asOfferedList(value: unknown): { items: OfferedItem[]; pending: boolean } {
  if (isPending(value)) return { items: [], pending: true };
  if (!Array.isArray(value)) return { items: [], pending: false };
  const items: OfferedItem[] = [];
  for (const entry of value) {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const obj = entry as JsonObject;
      items.push({
        id: typeof obj.id === "string" ? obj.id : "",
        label: typeof obj.label === "string" ? obj.label : "",
        flow_type: typeof obj.flow_type === "string" ? obj.flow_type : "INTERNAL",
      });
    }
  }
  return { items, pending: false };
}

export function ServicesSection({
  value,
  onChange,
  pendencyCount,
}: {
  value: JsonObject;
  onChange: (next: JsonObject) => void;
  pendencyCount: number;
}) {
  const offered = asOfferedList(value.offered);
  const notOfferedRaw = value.not_offered;
  const notOfferedPending = isPending(notOfferedRaw);
  const notOffered = asStringArray(notOfferedRaw);

  const constraints = (value.constraints && typeof value.constraints === "object" && !Array.isArray(value.constraints))
    ? (value.constraints as JsonObject)
    : {};

  const extras = Object.keys(value).filter((key) => !KNOWN_KEYS.has(key));

  const updateOffered = (next: OfferedItem[]) => {
    onChange(setKey(value, "offered", next));
  };

  return (
    <SectionShell
      title="Serviços oferecidos"
      description="O que a modelo atende, o que recusa e os limites operacionais para agendamento."
      pendencyCount={pendencyCount}
      rawValue={value}
      onApplyRaw={onChange}
    >
      <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
        <div className="form-field">
          <span>Serviços que a modelo oferece</span>
          {offered.pending ? (
            <PendingValueInput
              value={PENDING_TOKEN}
              onChange={() => updateOffered([])}
            />
          ) : (
            <div className="stack-sm">
              {offered.items.length === 0 ? (
                <p className="empty-state" style={{ padding: 0, textAlign: "left" }}>
                  Nenhum serviço cadastrado.
                </p>
              ) : null}
              {offered.items.map((item, index) => (
                <div key={index} className="form-grid" style={{ gridTemplateColumns: "1fr 1fr 140px auto", alignItems: "end" }}>
                  <label className="form-field">
                    <span>ID interno</span>
                    <input
                      type="text"
                      value={item.id}
                      placeholder="acompanhamento_local"
                      onChange={(event) => {
                        const next = [...offered.items];
                        next[index] = { ...item, id: event.target.value };
                        updateOffered(next);
                      }}
                    />
                  </label>
                  <label className="form-field">
                    <span>Nome visível</span>
                    <input
                      type="text"
                      value={item.label}
                      placeholder="Acompanhamento no local"
                      onChange={(event) => {
                        const next = [...offered.items];
                        next[index] = { ...item, label: event.target.value };
                        updateOffered(next);
                      }}
                    />
                  </label>
                  <label className="form-field">
                    <span>Tipo de fluxo</span>
                    <select
                      value={item.flow_type}
                      onChange={(event) => {
                        const next = [...offered.items];
                        next[index] = { ...item, flow_type: event.target.value };
                        updateOffered(next);
                      }}
                    >
                      <option value="INTERNAL">No local</option>
                      <option value="EXTERNAL">Deslocamento</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="inline-text-button"
                    onClick={() => updateOffered(offered.items.filter((_, i) => i !== index))}
                  >
                    Remover
                  </button>
                </div>
              ))}
              <div className="button-row" style={{ marginTop: 0 }}>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => updateOffered([...offered.items, { id: "", label: "", flow_type: "INTERNAL" }])}
                >
                  Adicionar serviço
                </button>
                <button
                  type="button"
                  className="inline-text-button"
                  onClick={() => onChange(setKey(value, "offered", PENDING_TOKEN))}
                >
                  Marcar como falta decidir
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="form-field">
          <span>Serviços que a modelo não faz</span>
          {notOfferedPending ? (
            <PendingValueInput
              value={PENDING_TOKEN}
              onChange={() => onChange(setKey(value, "not_offered", []))}
            />
          ) : (
            <>
              <StringListEditor
                values={notOffered}
                onChange={(next) => onChange(setKey(value, "not_offered", next))}
                placeholder="Ex.: pernoite"
                addLabel="Adicionar restrição"
                emptyMessage="Sem restrições cadastradas."
              />
              <button
                type="button"
                className="inline-text-button"
                onClick={() => onChange(setKey(value, "not_offered", PENDING_TOKEN))}
              >
                Marcar como falta decidir
              </button>
            </>
          )}
        </div>

        <fieldset className="form-field" style={{ border: "1px solid var(--border-soft)", borderRadius: "var(--radius-sm)", padding: "var(--space-md)" }}>
          <legend style={{ padding: "0 var(--space-sm)" }}>Restrições operacionais</legend>
          <div className="form-grid">
            <label className="form-field">
              <span>Duração mínima (minutos)</span>
              <PendingValueInput
                value={constraints.min_duration_minutes}
                type="number"
                min={0}
                placeholder="60"
                ariaLabel="Duração mínima em minutos"
                onChange={(next) =>
                  onChange(setNested(value, ["constraints", "min_duration_minutes"], next === "" ? undefined : next))
                }
              />
            </label>
            <label className="form-field">
              <span>Antecedência mínima (minutos)</span>
              <PendingValueInput
                value={constraints.advance_booking_minutes}
                type="number"
                min={0}
                placeholder="120"
                ariaLabel="Antecedência mínima em minutos"
                onChange={(next) =>
                  onChange(setNested(value, ["constraints", "advance_booking_minutes"], next === "" ? undefined : next))
                }
              />
            </label>
            <label className="form-field">
              <span>Máximo de atendimentos por dia</span>
              <PendingValueInput
                value={constraints.max_bookings_per_day}
                type="number"
                min={0}
                placeholder="Sem limite"
                ariaLabel="Máximo de atendimentos por dia"
                onChange={(next) =>
                  onChange(setNested(value, ["constraints", "max_bookings_per_day"], next === "" ? undefined : next))
                }
              />
            </label>
          </div>
        </fieldset>

        {extras.length > 0 ? (
          <p className="empty-state" style={{ textAlign: "left", padding: 0 }}>
            Há {extras.length} chave{extras.length === 1 ? "" : "s"} extra{extras.length === 1 ? "" : "s"} preservada{extras.length === 1 ? "" : "s"} no JSON ({extras.join(", ")}). Use “Editar JSON bruto” para revisar.
          </p>
        ) : null}
      </div>
    </SectionShell>
  );
}
