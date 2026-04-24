"use client";

import {
  isPending,
  PENDING_TOKEN,
  PendingValueInput,
  SectionShell,
  setKey,
  type JsonObject,
} from "./section-utils";

const KNOWN_KEYS = new Set([
  "currency",
  "durations",
  "negotiation_floor_pct",
  "external_surcharge",
  "fixture_only",
]);

const COMMON_CURRENCIES = ["BRL", "USD", "EUR"];

type DurationItem = {
  minutes: number | "";
  price: unknown;
};

function asDurationList(value: unknown): { items: DurationItem[]; pending: boolean } {
  if (isPending(value)) return { items: [], pending: true };
  if (!Array.isArray(value)) return { items: [], pending: false };
  const items: DurationItem[] = [];
  for (const entry of value) {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const obj = entry as JsonObject;
      const minutesRaw = obj.minutes;
      const minutes =
        typeof minutesRaw === "number" && Number.isFinite(minutesRaw)
          ? minutesRaw
          : typeof minutesRaw === "string" && minutesRaw !== ""
            ? Number(minutesRaw)
            : NaN;
      items.push({
        minutes: Number.isFinite(minutes) ? (minutes as number) : "",
        price: obj.price,
      });
    }
  }
  return { items, pending: false };
}

function serializeDurations(items: DurationItem[]): JsonObject[] {
  return items.map((item) => {
    const out: JsonObject = {};
    if (item.minutes !== "" && item.minutes !== null) {
      out.minutes = item.minutes;
    }
    out.price = item.price ?? "";
    return out;
  });
}

export function PricingSection({
  value,
  onChange,
  pendencyCount,
}: {
  value: JsonObject;
  onChange: (next: JsonObject) => void;
  pendencyCount: number;
}) {
  const currencyRaw = value.currency;
  const currency = typeof currencyRaw === "string" ? currencyRaw : "";
  const durations = asDurationList(value.durations);
  const negotiationFloor = value.negotiation_floor_pct;
  const externalSurcharge = value.external_surcharge;

  const extras = Object.keys(value).filter((key) => !KNOWN_KEYS.has(key));

  const updateDurations = (next: DurationItem[]) => {
    onChange(setKey(value, "durations", serializeDurations(next)));
  };

  return (
    <SectionShell
      title="Preços e condições"
      description="Moeda, valores por duração, piso de negociação e taxa para deslocamento."
      pendencyCount={pendencyCount}
      rawValue={value}
      onApplyRaw={onChange}
    >
      <div className="form-grid">
        <label className="form-field">
          <span>Moeda</span>
          <select
            value={COMMON_CURRENCIES.includes(currency) ? currency : (currency ? "__custom" : "")}
            onChange={(event) => {
              const v = event.target.value;
              if (v === "") onChange(setKey(value, "currency", undefined));
              else if (v === "__custom") onChange(setKey(value, "currency", currency || ""));
              else onChange(setKey(value, "currency", v));
            }}
          >
            <option value="">Selecione</option>
            {COMMON_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
            <option value="__custom">Outra...</option>
          </select>
          {currency && !COMMON_CURRENCIES.includes(currency) ? (
            <input
              type="text"
              value={currency}
              maxLength={6}
              placeholder="Código ISO da moeda"
              onChange={(event) => onChange(setKey(value, "currency", event.target.value.toUpperCase()))}
            />
          ) : null}
        </label>

        <label className="form-field">
          <span>Desconto máximo permitido (%)</span>
          <PendingValueInput
            value={negotiationFloor}
            type="number"
            min={0}
            max={100}
            placeholder="15"
            ariaLabel="Desconto máximo permitido em porcentagem"
            onChange={(next) =>
              onChange(setKey(value, "negotiation_floor_pct", next === "" ? undefined : next))
            }
          />
        </label>

        <label className="form-field">
          <span>Taxa para deslocamento</span>
          <PendingValueInput
            value={externalSurcharge}
            type="number"
            min={0}
            placeholder="Ex.: 100"
            ariaLabel="Taxa adicional para atendimentos com deslocamento"
            onChange={(next) =>
              onChange(setKey(value, "external_surcharge", next === "" ? undefined : next))
            }
          />
        </label>
      </div>

      <div className="form-field" style={{ marginTop: "var(--space-md)" }}>
        <span>Tabela de preços por duração</span>
        {durations.pending ? (
          <PendingValueInput
            value={PENDING_TOKEN}
            onChange={() => updateDurations([])}
          />
        ) : (
          <div className="stack-sm">
            {durations.items.length === 0 ? (
              <p className="empty-state" style={{ padding: 0, textAlign: "left" }}>
                Nenhuma duração cadastrada.
              </p>
            ) : null}
            {durations.items.map((item, index) => (
              <div key={index} className="form-grid" style={{ gridTemplateColumns: "160px 1fr auto", alignItems: "end" }}>
                <label className="form-field">
                  <span>Duração (min)</span>
                  <input
                    type="number"
                    min={0}
                    value={item.minutes === "" ? "" : item.minutes}
                    placeholder="60"
                    onChange={(event) => {
                      const raw = event.target.value;
                      const next = [...durations.items];
                      next[index] = {
                        ...item,
                        minutes: raw === "" ? "" : Number(raw),
                      };
                      updateDurations(next);
                    }}
                  />
                </label>
                <label className="form-field">
                  <span>Preço ({currency || "valor"})</span>
                  <PendingValueInput
                    value={item.price}
                    type="number"
                    min={0}
                    placeholder="800"
                    ariaLabel={`Preço para ${item.minutes || "?"} minutos`}
                    onChange={(next) => {
                      const list = [...durations.items];
                      list[index] = { ...item, price: next === "" ? "" : next };
                      updateDurations(list);
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="inline-text-button"
                  onClick={() => updateDurations(durations.items.filter((_, i) => i !== index))}
                >
                  Remover
                </button>
              </div>
            ))}
            <div className="button-row" style={{ marginTop: 0 }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => updateDurations([...durations.items, { minutes: "", price: "" }])}
              >
                Adicionar duração
              </button>
              <button
                type="button"
                className="inline-text-button"
                onClick={() => onChange(setKey(value, "durations", PENDING_TOKEN))}
              >
                Marcar como falta decidir
              </button>
            </div>
          </div>
        )}
      </div>

      {extras.length > 0 ? (
        <p className="empty-state" style={{ textAlign: "left", padding: 0 }}>
          Há {extras.length} chave{extras.length === 1 ? "" : "s"} extra{extras.length === 1 ? "" : "s"} preservada{extras.length === 1 ? "" : "s"} no JSON ({extras.join(", ")}). Use “Editar JSON bruto” para revisar.
        </p>
      ) : null}
    </SectionShell>
  );
}
