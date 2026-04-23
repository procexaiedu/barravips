export type ConversationState =
  | "NOVO"
  | "QUALIFICANDO"
  | "NEGOCIANDO"
  | "CONFIRMADO"
  | "ESCALADO";

export type FlowType = "INTERNAL" | "EXTERNAL" | "UNDETERMINED";

export type HandoffStatus = "NONE" | "OPENED" | "ACKNOWLEDGED" | "RELEASED";

export type ClientStatus = "NEW" | "RETURNING" | "VIP" | "BLOCKED";

export type UrgencyProfile =
  | "IMMEDIATE"
  | "SCHEDULED"
  | "UNDEFINED_TIME"
  | "ESTIMATED_TIME";

export type MessageDirection = "INBOUND" | "OUTBOUND";

export type MessageRole = "client" | "agent" | "human";

export type MessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "system";

export type ScheduleSlotStatus =
  | "AVAILABLE"
  | "BLOCKED"
  | "HELD"
  | "CONFIRMED"
  | "CANCELLED";

export type ScheduleSource = "CALENDAR_SYNC" | "MANUAL" | "AUTO_BLOCK";

export type CalendarSyncStatus = "PENDING" | "SYNCED" | "ERROR";

export type MediaType = "image" | "audio" | "video" | "document";

export type MediaApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "REVOKED";

export type ReceiptAnalysisStatus =
  | "PENDING"
  | "VALID"
  | "INVALID"
  | "UNCERTAIN"
  | "NEEDS_REVIEW";

export type EvolutionStatus =
  | "CONNECTED"
  | "DISCONNECTED"
  | "QR_REQUIRED"
  | "UNKNOWN";

export type CalendarStatus =
  | "LOCAL_CACHE_ONLY"
  | "SYNCED"
  | "ERROR"
  | "UNKNOWN";

export type HealthStatus = "ok" | "degraded" | "down";

export type DatabaseStatus = "ok" | "down";

export type AgentExecutionStatus = "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED";

export type AgentOpsWindowKey = "requested";

export type AgentOpsSampleMethod = "full_aggregate";

export type DashboardWindowKey = "requested" | "today" | "next_14_days" | "all_time";

export type DashboardSampleMethod = "full_aggregate";

export type MediaUsageWindowKey = "requested" | "all_time";

export type MediaUsageSampleMethod = "full_aggregate";

export type HandoffSummaryWindowKey = "requested" | "all_time";

export type HandoffSummarySampleMethod = "full_aggregate";

export type ConversationQueueKey =
  | "OPEN_HANDOFF"
  | "ACKNOWLEDGED_HANDOFF"
  | "CLIENT_WAITING_RESPONSE"
  | "STALE_CONVERSATION"
  | "UNDETERMINED_AGED"
  | "NEGOTIATING_AWAITING_INPUT"
  | "AWAITING_CLIENT_DECISION"
  | "EXTERNAL_OPEN_HANDOFF";

export type HandoffEventType =
  | "handoff_opened"
  | "handoff_acknowledged"
  | "handoff_released";

export type HandoffSource =
  | "agent"
  | "chatwoot"
  | "operator_ui"
  | "whatsapp_manual"
  | "system";

export type PaginatedEnvelope<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

export type ClientBrief = {
  id: string;
  display_name: string | null;
  whatsapp_jid: string;
  client_status?: ClientStatus | null;
  profile_summary?: string | null;
  language_hint?: string | null;
};

export type ModelBrief = {
  id: string;
  display_name: string;
};

