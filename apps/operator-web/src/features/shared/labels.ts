import type {
  ConversationState,
  FlowType,
  HandoffStatus,
  MediaType,
  ReceiptAnalysisStatus,
  ScheduleSlotStatus,
  ScheduleSource,
  UrgencyProfile,
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
      return "Aguardando humano";
    case "ACKNOWLEDGED":
      return "Humano assumiu";
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

export function receiptAnalysisStatusLabel(status: ReceiptAnalysisStatus | string): string {
  switch (status) {
    case "PENDING":
      return "Aguardando análise";
    case "VALID":
      return "Válido";
    case "INVALID":
      return "Inválido";
    case "UNCERTAIN":
      return "Incerto";
    case "NEEDS_REVIEW":
      return "Precisa revisar";
    default:
      return status;
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

export function escortPendencyKindLabel(kind: string): string {
  switch (kind) {
    case "MISSING_DISPLAY_NAME":
      return "Nome";
    case "EMPTY_LANGUAGES":
      return "Idiomas";
    case "MISSING_CALENDAR_ID":
      return "Agenda";
    case "MISSING_PLACE_OR_DISPLACEMENT":
      return "Local";
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
      return "Aguardando humano assumir";
    case "ACKNOWLEDGED_HANDOFF":
      return "Humano precisa devolver";
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
      return "Deslocamento esperando humano";
    default:
      return fallback;
  }
}

export function queueReason(queueKey: string, fallback: string): string {
  switch (queueKey) {
    case "OPEN_HANDOFF":
      return "A IA pediu atendimento humano e ninguém assumiu ainda.";
    case "ACKNOWLEDGED_HANDOFF":
      return "Um humano assumiu há um tempo e ainda não devolveu para a IA.";
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
      return "Deslocamento em aberto precisa de acompanhamento humano.";
    default:
      return fallback;
  }
}

const URGENCY_PROFILE_LABELS: Record<UrgencyProfile, string> = {
  IMMEDIATE: "urgência imediata",
  SCHEDULED: "horário agendado",
  UNDEFINED_TIME: "sem horário definido",
  ESTIMATED_TIME: "horário estimado",
};

export function urgencyProfileLabel(profile: string | null | undefined): string | null {
  if (!profile) return null;
  return URGENCY_PROFILE_LABELS[profile as UrgencyProfile] ?? profile.toLowerCase();
}

const SCHEDULE_SOURCE_LABELS: Record<ScheduleSource, string> = {
  CALENDAR_SYNC: "Google Calendar",
  MANUAL: "Você",
  AUTO_BLOCK: "IA (negociação)",
};

export function scheduleSourceLabel(source: string | null | undefined): string {
  if (!source) return "—";
  return SCHEDULE_SOURCE_LABELS[source as ScheduleSource] ?? source;
}

export function deliveryStatusLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  switch (status.toUpperCase()) {
    case "SENT":
      return "enviada";
    case "DELIVERED":
      return "entregue";
    case "READ":
      return "lida";
    case "FAILED":
      return "falhou";
    case "PENDING":
      return "enviando";
    default:
      return status;
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
