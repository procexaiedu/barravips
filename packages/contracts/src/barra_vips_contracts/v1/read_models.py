from datetime import date, datetime
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
DashboardWindowKey = Literal[
    "requested",
    "today",
    "last_7_days",
    "last_30_days",
    "next_14_days",
    "all_time",
]
FinancialWindowKey = Literal["7d", "30d", "90d"]
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


class EscortBrief(ContractModel):
    id: UUID
    display_name: str


class EscortRead(ContractModel):
    id: UUID
    display_name: str
    is_active: bool
    languages: list[str]
    calendar_external_id: str | None = None
    photo_main_path: str | None = None
    created_at: datetime
    updated_at: datetime


class EscortServiceRead(ContractModel):
    id: UUID
    name: str
    description: str | None = None
    duration_minutes: int = Field(gt=0)
    price_cents: int = Field(ge=0)
    restrictions: str | None = None
    sort_order: int = 0


class EscortLocationRead(ContractModel):
    id: UUID
    city: str
    neighborhood: str | None = None
    accepts_displacement: bool = False
    displacement_fee_cents: int | None = Field(default=None, ge=0)
    sort_order: int = 0


class EscortPreferenceRead(ContractModel):
    key: str
    value: str


class EscortAvailabilityRead(ContractModel):
    min_duration_minutes: int | None = Field(default=None, gt=0)
    advance_booking_minutes: int | None = Field(default=None, ge=0)
    max_bookings_per_day: int | None = Field(default=None, gt=0)


class EscortDetailRead(ContractModel):
    escort: EscortRead
    services: list[EscortServiceRead] = Field(default_factory=list)
    locations: list[EscortLocationRead] = Field(default_factory=list)
    preferences: list[EscortPreferenceRead] = Field(default_factory=list)
    availability: EscortAvailabilityRead


class LastMessageRead(ContractModel):
    direction: Literal["INBOUND", "OUTBOUND"]
    message_type: Literal["text", "image", "audio", "video", "document", "system"]
    content_preview: str | None = None
    created_at: datetime
    delivery_status: str | None = None


class ConversationRead(ContractModel):
    id: UUID
    client: ClientBrief
    escort: EscortBrief
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
    expected_amount: Decimal | None = None
    relevant_at: datetime | None = None
    age_seconds: int | None = Field(default=None, ge=0)
    age_source: str
    reason: str
    next_best_action: str | None = None
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
    metadata_json: dict | None = None


class EvolutionStatusRead(ContractModel):
    provider: Literal["evolution"] = "evolution"
    instance: str
    status: Literal["CONNECTED", "DISCONNECTED", "QR_REQUIRED", "UNKNOWN"]
    connected: bool = False
    qr_code_ref: str | None = None
    qr_age_seconds: int | None = None
    last_event_at: datetime | None = None
    connected_since: datetime | None = None
    updated_at: datetime


class EvolutionQrCodeRead(ContractModel):
    token: str
    base64: str
    age_seconds: int
    expires_in_seconds: int


class EvolutionConnectResultRead(ContractModel):
    status: Literal["requested", "already_connected", "failed"]
    detail: str | None = None


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


class DashboardHealthSignalRead(ContractModel):
    status: str
    label: str
    detail: str | None = None
    checked_at: datetime


class DashboardHealthRead(ContractModel):
    generated_at: datetime
    agent: DashboardHealthSignalRead
    whatsapp: DashboardHealthSignalRead
    calendar: DashboardHealthSignalRead
    model: DashboardHealthSignalRead


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
    tags: list[str] = Field(default_factory=list)
    is_active: bool
    deactivated_at: datetime | None = None
    metadata_json: dict = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class MediaTagRead(ContractModel):
    tag: str
    display_label: str
    sort_order: int


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
    tags: list[str] = Field(default_factory=list)
    is_active: bool
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
    active: MediaUsageCountMetric
    most_used: MediaUsageRankRead
    send_failures: MediaUsageRankRead


class ReceiptRead(ContractModel):
    id: UUID
    conversation_id: UUID
    client: ClientBrief
    escort: EscortBrief
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


class DashboardRateMetric(ContractModel):
    value: int = Field(ge=0, le=100)
    meta: DashboardMetricMeta


class DashboardBreakdownMetric(ContractModel):
    counts: dict[str, int]
    meta: DashboardMetricMeta


class DashboardDurationMetric(ContractModel):
    average_seconds: int | None = Field(default=None, ge=0)
    meta: DashboardMetricMeta


class DashboardAmountMetric(ContractModel):
    value: Decimal = Field(default=Decimal("0"))
    meta: DashboardMetricMeta


class DashboardAmountBreakdownMetric(ContractModel):
    amounts: dict[str, Decimal]
    meta: DashboardMetricMeta


