"use client";

import { useEffect, useState } from "react";

import type { CalendarStatusRead } from "@/contracts";
import { bffFetch } from "@/features/shared/bff-client";
import { formatDateTime } from "@/features/shared/formatters";

type ConnectionState = "loading" | "disconnected" | "connected" | "needs_reconnect";

export function CalendarSettingsCard() {
  const [calendar, setCalendar] = useState<CalendarStatusRead | null>(null);
  const [state, setState] = useState<ConnectionState>("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await bffFetch<CalendarStatusRead>("/api/operator/status/calendar");
      if (cancelled) return;
      if (!result.data) {
        setState("disconnected");
        return;
      }
      setCalendar(result.data);
      const code = result.data.status.toUpperCase();
      if (code === "SYNCED") setState("connected");
      else if (code === "UNAUTHORIZED" || code === "AUTH_EXPIRED") setState("needs_reconnect");
      else setState("disconnected");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="settings-card" aria-labelledby="calendar-settings-title">
      <div className="settings-card-header">
        <div className="settings-card-logo" aria-hidden="true">
          G
        </div>
        <div className="settings-card-copy">
          <h2 id="calendar-settings-title">Google Calendar</h2>
          <p className="section-subtitle">
            {renderCopy(state)}
          </p>
        </div>
      </div>

      <div className="settings-card-body">
        {state === "loading" ? (
          <span className="badge muted">Carregando...</span>
        ) : state === "connected" ? (
          <>
            <div className="settings-card-status">
              <span className="health-dot ok" aria-hidden="true" />
              <strong>Conectado</strong>
              {calendar?.last_synced_at ? (
                <span className="section-subtitle">
                  Última atualização em {formatDateTime(calendar.last_synced_at)}
                </span>
              ) : null}
            </div>
            <button className="button secondary" type="button" disabled>
              Desconectar
            </button>
          </>
        ) : state === "needs_reconnect" ? (
          <>
            <div className="settings-card-status">
              <span className="health-dot attention" aria-hidden="true" />
              <strong>Precisa reconectar</strong>
            </div>
            <button className="button" type="button" disabled>
              Reconectar
            </button>
          </>
        ) : (
          <>
            <div className="settings-card-status">
              <span className="health-dot" aria-hidden="true" />
              <strong>Ainda não conectado</strong>
            </div>
            <button className="button" type="button" disabled>
              Conectar
            </button>
          </>
        )}
      </div>

      <p className="settings-card-footnote">
        A conexão com o Google Calendar é configurada pelo time técnico. Assim que estiver disponível,
        o botão fica ativo aqui.
      </p>
    </section>
  );
}

function renderCopy(state: ConnectionState): string {
  switch (state) {
    case "loading":
      return "Verificando conexão...";
    case "connected":
      return "A agenda da sua modelo está sincronizada com o Google Calendar dela.";
    case "needs_reconnect":
      return "A autorização expirou. Vamos precisar reconectar para continuar sincronizando.";
    case "disconnected":
    default:
      return "Sincronize a agenda da sua modelo com o Google Calendar pessoal dela para evitar conflitos.";
  }
}