export type ModelRead = {
  id: string;
  display_name: string;
  is_active: boolean;
  persona_json: Record<string, unknown>;
  services_json: Record<string, unknown>;
  pricing_json: Record<string, unknown>;
  languages: string[];
  calendar_external_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ModelCreateInput = {
  display_name: string;
  is_active: boolean;
  persona_json: Record<string, unknown>;
  services_json: Record<string, unknown>;
  pricing_json: Record<string, unknown>;
  languages: string[];
  calendar_external_id: string | null;
};

export type ModelPatchInput = Partial<ModelCreateInput>;

export type LastMessageRead = {
  direction: MessageDirection;
  message_type: MessageType;
  content_preview: string | null;
  created_at: string;
  delivery_status: string | null;
};

export type ConversationRead = {
  id: string;
  client: ClientBrief;
  model: ModelBrief;
  state: ConversationState;
  flow_type: FlowType;
  handoff_status: HandoffStatus;
  summary?: string | null;
  pending_action: string | null;
  awaiting_input_type: string | null;
  awaiting_client_decision?: boolean | null;
  urgency_profile?: UrgencyProfile | null;
  expected_amount?: string | number | null;
  last_handoff_at?: string | null;
  last_message: LastMessageRead | null;
  last_message_at: string | null;
};

export type ConversationQueueItemRead = {
  queue_key: ConversationQueueKey;
  queue_label: string;
  queue_priority: number;
  conversation_id: string;
  client_display_name: string | null;
  client_identifier: string;
  state: ConversationState;
  flow_type: FlowType;
  handoff_status: HandoffStatus;
  relevant_at: string | null;
  age_seconds: number | null;
  age_source: string;
  reason: string;
  drilldown_href: string;
  source: string;
  window: string;
  sample_size: number;
};

export type ConversationMessageRead = {
  id: string;
  direction: MessageDirection;
  role: MessageRole;
  message_type: MessageType;
  content_text: string | null;
  delivery_status: string | null;
  from_me: boolean;
  trace_id: string | null;
  created_at: string;
};

export type HandoffEventRead = {
  id: string | null;
  conversation_id: string;
  event_type: HandoffEventType;
  previous_handoff_status: HandoffStatus;
  source: HandoffSource;
  actor_label: string | null;
  reason: string | null;
  metadata_json: Record<string, unknown>;
  trace_id: string | null;
  created_at: string | null;
};

export type AgentExecutionRead = {
  trace_id: string;
  status: AgentExecutionStatus;
  duration_ms: number | null;
  tool_count: number;
};

export type ConversationMediaRef = {
  id: string;
  model_id: string;
  media_type: MediaType;
  category: string | null;
  approval_status: MediaApprovalStatus;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ConversationDetailRead = {
  conversation: ConversationRead;
  messages: ConversationMessageRead[];
  handoff_events: HandoffEventRead[];
  media: ConversationMediaRef[];
  agent_execution: AgentExecutionRead | null;
};

export type ScheduleSlotRead = {
  id: string;
  model_id: string;
  starts_at: string;
  ends_at: string;
  status: ScheduleSlotStatus;
  source: ScheduleSource;
  external_event_id: string | null;
  calendar_sync_status: CalendarSyncStatus;
  last_synced_at: string | null;
  last_sync_error: string | null;
};

export type MediaRead = {
  id: string;
  model_id: string;
  media_type: MediaType;
  category: string | null;
  approval_status: MediaApprovalStatus;
  send_constraints_json: Record<string, unknown>;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type MediaUsageWindowRead = {
  key: MediaUsageWindowKey;
  label: string;
  starts_at: string | null;
  ends_at: string | null;
};

export type MediaUsageMetricMeta = {
  source: string;
  window: MediaUsageWindowKey;
  sample_method: MediaUsageSampleMethod;
  sample_size: number;
};

export type MediaUsageCountMetric = {
  value: number;
  meta: MediaUsageMetricMeta;
};

export type MediaUsageBreakdownMetric = {
  counts: Record<string, number>;
  meta: MediaUsageMetricMeta;
};

export type MediaUsageRankItemRead = {
  media_id: string;
  media_type: MediaType;
  category: string | null;
  approval_status: MediaApprovalStatus;
  count: number;
  drilldown_href: string;
};

export type MediaUsageRankRead = {
  items: MediaUsageRankItemRead[];
  meta: MediaUsageMetricMeta;
};

export type MediaUsageSummaryRead = {
  generated_at: string;
  requested_window: "7d";
  delivery_status_available: boolean;
  windows: Record<MediaUsageWindowKey, MediaUsageWindowRead>;
  pending: MediaUsageCountMetric;
  without_category: MediaUsageCountMetric;
  approved_by_category: MediaUsageBreakdownMetric;
  most_used: MediaUsageRankRead;
  send_failures: MediaUsageRankRead;
};

export type ReceiptRead = {
  id: string;
  conversation_id: string;
  client: ClientBrief;
  model: ModelBrief;
  message_id: string;
  detected_amount: string | number | null;
  expected_amount: string | number | null;
  analysis_status: ReceiptAnalysisStatus;
  tolerance_applied: string | number | null;
  needs_review: boolean;
  metadata_json: Record<string, unknown>;
  drilldown_href: string;
  created_at: string;
  updated_at: string;
};

export type HealthStatusRead = {
  status: HealthStatus;
  database: DatabaseStatus;
  checked_at: string;
};

export type EvolutionStatusRead = {
  provider: "evolution";
  instance: string;
  status: EvolutionStatus;
  qr_code_ref: string | null;
  last_event_at: string | null;
  updated_at: string;
};

export type CalendarStatusRead = {
  provider: "calendar";
  instance: string;
  status: CalendarStatus;
  pending_slots: number;
  error_slots: number;
  last_synced_at: string | null;
  last_sync_error: string | null;
  updated_at: string;
};

export type AgentOpsWindowRead = {
  key: AgentOpsWindowKey;
  label: string;
  starts_at: string;
  ends_at: string;
};

export type AgentOpsMetricMeta = {
  source: string;
  window: AgentOpsWindowKey;
  sample_method: AgentOpsSampleMethod;
  sample_size: number;
};

export type AgentOpsCountMetric = {
  value: number;
  meta: AgentOpsMetricMeta;
};

export type AgentOpsBreakdownMetric = {
  counts: Record<string, number>;
  meta: AgentOpsMetricMeta;
};

export type AgentOpsDurationMetric = {
  p50_ms: number | null;
  p95_ms: number | null;
  average_ms: number | null;
  meta: AgentOpsMetricMeta;
};

export type AgentOpsFailureRead = {
  id: string;
  conversation_id: string;
  trace_id: string;
  status: "PARTIAL" | "FAILED";
  duration_ms: number | null;
  tool_count: number;
  retry_count: number;
  fallback_used: boolean;
  error_summary: string | null;
  created_at: string;
  drilldown_href: string;
};

export type AgentOpsSummaryRead = {
  generated_at: string;
  requested_window: "24h";
  windows: Record<AgentOpsWindowKey, AgentOpsWindowRead>;
  total_executions: AgentOpsCountMetric;
  executions_by_status: AgentOpsBreakdownMetric;
  failed_or_partial: AgentOpsCountMetric;
  duration: AgentOpsDurationMetric;
  fallback_used: AgentOpsCountMetric;
  tool_failures: AgentOpsCountMetric;
  latest_failures: AgentOpsFailureRead[];
  latest_failures_meta: AgentOpsMetricMeta;
};

export type DashboardWindowRead = {
  key: DashboardWindowKey;
  label: string;
  starts_at: string | null;
  ends_at: string | null;
};

export type DashboardMetricMeta = {
  source: string;
  window: DashboardWindowKey;
  sample_method: DashboardSampleMethod;
  sample_size: number;
};

export type DashboardCountMetric = {
  value: number;
  meta: DashboardMetricMeta;
};

export type DashboardBreakdownMetric = {
  counts: Record<string, number>;
  meta: DashboardMetricMeta;
};

export type DashboardSummaryRead = {
  generated_at: string;
  requested_window: "24h";
  windows: Record<DashboardWindowKey, DashboardWindowRead>;
  total_conversations: DashboardCountMetric;
  active_conversations: DashboardCountMetric;
  new_conversations_today: DashboardCountMetric;
  conversations_by_state: DashboardBreakdownMetric;
  conversations_by_flow_type: DashboardBreakdownMetric;
  conversations_by_handoff_status: DashboardBreakdownMetric;
  handoffs_opened: DashboardCountMetric;
  handoffs_acknowledged: DashboardCountMetric;
  media_pending: DashboardCountMetric;
  media_without_category: DashboardCountMetric;
  schedule_slots_next_14d_total: DashboardCountMetric;
  schedule_slots_next_14d_by_status: DashboardBreakdownMetric;
  calendar_sync_pending: DashboardCountMetric;
  calendar_sync_error: DashboardCountMetric;
};

export type HandoffSummaryWindowRead = {
  key: HandoffSummaryWindowKey;
  label: string;
  starts_at: string | null;
  ends_at: string | null;
};

export type HandoffSummaryMetricMeta = {
  source: string;
  window: HandoffSummaryWindowKey;
  sample_method: HandoffSummarySampleMethod;
  sample_size: number;
};

export type HandoffSummaryBreakdownMetric = {
  counts: Record<string, number>;
  meta: HandoffSummaryMetricMeta;
};

export type HandoffSummaryDurationMetric = {
  average_seconds: number | null;
  min_seconds: number | null;
  max_seconds: number | null;
  meta: HandoffSummaryMetricMeta;
};

export type HandoffSummaryRead = {
  generated_at: string;
  requested_window: "7d";
  windows: Record<HandoffSummaryWindowKey, HandoffSummaryWindowRead>;
  current_by_status: HandoffSummaryBreakdownMetric;
  open_age_buckets: HandoffSummaryBreakdownMetric;
  reasons: HandoffSummaryBreakdownMetric;
  time_to_acknowledge: HandoffSummaryDurationMetric | null;
  time_to_release: HandoffSummaryDurationMetric | null;
};

export type BffErrorBody = {
  error: {
    status: number;
    message: string;
    detail?: unknown;
  };
};
