from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import Field

from .common import ContractModel
from .handoff import HandoffEventContract


ConversationState = Literal["NOVO", "QUALIFICANDO", "NEGOCIANDO", "CONFIRMADO", "ESCALADO"]
FlowType = Literal["INTERNAL", "EXTERNAL", "UNDETERMINED"]
HandoffStatus = Literal["NONE", "OPENED", "ACKNOWLEDGED", "RELEASED"]
ClientStatus = Literal["NEW", "RETURNING", "VIP", "BLOCKED"]
UrgencyProfile = Literal["IMMEDIATE", "SCHEDULED", "UNDEFINED_TIME", "ESTIMATED_TIME"]
DashboardWindowKey = Literal["requested", "today", "next_14_days", "all_time"]
DashboardSampleMethod = Literal["full_aggregate"]
MediaUsageWindowKey = Literal["requested", "all_time"]
MediaUsageSampleMethod = Literal["full_aggregate"]
AgentOpsWindowKey = Literal["requested"]
AgentOpsSampleMethod = Literal["full_aggregate"]
HandoffSummaryWindowKey = Literal["requested", "all_time"]
HandoffSummarySampleMethod = Literal["full_aggregate"]
ReceiptAnalysisStatus = Literal["PENDING", "VALID", "INVALID", "UNCERTAIN", "NEEDS_REVIEW"]
ConversationQueueKey = Literal[
    "OPEN_HANDOFF",
    "ACKNOWLEDGED_HANDOFF",
    "CLIENT_WAITING_RESPONSE",
    "STALE_CONVERSATION",
    "UNDETERMINED_AGED",
    "NEGOTIATING_AWAITING_INPUT",
    "AWAITING_CLIENT_DECISION",
    "EXTERNAL_OPEN_HANDOFF",
]


class ClientBrief(ContractModel):
    id: UUID
    display_name: str | None = None
    whatsapp_jid: str
    client_status: ClientStatus | None = None
    profile_summary: str | None = None
    language_hint: str | None = None


class ModelBrief(ContractModel):
    id: UUID
    display_name: str


class ModelRead(ContractModel):
    id: UUID
    display_name: str
    is_active: bool
    persona_json: dict
    services_json: dict
    pricing_json: dict
    languages: list[str]
    calendar_external_id: str | None = None
    created_at: datetime
    updated_at: datetime


class LastMessageRead(ContractModel):
    direction: Literal["INBOUND", "OUTBOUND"]
    message_type: Literal["text", "image", "audio", "video", "document", "system"]
    content_preview: str | None = None
    created_at: datetime
    delivery_status: str | None = None


class ConversationRead(ContractModel):
    id: UUID
    client: ClientBrief
    model: ModelBrief
    state: ConversationState
    flow_type: FlowType
    handoff_status: HandoffStatus
    summary: str | None = None
    pending_action: str | None = None
    awaiting_input_type: str | None = None
    awaiting_client_decision: bool | None = None
    urgency_profile: UrgencyProfile | None = None
    expected_amount: Decimal | None = None
    last_handoff_at: datetime | None = None
    last_message: LastMessageRead | None = None
    last_message_at: datetime | None = None


class ConversationQueueItemRead(ContractModel):
    queue_key: ConversationQueueKey
    queue_label: str
    queue_priority: int = Field(ge=1)
    conversation_id: UUID
    client_display_name: str | None = None
    client_identifier: str
    state: ConversationState
    flow_type: FlowType
    handoff_status: HandoffStatus
    relevant_at: datetime | None = None
    age_seconds: int | None = Field(default=None, ge=0)
    age_source: str
    reason: str
    drilldown_href: str
    source: str
    window: str
    sample_size: int = Field(ge=0)


class ConversationMessageRead(ContractModel):
    id: UUID
    direction: Literal["INBOUND", "OUTBOUND"]
    role: Literal["client", "agent", "human"]
    message_type: Literal["text", "image", "audio", "video", "document", "system"]
    content_text: str | None = None
    delivery_status: str | None = None
    from_me: bool
    trace_id: UUID | None = None
    created_at: datetime


class AgentExecutionRead(ContractModel):
    trace_id: UUID
    status: Literal["SUCCESS", "PARTIAL", "FAILED", "SKIPPED"]
    duration_ms: int | None = Field(default=None, ge=0)
    tool_count: int = Field(default=0, ge=0)


