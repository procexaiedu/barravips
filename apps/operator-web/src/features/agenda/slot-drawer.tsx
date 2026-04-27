"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { ScheduleSlotRead } from "@/contracts";
import { bffSend } from "@/features/shared/bff-client";
import { formatDateTime, formatTime } from "@/features/shared/formatters";
import { scheduleSlotLabel, scheduleSourceLabel } from "@/features/shared/labels";

import { toDateTimeLocal, toIsoOrNull } from "./shared";

type SlotMetadata = Record<string, unknown> & {
  reason?: string;
  conversation_id?: string;
  cancel_reason?: string;
};

function readMetadata(slot: ScheduleSlotRead): SlotMetadata {
  if (!slot.metadata_json || typeof slot.metadata_json !== "object") return {};
  return slot.metadata_json as SlotMetadata;
}

function durationLabel(slot: ScheduleSlotRead): string {
  const start = new Date(slot.starts_at).getTime();
  const end = new Date(slot.ends_at).getTime();
  const diffMs = Math.max(0, end - start);
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours}h ${rest}m`;
}

function pillToneFor(slot: ScheduleSlotRead): string {
  if (slot.status === "BLOCKED") return "chip danger";
  if (slot.status === "HELD") return "chip gold";
  if (slot.status === "CONFIRMED") return "chip";
  if (slot.status === "CANCELLED") return "chip muted";
  return "chip";
}

type Mode = "view" | "edit" | "confirm-cancel" | "confirm-delete";

export function SlotDrawer({
  slot,
  onClose,
  onChanged,
}: {
  slot: ScheduleSlotRead;
  onClose: () => void;
  onChanged: (next: ScheduleSlotRead | null) => void;
}) {
  const metadata = readMetadata(slot);
  const startDate = new Date(slot.starts_at);
  const dayLabel = startDate.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const [mode, setMode] = useState<Mode>("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    starts_at: toDateTimeLocal(new Date(slot.starts_at)),
    ends_at: toDateTimeLocal(new Date(slot.ends_at)),
    reason: typeof metadata.reason === "string" ? metadata.reason : "",
  });
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    setMode("view");
    setError(null);
    setBusy(false);
    setCancelReason("");
    setEditForm({
      starts_at: toDateTimeLocal(new Date(slot.starts_at)),
      ends_at: toDateTimeLocal(new Date(slot.ends_at)),
      reason: typeof metadata.reason === "string" ? metadata.reason : "",
    });
  }, [slot.id, slot.starts_at, slot.ends_at, metadata.reason]);

  const isPast = new Date(slot.ends_at).getTime() < Date.now();

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    const result = await bffSend<ScheduleSlotRead>(
      `/api/operator/schedule/slots/${slot.id}/confirm`,
      {},
    );
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (result.data) onChanged(result.data);
  }

  async function handleCancel() {
    setBusy(true);
    setError(null);
    const result = await bffSend<ScheduleSlotRead>(
      `/api/operator/schedule/slots/${slot.id}/cancel`,
      { reason: cancelReason || null },
    );
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (result.data) onChanged(result.data);
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    const result = await bffSend(
      `/api/operator/schedule/slots/${slot.id}`,
      undefined,
      "DELETE",
    );
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    onChanged(null);
  }

  async function handleSaveEdit() {
    const startsIso = toIsoOrNull(editForm.starts_at);
    const endsIso = toIsoOrNull(editForm.ends_at);
    if (!startsIso || !endsIso) {
      setError("Informe início e fim válidos.");
      return;
    }
    if (new Date(endsIso).getTime() <= new Date(startsIso).getTime()) {
      setError("O fim precisa ser depois do início.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await bffSend<ScheduleSlotRead>(
      `/api/operator/schedule/slots/${slot.id}`,
      {
        starts_at: startsIso,
        ends_at: endsIso,
        reason: editForm.reason || null,
      },
      "PATCH",
    );
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (result.data) {
      onChanged(result.data);
      setMode("view");
    }
  }

  return (
    <aside className="conversation-drawer slot-drawer" aria-label="Detalhes do horário">
      <div className="drawer-header">
        <div>
          <span className="eyebrow">Horário</span>
          <h2>
            {formatTime(slot.starts_at)} – {formatTime(slot.ends_at)}
          </h2>
          <p>{dayLabel}</p>
        </div>
        <button className="drawer-close" type="button" onClick={onClose} aria-label="Fechar">
          ×
        </button>
      </div>

      <div className="drawer-badges">
        <span className={pillToneFor(slot)}>{scheduleSlotLabel(slot.status)}</span>
        <span className="chip">{scheduleSourceLabel(slot.source)}</span>
        <span className="chip muted">{durationLabel(slot)}</span>
      </div>

      {mode === "edit" ? (
        <div className="drawer-section">
          <h3>Editar horário</h3>
          <div className="form-grid">
            <label className="form-field">
              <span>Início</span>
              <input
                type="datetime-local"
                value={editForm.starts_at}
                onChange={(e) => setEditForm({ ...editForm, starts_at: e.target.value })}
              />
            </label>
            <label className="form-field">
              <span>Fim</span>
              <input
                type="datetime-local"
                value={editForm.ends_at}
                onChange={(e) => setEditForm({ ...editForm, ends_at: e.target.value })}
              />
            </label>
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span>Motivo opcional</span>
              <input
                type="text"
                value={editForm.reason}
                onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                placeholder="Ex.: folga, reunião, viagem"
              />
            </label>
          </div>
        </div>
      ) : (
        <div className="drawer-section">
          <h3>Detalhes</h3>
          <dl className="compact-kv">
            <div>
              <dt>Início</dt>
              <dd>{formatDateTime(slot.starts_at)}</dd>
            </div>
            <div>
              <dt>Fim</dt>
              <dd>{formatDateTime(slot.ends_at)}</dd>
            </div>
            <div>
              <dt>Situação</dt>
              <dd>{scheduleSlotLabel(slot.status)}</dd>
            </div>
            <div>
              <dt>Origem</dt>
              <dd>{scheduleSourceLabel(slot.source)}</dd>
            </div>
            {metadata.reason ? (
              <div>
                <dt>Motivo</dt>
                <dd>{String(metadata.reason)}</dd>
              </div>
            ) : null}
            {metadata.cancel_reason ? (
              <div>
                <dt>Cancelado porque</dt>
                <dd>{String(metadata.cancel_reason)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      )}

      {metadata.conversation_id ? (
        <div className="drawer-section">
          <h3>Conversa vinculada</h3>
          <Link className="link-pill" href={`/conversas/${String(metadata.conversation_id)}`}>
            Abrir conversa
          </Link>
        </div>
      ) : null}

      {mode === "confirm-cancel" ? (
        <div className="drawer-section">
          <h3>Confirmar cancelamento</h3>
          <p className="section-subtitle">
            O agente não vai oferecer este horário novamente. Pode informar um motivo opcional.
          </p>
          <label className="form-field">
            <span>Motivo opcional</span>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ex.: cliente desistiu"
            />
          </label>
          <div className="drawer-actions">
            <button className="button" type="button" onClick={handleCancel} disabled={busy}>
              {busy ? "Cancelando..." : "Confirmar cancelamento"}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => setMode("view")}
              disabled={busy}
            >
              Voltar
            </button>
          </div>
        </div>
      ) : null}

      {mode === "confirm-delete" ? (
        <div className="drawer-section">
          <h3>Desbloquear período?</h3>
          <p className="section-subtitle">
            Depois de desbloquear, o agente volta a poder oferecer este horário.
          </p>
          <div className="drawer-actions">
            <button className="button" type="button" onClick={handleDelete} disabled={busy}>
              {busy ? "Desbloqueando..." : "Confirmar desbloqueio"}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => setMode("view")}
              disabled={busy}
            >
              Voltar
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="panel-notice" role="alert" style={{ margin: "0 24px 12px" }}>
          {error}
        </div>
      ) : null}

      {mode === "view" ? (
        <div className="drawer-actions">
          {slot.status === "HELD" ? (
            <>
              <button className="button" type="button" onClick={handleConfirm} disabled={busy}>
                {busy ? "Confirmando..." : "Confirmar"}
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => setMode("edit")}
              >
                Editar horário
              </button>
              <button
                className="button danger"
                type="button"
                onClick={() => setMode("confirm-cancel")}
              >
                Cancelar
              </button>
            </>
          ) : null}
          {slot.status === "CONFIRMED" ? (
            <>
              {!isPast ? (
                <button
                  className="button"
                  type="button"
                  onClick={() => setMode("edit")}
                >
                  Editar horário
                </button>
              ) : null}
              <button
                className="button danger"
                type="button"
                onClick={() => setMode("confirm-cancel")}
              >
                Cancelar
              </button>
            </>
          ) : null}
          {slot.status === "BLOCKED" ? (
            <>
              <button className="button" type="button" onClick={() => setMode("edit")}>
                Editar bloqueio
              </button>
              <button
                className="button danger"
                type="button"
                onClick={() => setMode("confirm-delete")}
              >
                Desbloquear
              </button>
            </>
          ) : null}
          {slot.status === "CANCELLED" || slot.status === "AVAILABLE" ? (
            <p className="section-subtitle" style={{ margin: 0 }}>
              Sem ações disponíveis para este horário.
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === "edit" ? (
        <div className="drawer-actions">
          <button className="button" type="button" onClick={handleSaveEdit} disabled={busy}>
            {busy ? "Salvando..." : "Salvar"}
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => setMode("view")}
            disabled={busy}
          >
            Cancelar edição
          </button>
        </div>
      ) : null}
    </aside>
  );
}
