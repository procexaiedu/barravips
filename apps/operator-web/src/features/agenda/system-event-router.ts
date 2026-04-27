/**
 * Classifica eventos técnicos em 3 categorias:
 * - silent: sem feedback visual (vai só para log).
 * - toast: mensagem amigável e não-técnica.
 * - banner: mensagem persistente com ação clara para o operador.
 *
 * Regra central: se o Fernando não pode/precisa fazer nada, é `silent`.
 */

export type SystemEventClass = "silent" | "toast" | "banner";

export type SystemEventAction = {
  label: string;
  href?: string;
};

export type SystemEventOutcome =
  | { class: "silent" }
  | { class: "toast"; message: string }
  | { class: "banner"; message: string; action?: SystemEventAction };

export type FetchErrorLike = {
  status: number;
  message?: string;
};

export function classifyFetchError(error: FetchErrorLike | null | undefined): SystemEventOutcome {
  if (!error) return { class: "silent" };

  if (error.status === 401) {
    return {
      class: "banner",
      message: "Sua sessão expirou.",
      action: { label: "Entrar de novo", href: "/login" },
    };
  }

  if (error.status === 403) {
    return {
      class: "banner",
      message: "Você não tem permissão para ver essa área.",
    };
  }

  if (error.status === 404) {
    return { class: "silent" };
  }

  if (error.status >= 500) {
    return {
      class: "toast",
      message: "Estamos atualizando sua agenda. Se continuar assim, volte em alguns minutos.",
    };
  }

  return { class: "silent" };
}

export type CalendarStatusLike = {
  status: string;
  last_sync_error?: string | null;
};

/**
 * A maior parte dos estados do calendar é invisível pro Fernando.
 * Só escalamos quando ele precisa reconectar de fato (auth).
 */
export function classifyCalendarStatus(calendar: CalendarStatusLike | null | undefined): SystemEventOutcome {
  if (!calendar) return { class: "silent" };

  const code = calendar.status.toUpperCase();

  if (code === "UNAUTHORIZED" || code === "AUTH_EXPIRED") {
    return {
      class: "banner",
      message: "Reconecte o Google Calendar da sua modelo para manter a agenda atualizada.",
      action: { label: "Reconectar", href: "/agenda/configuracoes" },
    };
  }

  return { class: "silent" };
}

export function classifyBlockError(status: number): SystemEventOutcome {
  if (status === 409) {
    return {
      class: "toast",
      message: "Já existe um bloqueio nesse período — escolha outro intervalo.",
    };
  }
  if (status === 401) {
    return classifyFetchError({ status });
  }
  if (status === 422) {
    return {
      class: "toast",
      message: "Revise os horários de início e fim.",
    };
  }
  return {
    class: "toast",
    message: "Não consegui bloquear o período agora. Tente de novo em alguns segundos.",
  };
}