class ConversationDetailRead(ContractModel):
    conversation: ConversationRead
    messages: list[ConversationMessageRead]
    handoff_events: list[HandoffEventContract]
    media: list[dict]
    agent_execution: AgentExecutionRead | None = None


class ScheduleSlotRead(ContractModel):
    id: UUID
    model_id: UUID
    starts_at: datetime
    ends_at: datetime
    status: Literal["AVAILABLE", "BLOCKED", "HELD", "CONFIRMED", "CANCELLED"]
    source: Literal["CALENDAR_SYNC", "MANUAL", "AUTO_BLOCK"]
    external_event_id: str | None = None
    calendar_sync_status: Literal["PENDING", "SYNCED", "ERROR"]
    last_synced_at: datetime | None = None
    last_sync_error: str | None = None


class EvolutionStatusRead(ContractModel):
    provider: Literal["evolution"] = "evolution"
    instance: str
    status: Literal["CONNECTED", "DISCONNECTED", "QR_REQUIRED", "UNKNOWN"]
    qr_code_ref: str | None = None
    last_event_at: datetime | None = None
    updated_at: datetime


class CalendarStatusRead(ContractModel):
    provider: Literal["calendar"] = "calendar"
    instance: str
    status: Literal["LOCAL_CACHE_ONLY", "SYNCED", "ERROR", "UNKNOWN"]
    pending_slots: int = Field(default=0, ge=0)
    error_slots: int = Field(default=0, ge=0)
    last_synced_at: datetime | None = None
    last_sync_error: str | None = None
    updated_at: datetime


class HealthStatusRead(ContractModel):
    status: Literal["ok", "degraded", "down"]
    database: Literal["ok", "down"]
    checked_at: datetime


class AgentOpsWindowRead(ContractModel):
    key: AgentOpsWindowKey
    label: str
    starts_at: datetime
    ends_at: datetime


class AgentOpsMetricMeta(ContractModel):
    source: str
    window: AgentOpsWindowKey
    sample_method: AgentOpsSampleMethod = "full_aggregate"
    sample_size: int = Field(ge=0)


class AgentOpsCountMetric(ContractModel):
    value: int = Field(ge=0)
    meta: AgentOpsMetricMeta


class AgentOpsBreakdownMetric(ContractModel):
    counts: dict[str, int]
    meta: AgentOpsMetricMeta


class AgentOpsDurationMetric(ContractModel):
    p50_ms: int | None = Field(default=None, ge=0)
    p95_ms: int | None = Field(default=None, ge=0)
    average_ms: int | None = Field(default=None, ge=0)
    meta: AgentOpsMetricMeta


class AgentOpsFailureRead(ContractModel):
    id: UUID
    conversation_id: UUID
    trace_id: UUID
    status: Literal["PARTIAL", "FAILED"]
    duration_ms: int | None = Field(default=None, ge=0)
    tool_count: int = Field(default=0, ge=0)
    retry_count: int = Field(default=0, ge=0)
    fallback_used: bool = False
    error_summary: str | None = None
    created_at: datetime
    drilldown_href: str


class AgentOpsSummaryRead(ContractModel):
    generated_at: datetime
    requested_window: Literal["24h"]
    windows: dict[AgentOpsWindowKey, AgentOpsWindowRead]
    total_executions: AgentOpsCountMetric
    executions_by_status: AgentOpsBreakdownMetric
    failed_or_partial: AgentOpsCountMetric
    duration: AgentOpsDurationMetric
    fallback_used: AgentOpsCountMetric
    tool_failures: AgentOpsCountMetric
    latest_failures: list[AgentOpsFailureRead]
    latest_failures_meta: AgentOpsMetricMeta


class MediaRead(ContractModel):
    id: UUID
    model_id: UUID
    media_type: Literal["image", "audio", "video", "document"]
    category: str | None = None
    approval_status: Literal["PENDING", "APPROVED", "REJECTED", "REVOKED"]
    send_constraints_json: dict = Field(default_factory=dict)
    metadata_json: dict = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class MediaUsageWindowRead(ContractModel):
    key: MediaUsageWindowKey
    label: str
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class MediaUsageMetricMeta(ContractModel):
    source: str
    window: MediaUsageWindowKey
    sample_method: MediaUsageSampleMethod = "full_aggregate"
    sample_size: int = Field(ge=0)


class MediaUsageCountMetric(ContractModel):
    value: int = Field(ge=0)
    meta: MediaUsageMetricMeta


class MediaUsageBreakdownMetric(ContractModel):
    counts: dict[str, int]
    meta: MediaUsageMetricMeta