class DashboardFinancialGrowthMetric(ContractModel):
    current_amount: Decimal = Field(default=Decimal("0"))
    previous_amount: Decimal = Field(default=Decimal("0"))
    delta_percent: int | None = None
    meta: DashboardMetricMeta


class DashboardFinancialRateMetric(ContractModel):
    value_percent: int | None = None
    numerator: int = Field(default=0, ge=0)
    denominator: int = Field(default=0, ge=0)
    meta: DashboardMetricMeta


class DashboardFinancialForecastMetric(ContractModel):
    value: Decimal | None = None
    minimum_sample_size: int = Field(default=0, ge=0)
    meta: DashboardMetricMeta


class FinancialTimeseriesPoint(ContractModel):
    date: date
    pipeline_new_amount: Decimal = Field(default=Decimal("0"))
    detected_total_amount: Decimal = Field(default=Decimal("0"))
    avg_ticket_amount: Decimal | None = None
    conversions_count: int = Field(default=0, ge=0)
    terminal_count: int = Field(default=0, ge=0)


class DashboardFinancialTimeseriesRead(ContractModel):
    days: int = Field(ge=7, le=90)
    starts_at: datetime
    ends_at: datetime
    points: list[FinancialTimeseriesPoint]
    meta: DashboardMetricMeta


class DashboardFinancialRead(ContractModel):
    open_pipeline_total: DashboardAmountMetric
    open_pipeline_by_state: DashboardAmountBreakdownMetric
    avg_ticket_last_7d: DashboardAmountMetric
    detected_total_last_7d: DashboardAmountMetric
    divergence_abs_last_7d: DashboardAmountMetric
    pipeline_growth: DashboardFinancialGrowthMetric
    conversion_rate_last_30d: DashboardFinancialRateMetric
    projected_revenue: DashboardFinancialForecastMetric


class FinancialReceiptStatusBreakdown(ContractModel):
    counts: dict[str, int]
    amounts: dict[str, Decimal]
    meta: DashboardMetricMeta


class FinancialMatchRateMetric(ContractModel):
    value_percent: int | None = None
    numerator: int = Field(default=0, ge=0)
    denominator: int = Field(default=0, ge=0)
    meta: DashboardMetricMeta


class FinancialPaymentLagMetric(ContractModel):
    average_days: float | None = None
    sample_size: int = Field(default=0, ge=0)
    meta: DashboardMetricMeta


class FinancialLargestDivergence(ContractModel):
    receipt_id: UUID
    conversation_id: UUID
    client_display_name: str | None = None
    expected_amount: Decimal
    detected_amount: Decimal
    diff_abs: Decimal
    age_days: int = Field(ge=0)
    drilldown_href: str


class FinancialDivergenceAging(ContractModel):
    threshold_days: int = Field(default=5, ge=1)
    count: int = Field(default=0, ge=0)
    total_amount: Decimal = Field(default=Decimal("0"))


class FinancialRevenueFunnel(ContractModel):
    in_negotiation_amount: Decimal = Field(default=Decimal("0"))
    closed_amount: Decimal = Field(default=Decimal("0"))
    receipt_received_amount: Decimal = Field(default=Decimal("0"))
    receipt_match_amount: Decimal = Field(default=Decimal("0"))
    meta: DashboardMetricMeta


class FinancialSnapshotRead(ContractModel):
    generated_at: datetime
    requested_window: FinancialWindowKey
    window_starts_at: datetime
    window_ends_at: datetime
    open_pipeline_total: DashboardAmountMetric
    open_pipeline_by_state: DashboardAmountBreakdownMetric
    detected_total: DashboardAmountMetric
    divergence_abs: DashboardAmountMetric
    projected_revenue: DashboardFinancialForecastMetric
    receipts_by_status: FinancialReceiptStatusBreakdown
    receipt_match_rate: FinancialMatchRateMetric
    payment_lag: FinancialPaymentLagMetric
    largest_divergence: FinancialLargestDivergence | None = None
    divergence_aging: FinancialDivergenceAging
    revenue_funnel: FinancialRevenueFunnel


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
    media_active: DashboardCountMetric
    schedule_slots_next_14d_total: DashboardCountMetric
    schedule_slots_next_14d_by_status: DashboardBreakdownMetric
    calendar_sync_pending: DashboardCountMetric
    calendar_sync_error: DashboardCountMetric
    ready_for_human_count: DashboardCountMetric
    awaiting_client_decision_count: DashboardCountMetric
    stalled_conversations_count: DashboardCountMetric
    hot_leads_count: DashboardCountMetric
    response_rate: DashboardRateMetric
    qualification_rate: DashboardRateMetric
    time_to_first_response: DashboardDurationMetric
    conversation_funnel: DashboardBreakdownMetric
    financial: DashboardFinancialRead
