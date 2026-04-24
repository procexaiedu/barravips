import { bffSend, type BffFetchResult } from "./bff-client";

export type HandoffActionResult = BffFetchResult<{
  status: "ACKNOWLEDGED" | "RELEASED";
  conversation_id: string;
}>;

export async function acknowledgeHandoff(conversationId: string): Promise<HandoffActionResult> {
  return bffSend(
    `/api/operator/conversations/${encodeURIComponent(conversationId)}/handoff/acknowledge`,
    undefined,
    "POST",
  );
}

export async function releaseHandoff(conversationId: string): Promise<HandoffActionResult> {
  return bffSend(
    `/api/operator/conversations/${encodeURIComponent(conversationId)}/handoff/release`,
    undefined,
    "POST",
  );
}

export function handoffActionMessage(
  action: "acknowledge" | "release",
  status: number,
): string {
  if (status === 409) {
    return action === "acknowledge"
      ? "Este atendimento humano já não está mais pendente. Atualize a conversa."
      : "A IA já voltou ao atendimento ou a conversa não está em atendimento humano.";
  }
  if (status === 404) {
    return "Conversa não encontrada.";
  }
  if (status === 401) {
    return "Sua sessão expirou. Entre novamente para continuar.";
  }
  return action === "acknowledge"
    ? "Não consegui marcar como assumido. Tente de novo em alguns segundos."
    : "Não consegui devolver para a IA. Tente de novo em alguns segundos.";
}
