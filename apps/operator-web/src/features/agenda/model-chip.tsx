"use client";

import type { EscortRead } from "@/contracts";

const PALETTE = [
  "#f5a524",
  "#22d3ee",
  "#a78bfa",
  "#f472b6",
  "#34d399",
  "#60a5fa",
  "#fbbf24",
];

/** Cor determinística derivada do id. Permite preparar a UI multi-modelo
 *  sem exigir um campo `color_hex` no schema agora. */
export function modelColor(modelId: string): string {
  let hash = 0;
  for (let i = 0; i < modelId.length; i += 1) {
    hash = (hash * 31 + modelId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index]!;
}

export function ModelChipBar({
  models,
  selected,
  onToggle,
}: {
  models: EscortRead[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (models.length <= 1) return null;

  return (
    <div className="model-chip-bar" aria-label="Filtrar por modelo">
      {models.map((model) => {
        const active = selected.size === 0 || selected.has(model.id);
        const color = modelColor(model.id);
        return (
          <button
            key={model.id}
            type="button"
            className={`model-chip${active ? " active" : ""}`}
            onClick={() => onToggle(model.id)}
            aria-pressed={active}
          >
            <span className="model-chip-dot" style={{ backgroundColor: color }} />
            <span>{model.display_name}</span>
          </button>
        );
      })}
    </div>
  );
}
