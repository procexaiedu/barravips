"use client";

import { useState, type ReactNode } from "react";

export const PENDING_TOKEN = "PENDING_DECISION";

export type JsonObject = Record<string, unknown>;

export function isPending(value: unknown): boolean {
  return value === PENDING_TOKEN;
}

export function stringifyJson(payload: JsonObject | null | undefined): string {
  return JSON.stringify(payload ?? {}, null, 2);
}

export type ParseResult =
  | { ok: true; data: JsonObject }
  | { ok: false; error: string };

export function tryParseObject(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, data: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "JSON inválido. Verifique chaves, vírgulas e aspas." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Use um objeto JSON com chaves e valores." };
  }
  return { ok: true, data: parsed as JsonObject };
}

export function asString(value: unknown): string {
  if (value === null || value === undefined || isPending(value)) return "";
  if (typeof value === "string") return value;
  return String(value);
}

export function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || isPending(value)) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => String(item));
}

export function setKey(base: JsonObject, key: string, value: unknown): JsonObject {
  if (value === undefined) {
    const next = { ...base };
    delete next[key];
    return next;
  }
  return { ...base, [key]: value };
}

export function setNested(base: JsonObject, path: string[], value: unknown): JsonObject {
  if (path.length === 0) return base;
  const [head, ...rest] = path;
  if (rest.length === 0) {
    return setKey(base, head, value);
  }
  const child = base[head];
  const childObj: JsonObject =
    child && typeof child === "object" && !Array.isArray(child) ? (child as JsonObject) : {};
  return { ...base, [head]: setNested(childObj, rest, value) };
}

export function getNested(base: JsonObject | null | undefined, path: string[]): unknown {
  let cursor: unknown = base ?? {};
  for (const key of path) {
    if (cursor && typeof cursor === "object" && !Array.isArray(cursor)) {
      cursor = (cursor as JsonObject)[key];
    } else {
      return undefined;
    }
  }
  return cursor;
}

export function SectionShell({
  title,
  description,
  badge,
  pendencyCount,
  children,
  rawValue,
  onApplyRaw,
  rawError,
}: {
  title: string;
  description: string;
  badge?: string;
  pendencyCount: number;
  children: ReactNode;
  rawValue: JsonObject;
  onApplyRaw: (next: JsonObject) => void;
  rawError?: string | null;
}) {
  const [rawMode, setRawMode] = useState(false);
  const [rawText, setRawText] = useState(() => stringifyJson(rawValue));
  const [localError, setLocalError] = useState<string | null>(null);

  const startRaw = () => {
    setRawText(stringifyJson(rawValue));
    setLocalError(null);
    setRawMode(true);
  };

  const apply = () => {
    const parsed = tryParseObject(rawText);
    if (!parsed.ok) {
      setLocalError(parsed.error);
      return;
    }
    onApplyRaw(parsed.data);
    setLocalError(null);
    setRawMode(false);
  };

  const cancel = () => {
    setLocalError(null);
    setRawMode(false);
  };

  const showBadge = badge ?? (pendencyCount > 0 ? `${pendencyCount} pendência${pendencyCount === 1 ? "" : "s"}` : "Estruturado");
  const badgeClass = pendencyCount > 0 ? "badge warning" : "badge";

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <span className={badgeClass}>{showBadge}</span>
      </div>
      <p className="empty-state" style={{ textAlign: "left", padding: "0 0 10px 0" }}>
        {description}
      </p>
      {!rawMode ? (
        <>
          {children}
          <div className="button-row">
            <button type="button" className="button secondary" onClick={startRaw}>
              Editar JSON bruto
            </button>
          </div>
        </>
      ) : (
        <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
          <label className="form-field">
            <span>JSON bruto (uso avançado)</span>
            <textarea
              className="mono"
              rows={12}
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              spellCheck={false}
            />
          </label>
          {localError ? <div className="panel-notice">{localError}</div> : null}
          {rawError ? <div className="panel-notice">{rawError}</div> : null}
          <div className="button-row" style={{ marginTop: 0 }}>
            <button type="button" className="button" onClick={apply}>
              Aplicar JSON
            </button>
            <button type="button" className="button secondary" onClick={cancel}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function PendingValueInput({
  value,
  onChange,
  type = "text",
  placeholder,
  ariaLabel,
  step,
  min,
  max,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
  type?: "text" | "number";
  placeholder?: string;
  ariaLabel?: string;
  step?: number;
  min?: number;
  max?: number;
}) {
  const pending = isPending(value);
  if (pending) {
    return (
      <div className="inline-actions">
        <span className="chip warning">Falta decidir</span>
        <button
          type="button"
          className="inline-text-button"
          onClick={() => onChange(type === "number" ? "" : "")}
        >
          Definir agora
        </button>
      </div>
    );
  }
  return (
    <div className="inline-actions" style={{ width: "100%" }}>
      <input
        type={type}
        value={asString(value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        step={step}
        min={min}
        max={max}
        onChange={(event) => {
          const raw = event.target.value;
          if (type === "number") {
            if (raw === "") {
              onChange("");
              return;
            }
            const n = Number(raw);
            onChange(Number.isFinite(n) ? n : raw);
          } else {
            onChange(raw);
          }
        }}
        style={{ flex: 1, minWidth: 100 }}
      />
      <button
        type="button"
        className="inline-text-button"
        onClick={() => onChange(PENDING_TOKEN)}
        title="Marcar como falta decidir"
      >
        Falta decidir
      </button>
    </div>
  );
}

export function StringListEditor({
  values,
  onChange,
  placeholder,
  addLabel = "Adicionar",
  emptyMessage = "Nada cadastrado.",
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  emptyMessage?: string;
}) {
  return (
    <div className="stack-sm">
      {values.length === 0 ? <p className="empty-state" style={{ padding: 0, textAlign: "left" }}>{emptyMessage}</p> : null}
      {values.map((item, index) => (
        <div className="inline-actions" key={index} style={{ width: "100%" }}>
          <input
            type="text"
            value={item}
            placeholder={placeholder}
            onChange={(event) => {
              const next = [...values];
              next[index] = event.target.value;
              onChange(next);
            }}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="inline-text-button"
            onClick={() => onChange(values.filter((_, i) => i !== index))}
          >
            Remover
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button secondary"
        style={{ justifySelf: "start" }}
        onClick={() => onChange([...values, ""])}
      >
        {addLabel}
      </button>
    </div>
  );
}
