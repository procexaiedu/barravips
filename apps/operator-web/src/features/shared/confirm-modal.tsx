"use client";

import { useEffect } from "react";

type ConfirmModalProps = {
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  tone = "default",
  loading,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !loading) {
          onCancel();
        }
      }}
    >
      <div className="modal">
        <h2 id="confirm-modal-title" style={{ margin: 0 }}>
          {title}
        </h2>
        {description ? <div>{description}</div> : null}
        <div className="button-row" style={{ justifyContent: "flex-end" }}>
          <button className="button secondary" type="button" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            className={tone === "danger" ? "button danger" : "button"}
            type="button"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Enviando..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
