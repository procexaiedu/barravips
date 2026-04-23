import type {
  ConversationState,
  FlowType,
  HandoffStatus,
  MediaApprovalStatus,
  MediaType,
  ScheduleSlotStatus,
} from "@/contracts";

export function conversationStateLabel(state: ConversationState | string): string {
  switch (state) {
    case "NOVO":
      return "Novo contato";
    case "QUALIFICANDO":
      return "Conhecendo cliente";
    case "NEGOCIANDO":
      return "Negociando";
    case "CONFIRMADO":
      return "Fechado";
    case "ESCALADO":
      return "Com a modelo";
    default:
      return state;
  }
}

export function flowTypeLabel(flow: FlowType | string): string {
  switch (flow) {
    case "UNDETERMINED":
      return "A definir";
    case "INTERNAL":
      return "No local da modelo";
    case "EXTERNAL":
      return "Deslocamento";
    default:
      return flow;
  }
}

export function handoffStatusLabel(status: HandoffStatus | string): string {
  switch (status) {
    case "NONE":
      return "IA atendendo";
    case "OPENED":
      return "Aguardando modelo";
    case "ACKNOWLEDGED":
      return "Modelo assumiu";
    case "RELEASED":
      return "Devolvida à IA";
    default:
      return status;
  }
}

export function scheduleSlotLabel(status: ScheduleSlotStatus | string): string {
  switch (status) {
    case "AVAILABLE":
      return "Livre";
    case "BLOCKED":
      return "Bloqueado";
    case "HELD":
      return "Reservado";
    case "CONFIRMED":
      return "Confirmado";
    case "CANCELLED":
      return "Cancelado";
    default:
      return status;
  }
}

export function mediaApprovalLabel(status: MediaApprovalStatus | string): string {
  switch (status) {
    case "PENDING":
      return "Aguardando aprovação";
    case "APPROVED":
      return "Aprovada";
    case "REJECTED":
      return "Rejeitada";
    case "REVOKED":
      return "Revogada";
    default:
      return status;
  }
}

export function mediaTypeLabel(type: MediaType | string): string {
  switch (type) {
    case "image":
      return "Foto";
    case "audio":
      return "Áudio";
    case "video":
      return "Vídeo";
    case "document":
      return "Documento";
    default:
      return type;
  }
}

export function calendarSyncLabel(status: string): string {
  switch (status) {
    case "SYNCED":
      return "Sincronizado";
    case "PENDING":
      return "Sincronizando";
    case "ERROR":
      return "Erro ao sincronizar";
    default:
      return status;
  }
}

export function modelPendencyKindLabel(kind: string): string {
  switch (kind) {
    case "PENDING_DECISION":
      return "Falta decidir";
    case "EMPTY_LANGUAGES":
      return "Idiomas";
    case "MISSING_CALENDAR_ID":
      return "Agenda";
    default:
      return kind;
  }
}

export function clientStatusLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  switch (status) {
    case "NEW":
      return "novo";
    case "RETURNING":
      return "recorrente";
    case "VIP":
      return "VIP";
    case "BLOCKED":
      return "bloqueado";
    default:
      return status.toLowerCase();
  }
}

export function queueLabel(queueKey: string, fallback: string): string {
  switch (queueKey) {
    case "OPEN_HANDOFF":
      return "Aguardando modelo assumir";
    case "ACKNOWLEDGED_HANDOFF":
      return "Modelo precisa devolver";
    case "CLIENT_WAITING_RESPONSE":
      return "Cliente sem resposta";
    case "STALE_CONVERSATION":
      return "Conversa parada";
    case "UNDETERMINED_AGED":
      return "Tipo de atendimento sem definição";
    case "NEGOTIATING_AWAITING_INPUT":
      return "Negociando aguardando informação";
    case "AWAITING_CLIENT_DECISION":
      return "Cliente ainda não decidiu";
    case "EXTERNAL_OPEN_HANDOFF":
      return "Deslocamento esperando modelo";
    default:
      return fallback;
  }
}

export function queueReason(queueKey: string, fallback: string): string {
  switch (queueKey) {
    case "OPEN_HANDOFF":
      return "A IA transferiu e a modelo ainda não assumiu.";
    case "ACKNOWLEDGED_HANDOFF":
      return "Modelo assumiu há um tempo e ainda não devolveu para a IA.";
    case "CLIENT_WAITING_RESPONSE":
      return "O cliente mandou mensagem e ninguém respondeu depois.";
    case "STALE_CONVERSATION":
      return "Conversa sem movimento há bastante tempo.";
    case "UNDETERMINED_AGED":
      return "A IA não conseguiu definir se é atendimento no local ou deslocamento.";
    case "NEGOTIATING_AWAITING_INPUT":
      return "Negociação travada esperando uma informação do cliente.";
    case "AWAITING_CLIENT_DECISION":
      return "Aguardando o cliente confirmar a próxima etapa.";
    case "EXTERNAL_OPEN_HANDOFF":
      return "Deslocamento em aberto precisa do acompanhamento da modelo.";
    default:
      return fallback;
  }
}

export function urgencyProfileLabel(profile: string | null | undefined): string | null {
  if (!profile) return null;
  switch (profile) {
    case "IMMEDIATE":
      return "urgência imediata";
    case "HIGH":
      return "urgência alta";
    case "MEDIUM":
      return "urgência média";
    case "LOW":
      return "urgência baixa";
    default:
      return profile.toLowerCase();
  }
}

export function handoffReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  switch (reason) {
    case "external_flow":
      return "Atendimento com deslocamento";
    case "internal_flow":
      return "Atendimento no local da modelo";
    case "pricing":
      return "Negociação de valor";
    case "availability":
      return "Dúvida de agenda";
    case "payment":
      return "Pagamento ou comprovante";
    case "SEM_MOTIVO":
      return "Sem motivo informado";
    default:
      return reason.replace(/_/g, " ");
  }
}