class MediaUsageRankItemRead(ContractModel):
    media_id: UUID
    media_type: Literal["image", "audio", "video", "document"]
    category: str | None = None
    approval_status: Literal["PENDING", "APPROVED", "REJECTED", "REVOKED"]
    count: int = Field(ge=0)
    drilldown_href: str


class MediaUsageRankRead(ContractModel):
    items: list[MediaUsageRankItemRead]
    meta: MediaUsageMetricMeta


class MediaUsageSummaryRead(ContractModel):
    generated_at: datetime
    requested_window: Literal["7d"]
    delivery_status_available: bool
    windows: dict[MediaUsageWindowKey, MediaUsageWindowRead]
    pending: MediaUsageCountMetric
    without_category: MediaUsageCountMetric
    approved_by_category: MediaUsageBreakdownMetric
    most_used: MediaUsageRankRead
    send_failures: MediaUsageRankRead


class ReceiptRead(ContractModel):
    id: UUID
    conversation_id: UUID
    client: ClientBrief
    model: ModelBrief
    message_id: UUID
    detected_amount: Decimal | None = None
    expected_amount: Decimal | None = None
    analysis_status: ReceiptAnalysisStatus
    tolerance_applied: Decimal | None = None
    needs_review: bool
    metadata_json: dict = Field(default_factory=dict)
    drilldown_href: str
    created_at: datetime
    updated_at: datetime


class HandoffActionRead(ContractModel):
    status: Literal["ACKNOWLEDGED", "RELEASED"]
    conversation_id: UUID


class HandoffSummaryWindowRead(ContractModel):
    key: HandoffSummaryWindowKey
    label: str
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class HandoffSummaryMetricMeta(ContractModel):
    source: str
    window: HandoffSummaryWindowKey
    sample_method: HandoffSummarySampleMethod = "full_aggregate"
    sample_size: int = Field(ge=0)


class HandoffSummaryBreakdownMetric(ContractModel):
    counts: dict[str, int]
    meta: HandoffSummaryMetricMeta


class HandoffSummaryDurationMetric(ContractModel):
    average_seconds: int | None = Field(default=None, ge=0)
    min_seconds: int | None = Field(default=None, ge=0)
    max_seconds: int | None = Field(default=None, ge=0)
    meta: HandoffSummaryMetricMeta


class HandoffSummaryRead(ContractModel):
    generated_at: datetime
    requested_window: Literal["7d"]
    windows: dict[HandoffSummaryWindowKey, HandoffSummaryWindowRead]
    current_by_status: HandoffSummaryBreakdownMetric
    open_age_buckets: HandoffSummaryBreakdownMetric
    reasons: HandoffSummaryBreakdownMetric
    time_to_acknowledge: HandoffSummaryDurationMetric | None = None
    time_to_release: HandoffSummaryDurationMetric | None = None


class ScheduleSyncRequestRead(ContractModel):
    status: Literal["accepted"]
    mode: Literal["manual_stub"]
    message: str


class DashboardWindowRead(ContractModel):
    key: DashboardWindowKey
    label: str
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class DashboardMetricMeta(ContractModel):
    source: str
    window: DashboardWindowKey
    sample_method: DashboardSampleMethod = "full_aggregate"
    sample_size: int = Field(ge=0)


class DashboardCountMetric(ContractModel):
    value: int = Field(ge=0)
    meta: DashboardMetricMeta


class DashboardBreakdownMetric(ContractModel):
    counts: dict[str, int]
    meta: DashboardMetricMeta


class DashboardSummaryRead(ContractModel):
    generated_at: datetime
    requested_window: Literal["24h"]
    windows: dict[DashboardWindowKey, DashboardWindowRead]
    total_conversations: DashboardCountMetric
    active_conversations: DashboardCountMetric
    new_conversations_today: DashboardCountMetric
    conversations_by_state: DashboardBreakdownMetric
    conversations_by_flow_type: DashboardBreakdownMetric
    conversations_by_handoff_status: DashboardBreakdownMetric
    handoffs_opened: DashboardCountMetric
    handoffs_acknowledged: DashboardCountMetric
    media_pending: DashboardCountMetric
    media_without_category: DashboardCountMetric
    schedule_slots_next_14d_total: DashboardCountMetric
    schedule_slots_next_14d_by_status: DashboardBreakdownMetric
    calendar_sync_pending: DashboardCountMetric
    calendar_sync_error: DashboardCountMetric
