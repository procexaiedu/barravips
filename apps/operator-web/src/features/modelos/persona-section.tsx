"use client";

import {
  asString,
  asStringArray,
  isPending,
  PENDING_TOKEN,
  PendingValueInput,
  SectionShell,
  setKey,
  StringListEditor,
  type JsonObject,
} from "./section-utils";

const KNOWN_KEYS = new Set([
  "persona",
  "tom",
  "style",
  "vocabulary",
  "things_to_avoid",
  "limits",
  "fixture_only",
]);

export function PersonaSection({
  value,
  onChange,
  pendencyCount,
}: {
  value: JsonObject;
  onChange: (next: JsonObject) => void;
  pendencyCount: number;
}) {
  const persona = value.persona;
  const tom = value.tom;
  const style = value.style;
  const limits = value.limits;
  const vocabulary = asStringArray(value.vocabulary);
  const thingsToAvoid = asStringArray(value.things_to_avoid);

  const extras = Object.keys(value).filter((key) => !KNOWN_KEYS.has(key));

  return (
    <SectionShell
      title="Persona da modelo"
      description="Como a IA deve soar como a modelo: tom, estilo, vocabulário e o que evitar."
      pendencyCount={pendencyCount}
      rawValue={value}
      onApplyRaw={onChange}
    >
      <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
        <label className="form-field">
          <span>Personalidade geral</span>
          {isPending(persona) ? (
            <PendingValueInput
              value={persona}
              onChange={(next) => onChange(setKey(value, "persona", next))}
              placeholder="Ex.: descontraída, segura, com humor sutil..."
            />
          ) : (
            <textarea
              rows={3}
              value={asString(persona)}
              placeholder="Ex.: descontraída, segura, com humor sutil..."
              onChange={(event) => onChange(setKey(value, "persona", event.target.value))}
            />
          )}
          {!isPending(persona) ? (
            <button
              type="button"
              className="inline-text-button"
              onClick={() => onChange(setKey(value, "persona", PENDING_TOKEN))}
            >
              Marcar como falta decidir
            </button>
          ) : null}
        </label>

        <label className="form-field">
          <span>Tom de voz</span>
          {isPending(tom) ? (
            <PendingValueInput
              value={tom}
              onChange={(next) => onChange(setKey(value, "tom", next))}
              placeholder="Ex.: caloroso e direto"
            />
          ) : (
            <input
              type="text"
              value={asString(tom)}
              placeholder="Ex.: caloroso e direto"
              onChange={(event) => onChange(setKey(value, "tom", event.target.value))}
            />
          )}
          {!isPending(tom) ? (
            <button
              type="button"
              className="inline-text-button"
              onClick={() => onChange(setKey(value, "tom", PENDING_TOKEN))}
            >
              Marcar como falta decidir
            </button>
          ) : null}
        </label>

        <label className="form-field">
          <span>Estilo de escrita</span>
          {isPending(style) ? (
            <PendingValueInput
              value={style}
              onChange={(next) => onChange(setKey(value, "style", next))}
              placeholder="Ex.: frases curtas, sem emojis, mensagens diretas"
            />
          ) : (
            <textarea
              rows={3}
              value={asString(style)}
              placeholder="Ex.: frases curtas, sem emojis, mensagens diretas"
              onChange={(event) => onChange(setKey(value, "style", event.target.value))}
            />
          )}
          {!isPending(style) ? (
            <button
              type="button"
              className="inline-text-button"
              onClick={() => onChange(setKey(value, "style", PENDING_TOKEN))}
            >
              Marcar como falta decidir
            </button>
          ) : null}
        </label>

        <label className="form-field">
          <span>Limites de comportamento</span>
          <textarea
            rows={3}
            value={asString(limits)}
            placeholder="Ex.: não falar de política, não combinar fora do horário"
            onChange={(event) => {
              const text = event.target.value;
              onChange(setKey(value, "limits", text === "" ? undefined : text));
            }}
          />
        </label>

        <div className="form-field">
          <span>Vocabulário e expressões típicas</span>
          <StringListEditor
            values={vocabulary}
            onChange={(next) => onChange(setKey(value, "vocabulary", next.length ? next : undefined))}
            placeholder="Ex.: amor, querido"
            addLabel="Adicionar expressão"
            emptyMessage="Sem expressões cadastradas."
          />
        </div>

        <div className="form-field">
          <span>Coisas a não dizer</span>
          <StringListEditor
            values={thingsToAvoid}
            onChange={(next) => onChange(setKey(value, "things_to_avoid", next.length ? next : undefined))}
            placeholder="Ex.: não usar 'baby'"
            addLabel="Adicionar item"
            emptyMessage="Sem proibições cadastradas."
          />
        </div>

        {extras.length > 0 ? (
          <p className="empty-state" style={{ textAlign: "left", padding: 0 }}>
            Há {extras.length} chave{extras.length === 1 ? "" : "s"} extra{extras.length === 1 ? "" : "s"} preservada{extras.length === 1 ? "" : "s"} no JSON ({extras.join(", ")}). Use “Editar JSON bruto” para revisar.
          </p>
        ) : null}
      </div>
    </SectionShell>
  );
}
