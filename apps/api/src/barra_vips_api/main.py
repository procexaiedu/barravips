from __future__ import annotations

import hmac
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from psycopg import Connection
from psycopg.errors import ExclusionViolation, ForeignKeyViolation
from psycopg.types.json import Jsonb

from barra_vips_contracts.v1 import (
    AgentOpsSummaryRead,
    CalendarStatusRead,
    ConversationDetailRead,
    ConversationQueueItemRead,
    ConversationRead,
    DashboardHealthRead,
    DashboardFinancialTimeseriesRead,
    DashboardSummaryRead,
    EvolutionConnectionUpdate,
    EvolutionMessagesUpsert,
    EvolutionStatusRead,
    HandoffActionRead,
    HandoffSummaryRead,
    HealthStatusRead,
    MediaRead,
    MediaUsageSummaryRead,
    ModelRead,
    PaginatedEnvelope,
    ReceiptRead,
    ScheduleSlotRead,
    ScheduleSyncRequestRead,
    normalize_evolution_message,
)

from .config import settings
from .db import get_conn
from .media import MIME_EXTENSIONS, MEDIA_TYPES, detect_mime, ensure_inside


class ScheduleBlockRequest(BaseModel):
    model_id: uuid.UUID | None = None
    starts_at: datetime
    ends_at: datetime
    reason: str | None = None


class MediaPatchRequest(BaseModel):
    category: str | None = None
    approval_status: str | None = None
    send_constraints_json: dict[str, Any] | None = None
    metadata_json: dict[str, Any] | None = None


class ModelCreateRequest(BaseModel):
    display_name: str = Field(min_length=1)
    is_active: bool = False
    persona_json: dict[str, Any] = Field(default_factory=dict)
    services_json: dict[str, Any] = Field(default_factory=dict)
    pricing_json: dict[str, Any] = Field(default_factory=dict)
    languages: list[str] = Field(default_factory=list)
    calendar_external_id: str | None = None


class ModelPatchRequest(BaseModel):
    display_name: str | None = None
    is_active: bool | None = None
    persona_json: dict[str, Any] | None = None
    services_json: dict[str, Any] | None = None
    pricing_json: dict[str, Any] | None = None
    languages: list[str] | None = None
    calendar_external_id: str | None = None


def require_operator_api_key(
    x_operator_api_key: Annotated[str | None, Header()] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    supplied = x_operator_api_key
    if not supplied and authorization and authorization.lower().startswith("bearer "):
        supplied = authorization[7:]
    if not supplied or not hmac.compare_digest(supplied, settings.operator_api_key):
        raise HTTPException(status_code=401, detail="invalid operator api key")


api = APIRouter(prefix="/api", dependencies=[Depends(require_operator_api_key)])

CONVERSATION_STATES = ("NOVO", "QUALIFICANDO", "NEGOCIANDO", "CONFIRMADO", "ESCALADO")
FLOW_TYPES = ("UNDETERMINED", "INTERNAL", "EXTERNAL")
HANDOFF_STATUSES = ("NONE", "OPENED", "ACKNOWLEDGED", "RELEASED")
AGENT_EXECUTION_STATUSES = ("SUCCESS", "PARTIAL", "FAILED", "SKIPPED")
HANDOFF_AGE_BUCKETS = ("0-15m", "15-30m", "30-60m", "1-4h", "4h+", "UNKNOWN")
SCHEDULE_STATUSES = ("AVAILABLE", "BLOCKED", "HELD", "CONFIRMED", "CANCELLED")
FUNNEL_STAGES = ("NOVO", "QUALIFICANDO", "NEGOCIANDO", "PRONTO_PARA_HUMANO", "CONFIRMADO")
CONVERSATION_QUEUE_KEYS = {
    "OPEN_HANDOFF",
    "ACKNOWLEDGED_HANDOFF",
    "CLIENT_WAITING_RESPONSE",
    "STALE_CONVERSATION",
    "UNDETERMINED_AGED",
    "NEGOTIATING_AWAITING_INPUT",
    "AWAITING_CLIENT_DECISION",
    "EXTERNAL_OPEN_HANDOFF",
}
MODEL_SELECT_COLUMNS = """
    id, display_name, is_active, persona_json, services_json, pricing_json,
    languages, calendar_external_id, created_at, updated_at
"""


def create_app() -> FastAPI:
    app = FastAPI(title="Barra Vips API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["authorization", "content-type", "x-operator-api-key"],
    )
    app.include_router(api)
    app.include_router(webhooks)
    return app


@api.get("/status/health", response_model=HealthStatusRead)
def health(conn: Connection[dict[str, Any]] = Depends(get_conn)) -> dict[str, Any]:
    conn.execute("SELECT 1")
    return {"status": "ok", "database": "ok", "checked_at": _now()}


@api.get("/models", response_model=PaginatedEnvelope[ModelRead])
def list_models(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=100),
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    params = {"limit": page_size, "offset": (page - 1) * page_size}
    total = _count(conn, "SELECT count(*) FROM app.models")
    items = conn.execute(
        f"""
        SELECT {MODEL_SELECT_COLUMNS}
        FROM app.models
        ORDER BY is_active DESC, updated_at DESC, id DESC
        LIMIT %(limit)s OFFSET %(offset)s
        """,
        params,
    ).fetchall()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@api.post("/models", response_model=ModelRead)
def create_model(
    body: ModelCreateRequest,
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    params = {
        "display_name": _clean_model_display_name(body.display_name),
        "is_active": body.is_active,
        "persona_json": Jsonb(body.persona_json),
        "services_json": Jsonb(body.services_json),
        "pricing_json": Jsonb(body.pricing_json),
        "languages": _clean_model_languages(body.languages),
        "calendar_external_id": _clean_calendar_external_id(body.calendar_external_id),
    }
    with conn.transaction():
        if params["is_active"]:
            conn.execute(
                """
                UPDATE app.models
                SET is_active = false, updated_at = now()
                WHERE is_active = true
                """
            )
        row = conn.execute(
            f"""
            INSERT INTO app.models (
                display_name,
                is_active,
                persona_json,
                services_json,
                pricing_json,
                languages,
                calendar_external_id
            )
            VALUES (
                %(display_name)s,
                %(is_active)s,
                %(persona_json)s,
                %(services_json)s,
                %(pricing_json)s,
                %(languages)s,
                %(calendar_external_id)s
            )
            RETURNING {MODEL_SELECT_COLUMNS}
            """,
            params,
        ).fetchone()
    return row


@api.get("/models/active", response_model=ModelRead)
def get_active_model(conn: Connection[dict[str, Any]] = Depends(get_conn)) -> dict[str, Any]:
    row = conn.execute(
        """
        SELECT id, display_name, is_active, persona_json, services_json, pricing_json,
               languages, calendar_external_id, created_at, updated_at
        FROM app.models
        WHERE is_active = true
        LIMIT 1
        """
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="active model not found")
    return row


@api.patch("/models/{model_id}", response_model=ModelRead)
def patch_model(
    model_id: uuid.UUID,
    body: ModelPatchRequest,
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="empty patch")

    if "display_name" in updates:
        updates["display_name"] = _clean_model_display_name(updates["display_name"])
    if "languages" in updates:
        updates["languages"] = _clean_model_languages(updates["languages"])
    if "calendar_external_id" in updates:
        updates["calendar_external_id"] = _clean_calendar_external_id(updates["calendar_external_id"])

    allowed = {
        "display_name",
        "is_active",
        "persona_json",
        "services_json",
        "pricing_json",
        "languages",
        "calendar_external_id",
    }
    sets = []
    params: dict[str, Any] = {"id": model_id}
    for field, value in updates.items():
        if field not in allowed:
            continue
        sets.append(f"{field} = %({field})s")
        params[field] = Jsonb(value) if field.endswith("_json") else value
    if not sets:
        raise HTTPException(status_code=400, detail="empty patch")

    with conn.transaction():
        existing = conn.execute(
            "SELECT id FROM app.models WHERE id = %(id)s FOR UPDATE",
            {"id": model_id},
        ).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="model not found")

        if updates.get("is_active") is True:
            conn.execute(
                """
                UPDATE app.models
                SET is_active = false, updated_at = now()
                WHERE is_active = true AND id <> %(id)s
                """,
                {"id": model_id},
            )

        row = conn.execute(
            f"""
            UPDATE app.models
            SET {", ".join(sets)}, updated_at = now()
            WHERE id = %(id)s
            RETURNING {MODEL_SELECT_COLUMNS}
            """,
            params,
        ).fetchone()
    return row


@api.get("/dashboard/summary", response_model=DashboardSummaryRead)
def get_dashboard_summary(
    window: Literal["24h"] = Query(default="24h"),
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    windows = conn.execute(
        """
        SELECT
          now() AS generated_at,
          now() - INTERVAL '24 hours' AS requested_starts_at,
          now() AS requested_ends_at,
          date_trunc('day', now()) AS today_starts_at,
          date_trunc('day', now()) + INTERVAL '1 day' AS today_ends_at,
          now() - INTERVAL '7 days' AS last_7_days_starts_at,
          now() AS last_7_days_ends_at,
          now() - INTERVAL '14 days' AS previous_7_days_starts_at,
          now() - INTERVAL '30 days' AS last_30_days_starts_at,
          now() AS last_30_days_ends_at,
          now() AS next_14_days_starts_at,
          now() + INTERVAL '14 days' AS next_14_days_ends_at
        """
    ).fetchone()
    total_conversations = _count(conn, "SELECT count(*) FROM app.conversations")
    active_conversations = _count(
        conn,
        """
        SELECT count(*)
        FROM app.conversations
        WHERE last_message_at >= %(starts_at)s AND last_message_at < %(ends_at)s
        """,
        {
            "starts_at": windows["requested_starts_at"],
            "ends_at": windows["requested_ends_at"],
        },
    )
    new_conversations_today = _count(
        conn,
        """
        SELECT count(*)
        FROM app.conversations
        WHERE created_at >= %(starts_at)s AND created_at < %(ends_at)s
        """,
        {
            "starts_at": windows["today_starts_at"],
            "ends_at": windows["today_ends_at"],
        },
    )
    state_counts = _count_by(conn, "app.conversations", "state", CONVERSATION_STATES)
    flow_counts = _count_by(conn, "app.conversations", "flow_type", FLOW_TYPES)
    handoff_counts = _count_by(conn, "app.conversations", "handoff_status", HANDOFF_STATUSES)
    ready_for_human_count = handoff_counts["OPENED"]
    awaiting_client_decision_count = _count(
        conn,
        """
        SELECT count(*)
        FROM app.conversations
        WHERE awaiting_client_decision = true
        """,
    )
    stalled_conversations_count = _count(
        conn,
        """
        SELECT count(*)
        FROM app.conversations
        WHERE last_message_at IS NOT NULL
          AND last_message_at <= now() - INTERVAL '48 hours'
          AND state <> 'CONFIRMADO'
        """,
    )
    hot_leads_count = _count(
        conn,
        """
        SELECT count(*)
        FROM app.conversations
        WHERE expected_amount IS NOT NULL
           OR urgency_profile = 'IMMEDIATE'
           OR handoff_status = 'OPENED'
           OR (flow_type = 'EXTERNAL' AND handoff_status IN ('OPENED', 'ACKNOWLEDGED'))
        """,
    )
    qualification_row = conn.execute(
        """
        SELECT
          count(*)::int AS sample_size,
          count(*) FILTER (
            WHERE state IN ('QUALIFICANDO', 'NEGOCIANDO', 'CONFIRMADO', 'ESCALADO')
          )::int AS qualified_count
        FROM app.conversations
        WHERE created_at >= %(starts_at)s
          AND created_at < %(ends_at)s
        """,
        {
            "starts_at": windows["last_7_days_starts_at"],
            "ends_at": windows["last_7_days_ends_at"],
        },
    ).fetchone()
    response_row = conn.execute(
        """
        WITH first_inbound AS (
          SELECT
            m.conversation_id,
            min(COALESCE(m.provider_message_at, m.created_at)) AS first_inbound_at
          FROM app.messages m
          WHERE m.direction = 'INBOUND'
            AND COALESCE(m.provider_message_at, m.created_at) >= %(starts_at)s
            AND COALESCE(m.provider_message_at, m.created_at) < %(ends_at)s
          GROUP BY m.conversation_id
        ),
        paired AS (
          SELECT
            fi.conversation_id,
            fi.first_inbound_at,
            fo.first_outbound_at,
            CASE
              WHEN fo.first_outbound_at IS NULL THEN NULL
              ELSE floor(extract(epoch FROM (fo.first_outbound_at - fi.first_inbound_at)))::int
            END AS response_seconds
          FROM first_inbound fi
          LEFT JOIN LATERAL (
            SELECT min(COALESCE(m.provider_message_at, m.created_at)) AS first_outbound_at
            FROM app.messages m
            WHERE m.conversation_id = fi.conversation_id
              AND m.direction = 'OUTBOUND'
              AND COALESCE(m.provider_message_at, m.created_at) >= fi.first_inbound_at
          ) fo ON true
        )
        SELECT
          count(*)::int AS sample_size,
          count(response_seconds)::int AS responded_sample_size,
          count(*) FILTER (
            WHERE response_seconds IS NOT NULL AND response_seconds <= 3600
          )::int AS within_sla_count,
          CASE
            WHEN count(response_seconds) = 0 THEN NULL
            ELSE floor(avg(response_seconds))::int
          END AS average_seconds
        FROM paired
        """,
        {
            "starts_at": windows["requested_starts_at"],
            "ends_at": windows["requested_ends_at"],
        },
    ).fetchone()
    funnel_row = conn.execute(
        """
        SELECT
          count(*) FILTER (
            WHERE handoff_status NOT IN ('OPENED', 'ACKNOWLEDGED') AND state = 'NOVO'
          )::int AS novo,
          count(*) FILTER (
            WHERE handoff_status NOT IN ('OPENED', 'ACKNOWLEDGED') AND state = 'QUALIFICANDO'
          )::int AS qualificando,
          count(*) FILTER (
            WHERE handoff_status NOT IN ('OPENED', 'ACKNOWLEDGED') AND state = 'NEGOCIANDO'
          )::int AS negociando,
          count(*) FILTER (
            WHERE handoff_status IN ('OPENED', 'ACKNOWLEDGED')
          )::int AS pronto_para_humano,
          count(*) FILTER (
            WHERE handoff_status NOT IN ('OPENED', 'ACKNOWLEDGED') AND state = 'CONFIRMADO'
          )::int AS confirmado
        FROM app.conversations
        """
    ).fetchone()

    total_media = _count(conn, "SELECT count(*) FROM app.media_assets")
    media_pending = _count(
        conn,
        "SELECT count(*) FROM app.media_assets WHERE approval_status = 'PENDING'",
    )
    media_without_category = _count(
        conn,
        """
        SELECT count(*)
        FROM app.media_assets
        WHERE category IS NULL OR btrim(category) = ''
        """,
    )

    schedule_params = {
        "starts_at": windows["next_14_days_starts_at"],
        "ends_at": windows["next_14_days_ends_at"],
    }
    schedule_status_counts = _count_by(
        conn,
        "app.schedule_slots",
        "status",
        SCHEDULE_STATUSES,
        "starts_at >= %(starts_at)s AND starts_at < %(ends_at)s",
        schedule_params,
    )
    schedule_total_next_14d = sum(schedule_status_counts.values())
    total_schedule_slots = _count(conn, "SELECT count(*) FROM app.schedule_slots")
    calendar_sync_pending = _count(
        conn,
        "SELECT count(*) FROM app.schedule_slots WHERE calendar_sync_status = 'PENDING'",
    )
    calendar_sync_error = _count(
        conn,
        "SELECT count(*) FROM app.schedule_slots WHERE calendar_sync_status = 'ERROR'",
    )

    open_pipeline_states = ("NOVO", "QUALIFICANDO", "NEGOCIANDO")
    open_pipeline_condition = "state IN ('NOVO','QUALIFICANDO','NEGOCIANDO')"
    open_pipeline_by_state = _sum_by(
        conn,
        "app.conversations",
        "state",
        "expected_amount",
        open_pipeline_states,
        open_pipeline_condition,
    )
    open_pipeline_count = _count(
        conn,
        f"SELECT count(*) FROM app.conversations WHERE {open_pipeline_condition}",
    )
    open_pipeline_total_value = sum(open_pipeline_by_state.values(), Decimal("0"))
    avg_ticket_row = conn.execute(
        """
        SELECT
          count(*) FILTER (WHERE expected_amount IS NOT NULL)::int AS sample_size,
          round(avg(expected_amount)::numeric, 2) AS avg_amount
        FROM app.conversations
        WHERE created_at >= %(starts_at)s AND created_at < %(ends_at)s
        """,
        {
            "starts_at": windows["last_7_days_starts_at"],
            "ends_at": windows["last_7_days_ends_at"],
        },
    ).fetchone()
    receipts_financial_row = conn.execute(
        """
        SELECT
          count(*) FILTER (WHERE analysis_status = 'VALID')::int AS valid_count,
          COALESCE(
            SUM(detected_amount) FILTER (WHERE analysis_status = 'VALID'),
            0
          ) AS detected_total,
          count(*) FILTER (
            WHERE detected_amount IS NOT NULL AND expected_amount IS NOT NULL
          )::int AS divergence_sample_size,
          COALESCE(
            SUM(abs(detected_amount - expected_amount)) FILTER (
              WHERE detected_amount IS NOT NULL AND expected_amount IS NOT NULL
            ),
            0
          ) AS divergence_abs
        FROM app.receipts
        WHERE created_at >= %(starts_at)s AND created_at < %(ends_at)s
        """,
        {
            "starts_at": windows["last_7_days_starts_at"],
            "ends_at": windows["last_7_days_ends_at"],
        },
    ).fetchone()

    pipeline_growth_row = conn.execute(
        """
        SELECT
          COALESCE(SUM(expected_amount) FILTER (
            WHERE created_at >= %(current_start)s AND created_at < %(current_end)s
          ), 0) AS current_total,
          COALESCE(SUM(expected_amount) FILTER (
            WHERE created_at >= %(previous_start)s AND created_at < %(current_start)s
          ), 0) AS previous_total,
          count(*) FILTER (
            WHERE created_at >= %(previous_start)s
              AND created_at < %(current_end)s
              AND expected_amount IS NOT NULL
          )::int AS sample_size
        FROM app.conversations
        """,
        {
            "current_start": windows["last_7_days_starts_at"],
            "current_end": windows["last_7_days_ends_at"],
            "previous_start": windows["previous_7_days_starts_at"],
        },
    ).fetchone()

    conversion_row = conn.execute(
        """
        SELECT
          count(*) FILTER (WHERE state = 'CONFIRMADO')::int AS converted_count,
          count(*) FILTER (WHERE state IN ('CONFIRMADO', 'ESCALADO'))::int AS terminal_count
        FROM app.conversations
        WHERE created_at >= %(starts_at)s AND created_at < %(ends_at)s
        """,
        {
            "starts_at": windows["last_30_days_starts_at"],
            "ends_at": windows["last_30_days_ends_at"],
        },
    ).fetchone()

    response_windows = {
        "requested": {
            "key": "requested",
            "label": window,
            "starts_at": windows["requested_starts_at"],
            "ends_at": windows["requested_ends_at"],
        },
        "today": {
            "key": "today",
            "label": "today",
            "starts_at": windows["today_starts_at"],
            "ends_at": windows["today_ends_at"],
        },
        "last_7_days": {
            "key": "last_7_days",
            "label": "last_7_days",
            "starts_at": windows["last_7_days_starts_at"],
            "ends_at": windows["last_7_days_ends_at"],
        },
        "last_30_days": {
            "key": "last_30_days",
            "label": "last_30_days",
            "starts_at": windows["last_30_days_starts_at"],
            "ends_at": windows["last_30_days_ends_at"],
        },
        "next_14_days": {
            "key": "next_14_days",
            "label": "next_14_days",
            "starts_at": windows["next_14_days_starts_at"],
            "ends_at": windows["next_14_days_ends_at"],
        },
        "all_time": {"key": "all_time", "label": "all_time", "starts_at": None, "ends_at": None},
    }

    growth_current = Decimal(pipeline_growth_row["current_total"] or 0)
    growth_previous = Decimal(pipeline_growth_row["previous_total"] or 0)
    if growth_previous > 0:
        growth_delta_percent: int | None = int(
            round(((growth_current - growth_previous) / growth_previous) * 100)
        )
    else:
        growth_delta_percent = None

    conversion_converted = int(conversion_row["converted_count"] or 0)
    conversion_terminal = int(conversion_row["terminal_count"] or 0)
    if conversion_terminal > 0:
        conversion_rate_percent: int | None = int(
            round((conversion_converted / conversion_terminal) * 100)
        )
    else:
        conversion_rate_percent = None

    forecast_minimum_sample = 10
    if (
        conversion_terminal >= forecast_minimum_sample
        and conversion_rate_percent is not None
    ):
        forecast_value: Decimal | None = (
            open_pipeline_total_value * Decimal(conversion_converted) / Decimal(conversion_terminal)
        ).quantize(Decimal("0.01"))
    else:
        forecast_value = None

    return {
        "generated_at": windows["generated_at"],
        "requested_window": window,
        "windows": response_windows,
        "total_conversations": _metric(
            total_conversations,
            source="app.conversations.id",
            window="all_time",
            sample_size=total_conversations,
        ),
        "active_conversations": _metric(
            active_conversations,
            source="app.conversations.last_message_at",
            window="requested",
            sample_size=total_conversations,
        ),
        "new_conversations_today": _metric(
            new_conversations_today,
            source="app.conversations.created_at",
            window="today",
            sample_size=total_conversations,
        ),
        "conversations_by_state": _breakdown(
            state_counts,
            source="app.conversations.state",
            window="all_time",
            sample_size=total_conversations,
        ),
        "conversations_by_flow_type": _breakdown(
            flow_counts,
            source="app.conversations.flow_type",
            window="all_time",
            sample_size=total_conversations,
        ),
        "conversations_by_handoff_status": _breakdown(
            handoff_counts,
            source="app.conversations.handoff_status",
            window="all_time",
            sample_size=total_conversations,
        ),
        "handoffs_opened": _metric(
            handoff_counts["OPENED"],
            source="app.conversations.handoff_status",
            window="all_time",
            sample_size=total_conversations,
        ),
        "handoffs_acknowledged": _metric(
            handoff_counts["ACKNOWLEDGED"],
            source="app.conversations.handoff_status",
            window="all_time",
            sample_size=total_conversations,
        ),
        "media_pending": _metric(
            media_pending,
            source="app.media_assets.approval_status",
            window="all_time",
            sample_size=total_media,
        ),
        "media_without_category": _metric(
            media_without_category,
            source="app.media_assets.category",
            window="all_time",
            sample_size=total_media,
        ),
        "schedule_slots_next_14d_total": _metric(
            schedule_total_next_14d,
            source="app.schedule_slots.starts_at",
            window="next_14_days",
            sample_size=schedule_total_next_14d,
        ),
        "schedule_slots_next_14d_by_status": _breakdown(
            schedule_status_counts,
            source="app.schedule_slots.status",
            window="next_14_days",
            sample_size=schedule_total_next_14d,
        ),
        "calendar_sync_pending": _metric(
            calendar_sync_pending,
            source="app.schedule_slots.calendar_sync_status",
            window="all_time",
            sample_size=total_schedule_slots,
        ),
        "calendar_sync_error": _metric(
            calendar_sync_error,
            source="app.schedule_slots.calendar_sync_status",
            window="all_time",
            sample_size=total_schedule_slots,
        ),
        "ready_for_human_count": _metric(
            ready_for_human_count,
            source="app.conversations.handoff_status",
            window="all_time",
            sample_size=total_conversations,
        ),
        "awaiting_client_decision_count": _metric(
            awaiting_client_decision_count,
            source="app.conversations.awaiting_client_decision",
            window="all_time",
            sample_size=total_conversations,
        ),
        "stalled_conversations_count": _metric(
            stalled_conversations_count,
            source="app.conversations.last_message_at",
            window="all_time",
            sample_size=total_conversations,
        ),
        "hot_leads_count": _metric(
            hot_leads_count,
            source="app.conversations.expected_amount + urgency_profile + handoff_status",
            window="all_time",
            sample_size=total_conversations,
        ),
        "response_rate": _rate_metric(
            _safe_percentage(response_row["within_sla_count"], response_row["sample_size"]),
            source="app.messages.direction paired inbound->outbound <= 1h",
            window="requested",
            sample_size=response_row["sample_size"],
        ),
        "qualification_rate": _rate_metric(
            _safe_percentage(qualification_row["qualified_count"], qualification_row["sample_size"]),
            source="app.conversations.created_at with current qualified state in last 7d",
            window="last_7_days",
            sample_size=qualification_row["sample_size"],
        ),
        "time_to_first_response": _duration_metric(
            response_row["average_seconds"],
            source="app.messages first inbound -> first outbound",
            window="requested",
            sample_size=response_row["responded_sample_size"],
        ),
        "conversation_funnel": _breakdown(
            {
                "NOVO": funnel_row["novo"],
                "QUALIFICANDO": funnel_row["qualificando"],
                "NEGOCIANDO": funnel_row["negociando"],
                "PRONTO_PARA_HUMANO": funnel_row["pronto_para_humano"],
                "CONFIRMADO": funnel_row["confirmado"],
            },
            source="app.conversations.state + handoff_status",
            window="all_time",
            sample_size=total_conversations,
        ),
        "financial": {
            "open_pipeline_total": _amount_metric(
                open_pipeline_total_value,
                source="app.conversations.expected_amount (open states)",
                window="all_time",
                sample_size=open_pipeline_count,
            ),
            "open_pipeline_by_state": _amount_breakdown(
                open_pipeline_by_state,
                source="app.conversations.expected_amount grouped by state (open states)",
                window="all_time",
                sample_size=open_pipeline_count,
            ),
            "avg_ticket_last_7d": _amount_metric(
                avg_ticket_row["avg_amount"],
                source="app.conversations.expected_amount avg in last 7d",
                window="last_7_days",
                sample_size=avg_ticket_row["sample_size"],
            ),
            "detected_total_last_7d": _amount_metric(
                receipts_financial_row["detected_total"],
                source="app.receipts.detected_amount sum of VALID in last 7d",
                window="last_7_days",
                sample_size=receipts_financial_row["valid_count"],
            ),
            "divergence_abs_last_7d": _amount_metric(
                receipts_financial_row["divergence_abs"],
                source="app.receipts abs(detected-expected) sum in last 7d",
                window="last_7_days",
                sample_size=receipts_financial_row["divergence_sample_size"],
            ),
            "pipeline_growth": {
                "current_amount": growth_current,
                "previous_amount": growth_previous,
                "delta_percent": growth_delta_percent,
                "meta": {
                    "source": "app.conversations.expected_amount in 7d vs previous 7d",
                    "window": "last_7_days",
                    "sample_method": "full_aggregate",
                    "sample_size": int(pipeline_growth_row["sample_size"] or 0),
                },
            },
            "conversion_rate_last_30d": {
                "value_percent": conversion_rate_percent,
                "numerator": conversion_converted,
                "denominator": conversion_terminal,
                "meta": {
                    "source": "app.conversations.state CONFIRMADO / (CONFIRMADO+ESCALADO) in last 30d",
                    "window": "last_30_days",
                    "sample_method": "full_aggregate",
                    "sample_size": conversion_terminal,
                },
            },
            "projected_revenue": {
                "value": forecast_value,
                "minimum_sample_size": forecast_minimum_sample,
                "meta": {
                    "source": "open_pipeline_total * conversion_rate_last_30d",
                    "window": "last_30_days",
                    "sample_method": "full_aggregate",
                    "sample_size": conversion_terminal,
                },
            },
        },
    }


@api.get("/dashboard/financial/timeseries", response_model=DashboardFinancialTimeseriesRead)
def get_dashboard_financial_timeseries(
    days: int = Query(default=30, ge=7, le=90),
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    bounds = conn.execute(
        """
        SELECT
          date_trunc('day', now()) - (%(days)s::int - 1) * INTERVAL '1 day' AS starts_at,
          date_trunc('day', now()) + INTERVAL '1 day' AS ends_at
        """,
        {"days": days},
    ).fetchone()
    points = conn.execute(
        """
        WITH day_series AS (
          SELECT generate_series(
            %(starts_at)s::timestamp,
            (%(ends_at)s::timestamp - INTERVAL '1 day'),
            INTERVAL '1 day'
          )::date AS bucket_date
        ),
        conversation_daily AS (
          SELECT
            date_trunc('day', created_at)::date AS bucket_date,
            COALESCE(SUM(expected_amount), 0) AS pipeline_new_amount,
            AVG(expected_amount) FILTER (WHERE expected_amount IS NOT NULL) AS avg_ticket_amount,
            count(*) FILTER (WHERE state = 'CONFIRMADO')::int AS conversions_count,
            count(*) FILTER (WHERE state IN ('CONFIRMADO', 'ESCALADO'))::int AS terminal_count
          FROM app.conversations
          WHERE created_at >= %(starts_at)s
            AND created_at < %(ends_at)s
          GROUP BY 1
        ),
        receipt_daily AS (
          SELECT
            date_trunc('day', created_at)::date AS bucket_date,
            COALESCE(SUM(detected_amount) FILTER (WHERE analysis_status = 'VALID'), 0) AS detected_total_amount
          FROM app.receipts
          WHERE created_at >= %(starts_at)s
            AND created_at < %(ends_at)s
          GROUP BY 1
        )
        SELECT
          day_series.bucket_date AS date,
          COALESCE(conversation_daily.pipeline_new_amount, 0) AS pipeline_new_amount,
          COALESCE(receipt_daily.detected_total_amount, 0) AS detected_total_amount,
          conversation_daily.avg_ticket_amount,
          COALESCE(conversation_daily.conversions_count, 0)::int AS conversions_count,
          COALESCE(conversation_daily.terminal_count, 0)::int AS terminal_count
        FROM day_series
        LEFT JOIN conversation_daily USING (bucket_date)
        LEFT JOIN receipt_daily USING (bucket_date)
        ORDER BY day_series.bucket_date
        """,
        {
            "starts_at": bounds["starts_at"],
            "ends_at": bounds["ends_at"],
        },
    ).fetchall()
    return {
        "days": days,
        "starts_at": bounds["starts_at"],
        "ends_at": bounds["ends_at"],
        "points": [
            {
                "date": row["date"],
                "pipeline_new_amount": Decimal(row["pipeline_new_amount"] or 0),
                "detected_total_amount": Decimal(row["detected_total_amount"] or 0),
                "avg_ticket_amount": (
                    Decimal(row["avg_ticket_amount"])
                    if row["avg_ticket_amount"] is not None
                    else None
                ),
                "conversions_count": int(row["conversions_count"] or 0),
                "terminal_count": int(row["terminal_count"] or 0),
            }
            for row in points
        ],
        "meta": {
            "source": "app.conversations.created_at + app.receipts.created_at aggregated by day",
            "window": "requested",
            "sample_method": "full_aggregate",
            "sample_size": len(points),
        },
    }


@api.get("/dashboard/health", response_model=DashboardHealthRead)
def get_dashboard_health(conn: Connection[dict[str, Any]] = Depends(get_conn)) -> dict[str, Any]:
    generated_at = _now()
    conn.execute("SELECT 1")
    evolution = evolution_status(conn)
    calendar = calendar_status(conn)
    agent = agent_status(conn=conn)
    active_model = _get_active_model_optional(conn)
    model_pendencies = _count_model_pendencies(active_model)

    if agent["total_executions"]["value"] == 0:
        agent_signal = {
            "status": "offline",
            "label": "Sem execuções recentes",
            "detail": "Nenhuma execução do agente nas últimas 24 horas.",
            "checked_at": generated_at,
        }
    elif agent["failed_or_partial"]["value"] > 0:
        agent_signal = {
            "status": "degraded",
            "label": "Degradado",
            "detail": f"{agent['failed_or_partial']['value']} falhas ou parciais nas últimas 24h.",
            "checked_at": generated_at,
        }
    else:
        agent_signal = {
            "status": "online",
            "label": "Operando",
            "detail": f"{agent['total_executions']['value']} execuções nas últimas 24h.",
            "checked_at": generated_at,
        }

    if evolution["status"] == "CONNECTED":
        whatsapp_signal = {
            "status": "connected",
            "label": "Conectado",
            "detail": f"Instância {evolution['instance']} ativa.",
            "checked_at": evolution["updated_at"],
        }
    elif evolution["status"] == "QR_REQUIRED":
        whatsapp_signal = {
            "status": "reconnecting",
            "label": "Reconectando",
            "detail": "WhatsApp aguardando nova leitura de QR code.",
            "checked_at": evolution["updated_at"],
        }
    else:
        whatsapp_signal = {
            "status": "disconnected",
            "label": "Desconectado",
            "detail": f"Último evento em {evolution['last_event_at']}.",
            "checked_at": evolution["updated_at"],
        }

    if calendar["error_slots"] > 0:
        calendar_signal = {
            "status": "error",
            "label": "Com erro",
            "detail": f"{calendar['error_slots']} horários com erro de sync.",
            "checked_at": calendar["updated_at"],
        }
    elif calendar["pending_slots"] > 0:
        calendar_signal = {
            "status": "pending",
            "label": "Com pendências",
            "detail": f"{calendar['pending_slots']} horários aguardando sincronização.",
            "checked_at": calendar["updated_at"],
        }
    else:
        calendar_signal = {
            "status": "synced",
            "label": "Sincronizado",
            "detail": "Sem pendências ou erros relevantes de calendário.",
            "checked_at": calendar["updated_at"],
        }

    if active_model is None:
        model_signal = {
            "status": "missing",
            "label": "Sem agente",
            "detail": "Nenhum agente ativo cadastrado.",
            "checked_at": generated_at,
        }
    elif model_pendencies > 0:
        model_signal = {
            "status": "pending",
            "label": "Com pendências",
            "detail": f"{model_pendencies} ajustes pendentes no agente {active_model['display_name']}.",
            "checked_at": active_model["updated_at"],
        }
    else:
        model_signal = {
            "status": "complete",
            "label": "Configurado",
            "detail": f"Agente {active_model['display_name']} pronto para operar.",
            "checked_at": active_model["updated_at"],
        }

    return {
        "generated_at": generated_at,
        "agent": agent_signal,
        "whatsapp": whatsapp_signal,
        "calendar": calendar_signal,
        "model": model_signal,
    }


@api.get("/handoffs/summary", response_model=HandoffSummaryRead)
def get_handoffs_summary(
    window: Literal["7d"] = Query(default="7d"),
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    windows = conn.execute(
        """
        SELECT
          now() AS generated_at,
          now() - INTERVAL '7 days' AS requested_starts_at,
          now() AS requested_ends_at
        """
    ).fetchone()
    window_params = {
        "starts_at": windows["requested_starts_at"],
        "ends_at": windows["requested_ends_at"],
    }
    response_windows = {
        "requested": {
            "key": "requested",
            "label": window,
            "starts_at": windows["requested_starts_at"],
            "ends_at": windows["requested_ends_at"],
        },
        "all_time": {"key": "all_time", "label": "all_time", "starts_at": None, "ends_at": None},
    }

    total_conversations = _count(conn, "SELECT count(*) FROM app.conversations")
    current_counts = _count_by(conn, "app.conversations", "handoff_status", HANDOFF_STATUSES)
    open_status_total = current_counts["OPENED"] + current_counts["ACKNOWLEDGED"]

    age_counts = dict.fromkeys(HANDOFF_AGE_BUCKETS, 0)
    age_rows = conn.execute(
        """
        WITH current_open AS (
          SELECT c.id, ho.created_at AS opened_at
          FROM app.conversations c
          LEFT JOIN LATERAL (
            SELECT he.created_at
            FROM app.handoff_events he
            WHERE he.conversation_id = c.id
              AND he.event_type = 'handoff_opened'
            ORDER BY he.created_at DESC, he.id DESC
            LIMIT 1
          ) ho ON true
          WHERE c.handoff_status IN ('OPENED', 'ACKNOWLEDGED')
        )
        SELECT
          CASE
            WHEN opened_at IS NULL THEN 'UNKNOWN'
            WHEN now() - opened_at < INTERVAL '15 minutes' THEN '0-15m'
            WHEN now() - opened_at < INTERVAL '30 minutes' THEN '15-30m'
            WHEN now() - opened_at < INTERVAL '60 minutes' THEN '30-60m'
            WHEN now() - opened_at < INTERVAL '4 hours' THEN '1-4h'
            ELSE '4h+'
          END AS key,
          count(*)::int AS value
        FROM current_open
        GROUP BY key
        """
    ).fetchall()
    for row in age_rows:
        if row["key"] in age_counts:
            age_counts[row["key"]] = int(row["value"])

    reason_rows = conn.execute(
        """
        SELECT
          COALESCE(NULLIF(btrim(reason), ''), 'SEM_MOTIVO') AS key,
          count(*)::int AS value
        FROM app.handoff_events
        WHERE event_type = 'handoff_opened'
          AND created_at >= %(starts_at)s
          AND created_at < %(ends_at)s
        GROUP BY key
        ORDER BY value DESC, key ASC
        """,
        window_params,
    ).fetchall()
    reason_counts = {row["key"]: int(row["value"]) for row in reason_rows}
    reason_sample_size = sum(reason_counts.values())

    ack_duration = _handoff_duration_metric(
        conn,
        window_params,
        target_event="handoff_acknowledged",
        source="app.handoff_events.created_at:handoff_opened->handoff_acknowledged",
    )
    release_duration = _handoff_duration_metric(
        conn,
        window_params,
        target_event="handoff_released",
        source="app.handoff_events.created_at:handoff_opened->handoff_released",
    )

    return {
        "generated_at": windows["generated_at"],
        "requested_window": window,
        "windows": response_windows,
        "current_by_status": _breakdown(
            current_counts,
            source="app.conversations.handoff_status",
            window="all_time",
            sample_size=total_conversations,
        ),
        "open_age_buckets": _breakdown(
            age_counts,
            source="app.handoff_events.created_at latest handoff_opened; UNKNOWN when missing",
            window="all_time",
            sample_size=open_status_total,
        ),
        "reasons": _breakdown(
            reason_counts,
            source="app.handoff_events.reason",
            window="requested",
            sample_size=reason_sample_size,
        ),
        "time_to_acknowledge": ack_duration,
        "time_to_release": release_duration,
    }


@api.get("/dashboard/queues", response_model=PaginatedEnvelope[ConversationQueueItemRead])
def get_dashboard_queues(
    queue: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    stale_after_hours: int = Query(default=24, ge=1, le=168),
    undetermined_after_hours: int = Query(default=2, ge=1, le=72),
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    if queue is not None and queue not in CONVERSATION_QUEUE_KEYS:
        raise HTTPException(status_code=422, detail="invalid queue")

    params: dict[str, Any] = {
        "queue": queue,
        "limit": page_size,
        "offset": (page - 1) * page_size,
        "stale_after_hours": stale_after_hours,
        "undetermined_after_hours": undetermined_after_hours,
    }
    queue_filter = "WHERE q.queue_key = %(queue)s" if queue else ""
    base_sql = _dashboard_queue_base_sql()
    total = conn.execute(
        f"SELECT count(*) AS total FROM ({base_sql}) q {queue_filter}",
        params,
    ).fetchone()["total"]
    rows = conn.execute(
        f"""
        SELECT q.*
        FROM ({base_sql}) q
        {queue_filter}
        ORDER BY q.queue_priority ASC, q.relevant_at ASC NULLS LAST, q.conversation_id ASC
        LIMIT %(limit)s OFFSET %(offset)s
        """,
        params,
    ).fetchall()
    return {"items": rows, "total": total, "page": page, "page_size": page_size}


@api.get("/conversations", response_model=PaginatedEnvelope[ConversationRead])
def list_conversations(
    status: str | None = None,
    handoff_status: str | None = None,
    q: str | None = None,
    min_amount: Annotated[Decimal | None, Query(ge=0)] = None,
    max_amount: Annotated[Decimal | None, Query(ge=0)] = None,
    sort: Literal["recent", "amount_asc", "amount_desc"] = "recent",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    if (
        min_amount is not None
        and max_amount is not None
        and min_amount > max_amount
    ):
        raise HTTPException(
            status_code=422,
            detail="min_amount must be less than or equal to max_amount",
        )
    where, params = _conversation_filters(
        status=status,
        handoff_status=handoff_status,
        q=q,
        min_amount=min_amount,
        max_amount=max_amount,
    )
    order_clause = CONVERSATION_SORT_CLAUSES[sort]
    params["limit"] = page_size
    params["offset"] = (page - 1) * page_size
    total = conn.execute(f"SELECT count(*) AS total FROM app.conversations c JOIN app.clients cl ON cl.id = c.client_id {where}", params).fetchone()["total"]
    rows = conn.execute(
        f"""
        SELECT
          c.id, c.state, c.flow_type, c.handoff_status, c.pending_action,
          c.awaiting_input_type, c.awaiting_client_decision, c.urgency_profile,
          c.expected_amount, c.summary, c.last_handoff_at, c.last_message_at,
          cl.id AS client_id, cl.display_name AS client_display_name, cl.whatsapp_jid,
          cl.client_status, cl.profile_summary, cl.language_hint,
          mo.id AS model_id, mo.display_name AS model_display_name,
          lm.direction AS last_direction, lm.message_type AS last_message_type,
          lm.content_preview AS last_content_preview, lm.created_at AS last_created_at,
          lm.delivery_status AS last_delivery_status
        FROM app.conversations c
        JOIN app.clients cl ON cl.id = c.client_id
        JOIN app.models mo ON mo.id = c.model_id
        LEFT JOIN LATERAL (
          SELECT direction, message_type, left(content_text, 240) AS content_preview,
                 created_at, delivery_status
          FROM app.messages m
          WHERE m.conversation_id = c.id
          ORDER BY COALESCE(provider_message_at, created_at) DESC, id DESC
          LIMIT 1
        ) lm ON true
        {where}
        ORDER BY {order_clause}
        LIMIT %(limit)s OFFSET %(offset)s
        """,
        params,
    ).fetchall()
    return {
        "items": [_conversation_read(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@api.get("/conversations/{conversation_id}", response_model=ConversationDetailRead)
def get_conversation(
    conversation_id: uuid.UUID,
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    conversation = _get_conversation_read(conn, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="conversation not found")

    message_rows = conn.execute(
        """
        SELECT id, direction, role, message_type, content_text, delivery_status,
               from_me, trace_id, created_at
        FROM app.messages
        WHERE conversation_id = %(conversation_id)s
        ORDER BY COALESCE(provider_message_at, created_at) DESC, id DESC
        LIMIT 50
        """,
        {"conversation_id": conversation_id},
    ).fetchall()
    handoff_events = conn.execute(
        """
        SELECT id, conversation_id, event_type, previous_handoff_status, source,
               actor_label, reason, metadata_json, trace_id, created_at
        FROM app.handoff_events
        WHERE conversation_id = %(conversation_id)s
        ORDER BY created_at DESC, id DESC
        LIMIT 50
        """,
        {"conversation_id": conversation_id},
    ).fetchall()
    media = conn.execute(
        """
        SELECT ma.id, ma.model_id, ma.media_type, ma.category, ma.approval_status,
               ma.metadata_json, ma.created_at, ma.updated_at
        FROM app.media_assets ma
        WHERE ma.model_id = %(model_id)s
        ORDER BY ma.created_at DESC
        LIMIT 25
        """,
        {"model_id": conversation["model"]["id"]},
    ).fetchall()
    agent_execution = conn.execute(
        """
        SELECT trace_id, status, duration_ms, tool_count
        FROM logs.agent_executions
        WHERE conversation_id = %(conversation_id)s
        ORDER BY created_at DESC
        LIMIT 1
        """,
        {"conversation_id": conversation_id},
    ).fetchone()
    return {
        "conversation": conversation,
        "messages": list(reversed(message_rows)),
        "handoff_events": handoff_events,
        "media": media,
        "agent_execution": agent_execution,
    }


@api.post(
    "/conversations/{conversation_id}/handoff/acknowledge",
    response_model=HandoffActionRead,
)
def acknowledge_handoff(
    conversation_id: uuid.UUID,
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    row = conn.execute(
        "SELECT handoff_status FROM app.conversations WHERE id = %(id)s FOR UPDATE",
        {"id": conversation_id},
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="conversation not found")
    if row["handoff_status"] == "ACKNOWLEDGED":
        return {"status": "ACKNOWLEDGED", "conversation_id": conversation_id}
    if row["handoff_status"] != "OPENED":
        raise HTTPException(status_code=409, detail="handoff is not open")

    conn.execute(
        """
        UPDATE app.conversations
        SET handoff_status = 'ACKNOWLEDGED', updated_at = now()
        WHERE id = %(id)s
        """,
        {"id": conversation_id},
    )
    _insert_handoff_event(conn, conversation_id, "handoff_acknowledged", row["handoff_status"])
    return {"status": "ACKNOWLEDGED", "conversation_id": conversation_id}


@api.post(
    "/conversations/{conversation_id}/handoff/release",
    response_model=HandoffActionRead,
)
def release_handoff(
    conversation_id: uuid.UUID,
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    row = conn.execute(
        """
        SELECT handoff_status, state_before_escalation
        FROM app.conversations
        WHERE id = %(id)s
        FOR UPDATE
        """,
        {"id": conversation_id},
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="conversation not found")
    if row["handoff_status"] == "RELEASED":
        return {"status": "RELEASED", "conversation_id": conversation_id}
    if row["handoff_status"] not in {"OPENED", "ACKNOWLEDGED"}:
        raise HTTPException(status_code=409, detail="handoff is not open")

    conn.execute(
        """
        UPDATE app.conversations
        SET state = state_before_escalation,
            state_before_escalation = NULL,
            handoff_status = 'RELEASED',
            updated_at = now()
        WHERE id = %(id)s
        """,
        {"id": conversation_id},
    )
    _insert_handoff_event(conn, conversation_id, "handoff_released", row["handoff_status"])
    return {"status": "RELEASED", "conversation_id": conversation_id}


@api.get("/schedule/slots", response_model=PaginatedEnvelope[ScheduleSlotRead])
def list_schedule_slots(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    status: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    conditions = []
    params: dict[str, Any] = {}
    if from_:
        conditions.append("ends_at >= %(from)s")
        params["from"] = from_
    if to:
        conditions.append("starts_at <= %(to)s")
        params["to"] = to
    if status:
        conditions.append("status = %(status)s")
        params["status"] = status
    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    total = conn.execute(
        f"SELECT count(*) AS total FROM app.schedule_slots {where}",
        params,
    ).fetchone()["total"]
    params["limit"] = page_size
    params["offset"] = (page - 1) * page_size
    items = conn.execute(
        f"""
        SELECT id, model_id, starts_at, ends_at, status, source, external_event_id,
               calendar_sync_status, last_synced_at, last_sync_error
        FROM app.schedule_slots
        {where}
        ORDER BY starts_at ASC, id ASC
        LIMIT %(limit)s OFFSET %(offset)s
        """,
        params,
    ).fetchall()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@api.post("/schedule/slots/block", response_model=ScheduleSlotRead)
def block_schedule_slot(
    body: ScheduleBlockRequest,
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    model_id = body.model_id or _active_model_id(conn)
    if model_id is None:
        raise HTTPException(status_code=409, detail="no active model")
    try:
        row = conn.execute(
            """
            INSERT INTO app.schedule_slots (
              model_id, starts_at, ends_at, status, source,
              calendar_sync_status, metadata_json
            ) VALUES (
              %(model_id)s, %(starts_at)s, %(ends_at)s, 'BLOCKED', 'MANUAL',
              'PENDING', %(metadata_json)s
            )
            RETURNING id, model_id, starts_at, ends_at, status, source,
                      external_event_id, calendar_sync_status,
                      last_synced_at, last_sync_error
            """,
            {
                "model_id": model_id,
                "starts_at": body.starts_at,
                "ends_at": body.ends_at,
                "metadata_json": Jsonb({"reason": body.reason} if body.reason else {}),
            },
        ).fetchone()
    except ExclusionViolation as exc:
        raise HTTPException(status_code=409, detail="blocked slot overlaps an existing blocked slot") from exc
    return row


@api.post("/schedule/sync", response_model=ScheduleSyncRequestRead)
def request_schedule_sync() -> dict[str, Any]:
    return {"status": "accepted", "mode": "manual_stub", "message": "calendar sync worker is outside Fase 2"}


@api.get("/media", response_model=PaginatedEnvelope[MediaRead])
def list_media(
    model_id: uuid.UUID | None = None,
    type: str | None = None,
    approval_status: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    conditions = []
    params: dict[str, Any] = {"limit": page_size, "offset": (page - 1) * page_size}
    if model_id:
        conditions.append("model_id = %(model_id)s")
        params["model_id"] = model_id
    if type:
        conditions.append("media_type = %(type)s")
        params["type"] = type
    if approval_status:
        conditions.append("approval_status = %(approval_status)s")
        params["approval_status"] = approval_status
    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    total = conn.execute(f"SELECT count(*) AS total FROM app.media_assets {where}", params).fetchone()["total"]
    items = conn.execute(
        f"""
        SELECT id, model_id, media_type, category, approval_status,
               send_constraints_json, metadata_json, created_at, updated_at
        FROM app.media_assets
        {where}
        ORDER BY created_at DESC, id DESC
        LIMIT %(limit)s OFFSET %(offset)s
        """,
        params,
    ).fetchall()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@api.get("/media/usage-summary", response_model=MediaUsageSummaryRead)
def get_media_usage_summary(
    window: Literal["7d"] = Query(default="7d"),
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    windows = conn.execute(
        """
        SELECT
          now() AS generated_at,
          now() - INTERVAL '7 days' AS requested_starts_at,
          now() AS requested_ends_at
        """
    ).fetchone()
    params = {
        "starts_at": windows["requested_starts_at"],
        "ends_at": windows["requested_ends_at"],
    }

    total_media = _count(conn, "SELECT count(*) FROM app.media_assets")
    pending = _count(
        conn,
        "SELECT count(*) FROM app.media_assets WHERE approval_status = 'PENDING'",
    )
    without_category = _count(
        conn,
        """
        SELECT count(*)
        FROM app.media_assets
        WHERE category IS NULL OR btrim(category) = ''
        """,
    )
    approved_total = _count(
        conn,
        "SELECT count(*) FROM app.media_assets WHERE approval_status = 'APPROVED'",
    )
    approved_rows = conn.execute(
        """
        SELECT COALESCE(NULLIF(btrim(category), ''), 'SEM_CATEGORIA') AS key,
               count(*) AS value
        FROM app.media_assets
        WHERE approval_status = 'APPROVED'
        GROUP BY COALESCE(NULLIF(btrim(category), ''), 'SEM_CATEGORIA')
        ORDER BY key
        """
    ).fetchall()
    approved_by_category = {row["key"]: int(row["value"]) for row in approved_rows}

    media_usage_sample = _count(
        conn,
        """
        SELECT count(*)
        FROM app.messages
        WHERE media_id IS NOT NULL
          AND COALESCE(provider_message_at, created_at) >= %(starts_at)s
          AND COALESCE(provider_message_at, created_at) < %(ends_at)s
        """,
        params,
    )
    most_used_rows = conn.execute(
        """
        SELECT
          ma.id AS media_id,
          ma.media_type,
          ma.category,
          ma.approval_status,
          count(m.id) AS count
        FROM app.messages m
        JOIN app.media_assets ma ON ma.id = m.media_id
        WHERE m.media_id IS NOT NULL
          AND COALESCE(m.provider_message_at, m.created_at) >= %(starts_at)s
          AND COALESCE(m.provider_message_at, m.created_at) < %(ends_at)s
        GROUP BY ma.id, ma.media_type, ma.category, ma.approval_status
        ORDER BY count(m.id) DESC, ma.updated_at DESC, ma.id DESC
        LIMIT 5
        """,
        params,
    ).fetchall()

    delivery_status_sample = _count(
        conn,
        """
        SELECT count(*)
        FROM app.messages
        WHERE media_id IS NOT NULL
          AND delivery_status IS NOT NULL
          AND COALESCE(provider_message_at, created_at) >= %(starts_at)s
          AND COALESCE(provider_message_at, created_at) < %(ends_at)s
        """,
        params,
    )
    failure_rows = conn.execute(
        """
        SELECT
          ma.id AS media_id,
          ma.media_type,
          ma.category,
          ma.approval_status,
          count(m.id) AS count
        FROM app.messages m
        JOIN app.media_assets ma ON ma.id = m.media_id
        WHERE m.media_id IS NOT NULL
          AND m.delivery_status = 'FAILED'
          AND COALESCE(m.provider_message_at, m.created_at) >= %(starts_at)s
          AND COALESCE(m.provider_message_at, m.created_at) < %(ends_at)s
        GROUP BY ma.id, ma.media_type, ma.category, ma.approval_status
        ORDER BY count(m.id) DESC, ma.updated_at DESC, ma.id DESC
        LIMIT 5
        """,
        params,
    ).fetchall()

    response_windows = {
        "requested": {
            "key": "requested",
            "label": window,
            "starts_at": windows["requested_starts_at"],
            "ends_at": windows["requested_ends_at"],
        },
        "all_time": {"key": "all_time", "label": "all_time", "starts_at": None, "ends_at": None},
    }

    return {
        "generated_at": windows["generated_at"],
        "requested_window": window,
        "delivery_status_available": delivery_status_sample > 0,
        "windows": response_windows,
        "pending": _metric(
            pending,
            source="app.media_assets.approval_status",
            window="all_time",
            sample_size=total_media,
        ),
        "without_category": _metric(
            without_category,
            source="app.media_assets.category",
            window="all_time",
            sample_size=total_media,
        ),
        "approved_by_category": _breakdown(
            approved_by_category,
            source="app.media_assets.approval_status + app.media_assets.category",
            window="all_time",
            sample_size=approved_total,
        ),
        "most_used": _media_usage_rank(
            most_used_rows,
            source="app.messages.media_id + app.messages.provider_message_at/created_at",
            window="requested",
            sample_size=media_usage_sample,
        ),
        "send_failures": _media_usage_rank(
            failure_rows,
            source=(
                "app.messages.media_id + app.messages.delivery_status "
                "+ app.messages.provider_message_at/created_at"
            ),
            window="requested",
            sample_size=delivery_status_sample,
        ),
    }


@api.post("/media", response_model=MediaRead)
async def upload_media(
    file: UploadFile = File(...),
    model_id: uuid.UUID | None = Form(default=None),
    category: str | None = Form(default=None),
    approval_status: str = Form(default="PENDING"),
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    data = await file.read()
    if settings.max_media_upload_bytes > 0 and len(data) > settings.max_media_upload_bytes:
        raise HTTPException(status_code=413, detail="media upload exceeds max size")
    detected_mime = detect_mime(data)
    if detected_mime not in MEDIA_TYPES:
        raise HTTPException(status_code=415, detail="unsupported media mime type")
    selected_model_id = model_id or _active_model_id(conn)
    if selected_model_id is None:
        raise HTTPException(status_code=409, detail="no active model")

    media_id = uuid.uuid4()
    extension = MIME_EXTENSIONS[detected_mime]
    storage_root = settings.media_storage_dir
    storage_root.mkdir(parents=True, exist_ok=True)
    relative_path = Path(f"{media_id}{extension}")
    target = ensure_inside(storage_root, storage_root / relative_path)
    target.write_bytes(data)

    try:
        row = conn.execute(
            """
            INSERT INTO app.media_assets (
              id, model_id, media_type, category, storage_path, approval_status,
              send_constraints_json, metadata_json
            ) VALUES (
              %(id)s, %(model_id)s, %(media_type)s, %(category)s, %(storage_path)s,
              %(approval_status)s, %(send_constraints_json)s, %(metadata_json)s
            )
            RETURNING id, model_id, media_type, category, approval_status,
                      send_constraints_json, metadata_json, created_at, updated_at
            """,
            {
                "id": media_id,
                "model_id": selected_model_id,
                "media_type": MEDIA_TYPES[detected_mime],
                "category": category,
                "storage_path": relative_path.as_posix(),
                "approval_status": approval_status,
                "send_constraints_json": Jsonb(_default_send_constraints(MEDIA_TYPES[detected_mime])),
                "metadata_json": Jsonb(
                    {
                        "detected_mime": detected_mime,
                        "original_filename": file.filename,
                        "size_bytes": len(data),
                    }
                ),
            },
        ).fetchone()
    except ForeignKeyViolation as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=404, detail="model not found") from exc
    return row


@api.patch("/media/{media_id}", response_model=MediaRead)
def patch_media(
    media_id: uuid.UUID,
    body: MediaPatchRequest,
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="empty patch")
    allowed = {"category", "approval_status", "send_constraints_json", "metadata_json"}
    sets = []
    params: dict[str, Any] = {"id": media_id}
    for field, value in updates.items():
        if field not in allowed:
            continue
        sets.append(f"{field} = %({field})s")
        params[field] = Jsonb(value) if field.endswith("_json") else value
    row = conn.execute(
        f"""
        UPDATE app.media_assets
        SET {", ".join(sets)}, updated_at = now()
        WHERE id = %(id)s
        RETURNING id, model_id, media_type, category, approval_status,
                  send_constraints_json, metadata_json, created_at, updated_at
        """,
        params,
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="media not found")
    return row


@api.get("/media/{media_id}/content")
def get_media_content(
    media_id: uuid.UUID,
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> FileResponse:
    row = conn.execute(
        "SELECT storage_path, metadata_json FROM app.media_assets WHERE id = %(id)s",
        {"id": media_id},
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="media not found")
    storage_root = settings.media_storage_dir
    try:
        path = ensure_inside(storage_root, storage_root / row["storage_path"])
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="media path is not accessible") from exc
    if not path.exists():
        raise HTTPException(status_code=404, detail="media file not found")
    media_type = (row["metadata_json"] or {}).get("detected_mime")
    return FileResponse(path, media_type=media_type)


RECEIPT_AMOUNT_COLUMNS: dict[str, str] = {
    "detected": "r.detected_amount",
    "expected": "r.expected_amount",
}


@api.get("/receipts", response_model=PaginatedEnvelope[ReceiptRead])
def list_receipts(
    needs_review: bool | None = None,
    status: str | None = None,
    min_amount: Annotated[Decimal | None, Query(ge=0)] = None,
    max_amount: Annotated[Decimal | None, Query(ge=0)] = None,
    amount_field: Literal["detected", "expected"] = "detected",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    if (
        min_amount is not None
        and max_amount is not None
        and min_amount > max_amount
    ):
        raise HTTPException(
            status_code=422,
            detail="min_amount must be less than or equal to max_amount",
        )
    amount_column = RECEIPT_AMOUNT_COLUMNS[amount_field]
    conditions = []
    params: dict[str, Any] = {"limit": page_size, "offset": (page - 1) * page_size}
    if needs_review is not None:
        conditions.append("r.needs_review = %(needs_review)s")
        params["needs_review"] = needs_review
    if status:
        conditions.append("r.analysis_status = %(status)s")
        params["status"] = status
    if min_amount is not None:
        conditions.append(f"{amount_column} >= %(min_amount)s")
        params["min_amount"] = min_amount
    if max_amount is not None:
        conditions.append(f"{amount_column} <= %(max_amount)s")
        params["max_amount"] = max_amount
    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    total = conn.execute(
        f"""
        SELECT count(*) AS total
        FROM app.receipts r
        JOIN app.conversations c ON c.id = r.conversation_id
        JOIN app.clients cl ON cl.id = r.client_id
        JOIN app.models mo ON mo.id = c.model_id
        {where}
        """,
        params,
    ).fetchone()["total"]
    rows = conn.execute(
        f"""
        SELECT
          r.id, r.conversation_id, r.message_id, r.detected_amount,
          r.expected_amount, r.analysis_status, r.tolerance_applied,
          r.needs_review, r.metadata_json, r.created_at, r.updated_at,
          cl.id AS client_id, cl.display_name AS client_display_name,
          cl.whatsapp_jid, cl.client_status, cl.profile_summary, cl.language_hint,
          mo.id AS model_id, mo.display_name AS model_display_name
        FROM app.receipts r
        JOIN app.conversations c ON c.id = r.conversation_id
        JOIN app.clients cl ON cl.id = r.client_id
        JOIN app.models mo ON mo.id = c.model_id
        {where}
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT %(limit)s OFFSET %(offset)s
        """,
        params,
    ).fetchall()
    return {
        "items": [_receipt_read(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@api.get("/status/evolution", response_model=EvolutionStatusRead)
def evolution_status(conn: Connection[dict[str, Any]] = Depends(get_conn)) -> dict[str, Any]:
    row = conn.execute(
        """
        SELECT provider, instance, status, qr_code_ref, last_event_at, updated_at
        FROM app.integration_status
        WHERE provider = 'evolution'
        ORDER BY updated_at DESC
        LIMIT 1
        """
    ).fetchone()
    if row:
        return row
    return {
        "provider": "evolution",
        "instance": settings.evolution_instance,
        "status": "UNKNOWN",
        "qr_code_ref": None,
        "last_event_at": None,
        "updated_at": _now(),
    }


@api.get("/status/calendar", response_model=CalendarStatusRead)
def calendar_status(conn: Connection[dict[str, Any]] = Depends(get_conn)) -> dict[str, Any]:
    row = conn.execute(
        """
        SELECT
          count(*) FILTER (WHERE calendar_sync_status = 'PENDING') AS pending_slots,
          count(*) FILTER (WHERE calendar_sync_status = 'ERROR') AS error_slots,
          max(last_synced_at) AS last_synced_at,
          max(last_sync_error) AS last_sync_error
        FROM app.schedule_slots
        """
    ).fetchone()
    return {
        "provider": "calendar",
        "instance": settings.calendar_instance,
        "status": "LOCAL_CACHE_ONLY",
        **row,
        "updated_at": _now(),
    }


@api.get("/status/agent", response_model=AgentOpsSummaryRead)
def agent_status(
    window: Literal["24h"] = Query(default="24h"),
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    bounds = conn.execute(
        """
        SELECT
          now() AS generated_at,
          now() - INTERVAL '24 hours' AS requested_starts_at,
          now() AS requested_ends_at
        """
    ).fetchone()
    params = {
        "starts_at": bounds["requested_starts_at"],
        "ends_at": bounds["requested_ends_at"],
    }

    total = _count(
        conn,
        """
        SELECT count(*)
        FROM logs.agent_executions
        WHERE created_at >= %(starts_at)s AND created_at < %(ends_at)s
        """,
        params,
    )
    status_counts = _count_by(
        conn,
        "logs.agent_executions",
        "status",
        AGENT_EXECUTION_STATUSES,
        "created_at >= %(starts_at)s AND created_at < %(ends_at)s",
        params,
    )
    failed_or_partial = status_counts["FAILED"] + status_counts["PARTIAL"]
    fallback_count = _count(
        conn,
        """
        SELECT count(*)
        FROM logs.agent_executions
        WHERE created_at >= %(starts_at)s
          AND created_at < %(ends_at)s
          AND fallback_used = true
        """,
        params,
    )
    tool_failure_count = _count(
        conn,
        """
        SELECT count(*)
        FROM logs.agent_executions
        WHERE created_at >= %(starts_at)s
          AND created_at < %(ends_at)s
          AND status IN ('FAILED', 'PARTIAL')
          AND error_summary ILIKE '%%tool%%'
        """,
        params,
    )
    duration_row = conn.execute(
        """
        SELECT
          count(duration_ms)::int AS sample_size,
          round(avg(duration_ms))::int AS average_ms,
          round(
            (percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms))::numeric
          )::int AS p50_ms,
          round(
            (percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::numeric
          )::int AS p95_ms
        FROM logs.agent_executions
        WHERE created_at >= %(starts_at)s
          AND created_at < %(ends_at)s
          AND duration_ms IS NOT NULL
        """,
        params,
    ).fetchone()
    latest_failures = conn.execute(
        """
        SELECT
          id,
          conversation_id,
          trace_id,
          status,
          duration_ms,
          tool_count,
          retry_count,
          fallback_used,
          error_summary,
          created_at,
          concat('/conversas/', conversation_id::text) AS drilldown_href
        FROM logs.agent_executions
        WHERE created_at >= %(starts_at)s
          AND created_at < %(ends_at)s
          AND status IN ('FAILED', 'PARTIAL')
        ORDER BY created_at DESC, id DESC
        LIMIT 5
        """,
        params,
    ).fetchall()

    response_windows = {
        "requested": {
            "key": "requested",
            "label": window,
            "starts_at": bounds["requested_starts_at"],
            "ends_at": bounds["requested_ends_at"],
        },
    }
    latest_meta = {
        "source": "logs.agent_executions.status IN (FAILED, PARTIAL)",
        "window": "requested",
        "sample_method": "full_aggregate",
        "sample_size": failed_or_partial,
    }

    return {
        "generated_at": bounds["generated_at"],
        "requested_window": window,
        "windows": response_windows,
        "total_executions": _agent_ops_metric(
            total,
            source="logs.agent_executions.created_at",
            sample_size=total,
        ),
        "executions_by_status": _agent_ops_breakdown(
            status_counts,
            source="logs.agent_executions.status",
            sample_size=total,
        ),
        "failed_or_partial": _agent_ops_metric(
            failed_or_partial,
            source="logs.agent_executions.status IN (FAILED, PARTIAL)",
            sample_size=total,
        ),
        "duration": {
            "p50_ms": duration_row["p50_ms"],
            "p95_ms": duration_row["p95_ms"],
            "average_ms": duration_row["average_ms"],
            "meta": {
                "source": "logs.agent_executions.duration_ms",
                "window": "requested",
                "sample_method": "full_aggregate",
                "sample_size": duration_row["sample_size"],
            },
        },
        "fallback_used": _agent_ops_metric(
            fallback_count,
            source="logs.agent_executions.fallback_used",
            sample_size=total,
        ),
        "tool_failures": _agent_ops_metric(
            tool_failure_count,
            source="logs.agent_executions.error_summary ILIKE '%tool%'",
            sample_size=failed_or_partial,
        ),
        "latest_failures": latest_failures,
        "latest_failures_meta": latest_meta,
    }


webhooks = APIRouter(prefix="/webhooks")


@webhooks.post("/evolution")
def evolution_webhook(
    payload: dict[str, Any] = Body(...),
    apikey: Annotated[str | None, Header()] = None,
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    if not apikey or not hmac.compare_digest(apikey, settings.evolution_webhook_secret):
        raise HTTPException(status_code=401, detail="invalid evolution webhook secret")

    event = payload.get("event")
    if event == "connection.update":
        return _process_connection_update(conn, payload)
    if event == "messages.upsert":
        return _process_message_upsert(conn, payload)

    _insert_raw_event(conn, provider="evolution", payload=payload, processing_status="SKIPPED")
    return {"status": "skipped", "reason": "unsupported event"}


@webhooks.post("/chatwoot")
def chatwoot_webhook(
    payload: dict[str, Any] = Body(...),
    x_chatwoot_webhook_secret: Annotated[str | None, Header()] = None,
    conn: Connection[dict[str, Any]] = Depends(get_conn),
) -> dict[str, Any]:
    if not x_chatwoot_webhook_secret or not hmac.compare_digest(
        x_chatwoot_webhook_secret,
        settings.chatwoot_webhook_secret,
    ):
        raise HTTPException(status_code=401, detail="invalid chatwoot webhook secret")
    _insert_raw_event(conn, provider="chatwoot", payload=payload, processing_status="RECEIVED")
    return {"status": "received"}


def _conversation_filters(
    *,
    status: str | None,
    handoff_status: str | None,
    q: str | None,
    min_amount: Decimal | None = None,
    max_amount: Decimal | None = None,
) -> tuple[str, dict[str, Any]]:
    conditions = []
    params: dict[str, Any] = {}
    if status:
        conditions.append("c.state = %(status)s")
        params["status"] = status
    if handoff_status:
        conditions.append("c.handoff_status = %(handoff_status)s")
        params["handoff_status"] = handoff_status
    if q:
        conditions.append(
            """
            (
              cl.display_name ILIKE %(q)s
              OR cl.whatsapp_jid ILIKE %(q)s
              OR c.summary ILIKE %(q)s
              OR EXISTS (
                SELECT 1 FROM app.messages m
                WHERE m.conversation_id = c.id AND m.content_text ILIKE %(q)s
              )
            )
            """
        )
        params["q"] = f"%{q}%"
    if min_amount is not None:
        conditions.append("c.expected_amount >= %(min_amount)s")
        params["min_amount"] = min_amount
    if max_amount is not None:
        conditions.append("c.expected_amount <= %(max_amount)s")
        params["max_amount"] = max_amount
    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    return where, params


CONVERSATION_SORT_CLAUSES: dict[str, str] = {
    "recent": "COALESCE(c.last_message_at, c.created_at) DESC, c.id DESC",
    "amount_desc": "c.expected_amount DESC NULLS LAST, c.id ASC",
    "amount_asc": "c.expected_amount ASC NULLS LAST, c.id ASC",
}


def _clean_model_display_name(value: str | None) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="display_name must not be empty")
    return cleaned


def _clean_model_languages(values: list[str] | None) -> list[str]:
    if not values:
        return []
    unique: list[str] = []
    for value in values:
        cleaned = value.strip()
        if cleaned and cleaned not in unique:
            unique.append(cleaned)
    return unique


def _clean_calendar_external_id(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _count(conn: Connection[dict[str, Any]], sql: str, params: dict[str, Any] | None = None) -> int:
    row = conn.execute(sql, params or {}).fetchone()
    return int(row["count"] if "count" in row else next(iter(row.values())))


def _count_by(
    conn: Connection[dict[str, Any]],
    table: str,
    column: str,
    labels: tuple[str, ...],
    condition: str | None = None,
    params: dict[str, Any] | None = None,
) -> dict[str, int]:
    counts = dict.fromkeys(labels, 0)
    where = f"WHERE {condition}" if condition else ""
    rows = conn.execute(
        f"""
        SELECT {column} AS key, count(*) AS value
        FROM {table}
        {where}
        GROUP BY {column}
        """,
        params or {},
    ).fetchall()
    for row in rows:
        key = row["key"]
        if key in counts:
            counts[key] = int(row["value"])
    return counts


def _metric(value: int, *, source: str, window: str, sample_size: int) -> dict[str, Any]:
    return {
        "value": value,
        "meta": {
            "source": source,
            "window": window,
            "sample_method": "full_aggregate",
            "sample_size": sample_size,
        },
    }


def _rate_metric(value: int, *, source: str, window: str, sample_size: int) -> dict[str, Any]:
    return {
        "value": value,
        "meta": {
            "source": source,
            "window": window,
            "sample_method": "full_aggregate",
            "sample_size": sample_size,
        },
    }


def _breakdown(counts: dict[str, int], *, source: str, window: str, sample_size: int) -> dict[str, Any]:
    return {
        "counts": counts,
        "meta": {
            "source": source,
            "window": window,
            "sample_method": "full_aggregate",
            "sample_size": sample_size,
        },
    }


def _sum_by(
    conn: Connection[dict[str, Any]],
    table: str,
    group_column: str,
    amount_column: str,
    labels: tuple[str, ...],
    condition: str | None = None,
    params: dict[str, Any] | None = None,
) -> dict[str, Decimal]:
    amounts: dict[str, Decimal] = {label: Decimal("0") for label in labels}
    where = f"WHERE {condition}" if condition else ""
    rows = conn.execute(
        f"""
        SELECT {group_column} AS key, COALESCE(SUM({amount_column}), 0) AS value
        FROM {table}
        {where}
        GROUP BY {group_column}
        """,
        params or {},
    ).fetchall()
    for row in rows:
        key = row["key"]
        if key in amounts:
            amounts[key] = Decimal(row["value"] or 0)
    return amounts


def _amount_metric(
    value: Decimal | None,
    *,
    source: str,
    window: str,
    sample_size: int,
) -> dict[str, Any]:
    return {
        "value": Decimal(value or 0),
        "meta": {
            "source": source,
            "window": window,
            "sample_method": "full_aggregate",
            "sample_size": sample_size,
        },
    }


def _amount_breakdown(
    amounts: dict[str, Decimal],
    *,
    source: str,
    window: str,
    sample_size: int,
) -> dict[str, Any]:
    return {
        "amounts": amounts,
        "meta": {
            "source": source,
            "window": window,
            "sample_method": "full_aggregate",
            "sample_size": sample_size,
        },
    }


def _duration_metric(
    average_seconds: int | None,
    *,
    source: str,
    window: str,
    sample_size: int,
) -> dict[str, Any]:
    return {
        "average_seconds": average_seconds,
        "meta": {
            "source": source,
            "window": window,
            "sample_method": "full_aggregate",
            "sample_size": sample_size,
        },
    }


def _media_usage_rank(
    rows: list[dict[str, Any]],
    *,
    source: str,
    window: str,
    sample_size: int,
) -> dict[str, Any]:
    return {
        "items": [
            {
                "media_id": row["media_id"],
                "media_type": row["media_type"],
                "category": row["category"],
                "approval_status": row["approval_status"],
                "count": int(row["count"]),
                "drilldown_href": f"/midias#media-{row['media_id']}",
            }
            for row in rows
        ],
        "meta": {
            "source": source,
            "window": window,
            "sample_method": "full_aggregate",
            "sample_size": sample_size,
        },
    }


def _agent_ops_metric(value: int, *, source: str, sample_size: int) -> dict[str, Any]:
    return {
        "value": value,
        "meta": {
            "source": source,
            "window": "requested",
            "sample_method": "full_aggregate",
            "sample_size": sample_size,
        },
    }


def _agent_ops_breakdown(counts: dict[str, int], *, source: str, sample_size: int) -> dict[str, Any]:
    return {
        "counts": counts,
        "meta": {
            "source": source,
            "window": "requested",
            "sample_method": "full_aggregate",
            "sample_size": sample_size,
        },
    }


def _handoff_duration_metric(
    conn: Connection[dict[str, Any]],
    window_params: dict[str, Any],
    *,
    target_event: str,
    source: str,
) -> dict[str, Any] | None:
    params = {**window_params, "target_event": target_event}
    row = conn.execute(
        """
        WITH opened AS (
          SELECT id, conversation_id, created_at AS opened_at
          FROM app.handoff_events
          WHERE event_type = 'handoff_opened'
            AND created_at >= %(starts_at)s
            AND created_at < %(ends_at)s
        ),
        bounded AS (
          SELECT o.*, next_opened.created_at AS next_opened_at
          FROM opened o
          LEFT JOIN LATERAL (
            SELECT he.created_at
            FROM app.handoff_events he
            WHERE he.conversation_id = o.conversation_id
              AND he.event_type = 'handoff_opened'
              AND he.created_at > o.opened_at
            ORDER BY he.created_at ASC, he.id ASC
            LIMIT 1
          ) next_opened ON true
        ),
        paired AS (
          SELECT floor(extract(epoch FROM (target.created_at - b.opened_at)))::int AS seconds
          FROM bounded b
          JOIN LATERAL (
            SELECT he.created_at
            FROM app.handoff_events he
            WHERE he.conversation_id = b.conversation_id
              AND he.event_type = %(target_event)s
              AND he.created_at >= b.opened_at
              AND (b.next_opened_at IS NULL OR he.created_at < b.next_opened_at)
            ORDER BY he.created_at ASC, he.id ASC
            LIMIT 1
          ) target ON true
        )
        SELECT
          count(*)::int AS sample_size,
          CASE WHEN count(*) = 0 THEN NULL ELSE floor(avg(seconds))::int END AS average_seconds,
          min(seconds)::int AS min_seconds,
          max(seconds)::int AS max_seconds
        FROM paired
        WHERE seconds >= 0
        """,
        params,
    ).fetchone()
    if row["sample_size"] == 0:
        return None
    return {
        "average_seconds": row["average_seconds"],
        "min_seconds": row["min_seconds"],
        "max_seconds": row["max_seconds"],
        "meta": {
            "source": source,
            "window": "requested",
            "sample_method": "full_aggregate",
            "sample_size": row["sample_size"],
        },
    }


def _safe_percentage(numerator: int | None, denominator: int | None) -> int:
    if not numerator or not denominator:
        return 0
    return round((numerator / denominator) * 100)


def _get_active_model_optional(conn: Connection[dict[str, Any]]) -> dict[str, Any] | None:
    return conn.execute(
        f"""
        SELECT {MODEL_SELECT_COLUMNS}
        FROM app.models
        WHERE is_active = true
        LIMIT 1
        """
    ).fetchone()


def _count_model_pendencies(model: dict[str, Any] | None) -> int:
    if model is None:
        return 0
    pending = 0
    pending += _count_pending_decision(model.get("persona_json"))
    pending += _count_pending_decision(model.get("services_json"))
    pending += _count_pending_decision(model.get("pricing_json"))
    if not model.get("languages"):
        pending += 1
    calendar_external_id = model.get("calendar_external_id")
    if not calendar_external_id or not str(calendar_external_id).strip():
        pending += 1
    return pending


def _count_pending_decision(node: Any) -> int:
    if node is None:
        return 0
    if isinstance(node, str):
        return 1 if node == "PENDING_DECISION" else 0
    if isinstance(node, list):
        return sum(_count_pending_decision(item) for item in node)
    if isinstance(node, dict):
        return sum(_count_pending_decision(value) for value in node.values())
    return 0


def _dashboard_queue_base_sql() -> str:
    return """
    WITH base AS (
      SELECT
        c.id AS conversation_id,
        c.state,
        c.flow_type,
        c.handoff_status,
        c.awaiting_input_type,
        c.awaiting_client_decision,
        c.pending_action,
        c.last_handoff_at,
        c.last_message_at,
        c.created_at,
        c.expected_amount,
        c.urgency_profile,
        cl.display_name AS client_display_name,
        cl.whatsapp_jid AS client_identifier,
        li.latest_inbound_at,
        lo.latest_outbound_at,
        ho.created_at AS handoff_opened_at,
        ha.created_at AS handoff_acknowledged_at,
        count(*) OVER ()::int AS sample_size
      FROM app.conversations c
      JOIN app.clients cl ON cl.id = c.client_id
      LEFT JOIN LATERAL (
        SELECT max(COALESCE(m.provider_message_at, m.created_at)) AS latest_inbound_at
        FROM app.messages m
        WHERE m.conversation_id = c.id AND m.direction = 'INBOUND'
      ) li ON true
      LEFT JOIN LATERAL (
        SELECT max(COALESCE(m.provider_message_at, m.created_at)) AS latest_outbound_at
        FROM app.messages m
        WHERE m.conversation_id = c.id AND m.direction = 'OUTBOUND'
      ) lo ON true
      LEFT JOIN LATERAL (
        SELECT he.created_at
        FROM app.handoff_events he
        WHERE he.conversation_id = c.id AND he.event_type = 'handoff_opened'
        ORDER BY he.created_at DESC, he.id DESC
        LIMIT 1
      ) ho ON true
      LEFT JOIN LATERAL (
        SELECT he.created_at
        FROM app.handoff_events he
        WHERE he.conversation_id = c.id AND he.event_type = 'handoff_acknowledged'
        ORDER BY he.created_at DESC, he.id DESC
        LIMIT 1
      ) ha ON true
    ),
    queue_items AS (
      SELECT
        'OPEN_HANDOFF' AS queue_key,
        'Handoffs abertos' AS queue_label,
        10 AS queue_priority,
        conversation_id,
        client_display_name,
        client_identifier,
        state,
        flow_type,
        handoff_status,
        expected_amount,
        COALESCE(last_handoff_at, handoff_opened_at, last_message_at, created_at) AS relevant_at,
        CASE
          WHEN last_handoff_at IS NOT NULL THEN 'app.conversations.last_handoff_at'
          WHEN handoff_opened_at IS NOT NULL THEN 'app.handoff_events.created_at'
          WHEN last_message_at IS NOT NULL THEN 'app.conversations.last_message_at'
          ELSE 'app.conversations.created_at'
        END AS age_source,
        'Handoff aberto aguardando reconhecimento ou liberacao.' AS reason,
        'Assumir o atendimento humano e responder o lead.' AS next_best_action,
        concat('/conversas/', conversation_id::text) AS drilldown_href,
        'app.conversations + app.handoff_events' AS source,
        'all_time' AS queue_window,
        sample_size
      FROM base
      WHERE handoff_status = 'OPENED'

      UNION ALL

      SELECT
        'ACKNOWLEDGED_HANDOFF',
        'Handoffs reconhecidos pendentes',
        20,
        conversation_id,
        client_display_name,
        client_identifier,
        state,
        flow_type,
        handoff_status,
        expected_amount,
        COALESCE(handoff_acknowledged_at, last_handoff_at, handoff_opened_at, last_message_at, created_at),
        CASE
          WHEN handoff_acknowledged_at IS NOT NULL THEN 'app.handoff_events.created_at'
          WHEN last_handoff_at IS NOT NULL THEN 'app.conversations.last_handoff_at'
          WHEN handoff_opened_at IS NOT NULL THEN 'app.handoff_events.created_at'
          WHEN last_message_at IS NOT NULL THEN 'app.conversations.last_message_at'
          ELSE 'app.conversations.created_at'
        END,
        'Handoff reconhecido, mas ainda nao liberado para automacao.',
        'Retomar a conversa humana e registrar o proximo passo.',
        concat('/conversas/', conversation_id::text),
        'app.conversations + app.handoff_events',
        'all_time',
        sample_size
      FROM base
      WHERE handoff_status = 'ACKNOWLEDGED'

      UNION ALL

      SELECT
        'CLIENT_WAITING_RESPONSE',
        'Cliente esperando resposta',
        30,
        conversation_id,
        client_display_name,
        client_identifier,
        state,
        flow_type,
        handoff_status,
        expected_amount,
        latest_inbound_at,
        'app.messages.direction',
        'Ultimo inbound nao tem outbound posterior registrado.',
        COALESCE(pending_action, 'Responder a ultima mensagem e destravar a negociacao.'),
        concat('/conversas/', conversation_id::text),
        'app.messages.direction + provider_message_at/created_at',
        'latest_inbound_without_later_outbound',
        sample_size
      FROM base
      WHERE latest_inbound_at IS NOT NULL
        AND (latest_outbound_at IS NULL OR latest_inbound_at > latest_outbound_at)
        AND handoff_status NOT IN ('OPENED', 'ACKNOWLEDGED')

      UNION ALL

      SELECT
        'STALE_CONVERSATION',
        'Conversas paradas',
        40,
        conversation_id,
        client_display_name,
        client_identifier,
        state,
        flow_type,
        handoff_status,
        expected_amount,
        last_message_at,
        'app.conversations.last_message_at',
        'Conversa sem atividade recente por last_message_at.',
        COALESCE(pending_action, 'Reaquecer a conversa e validar se ainda existe interesse.'),
        concat('/conversas/', conversation_id::text),
        'app.conversations.last_message_at',
        concat('last_message_at <= now() - ', %(stale_after_hours)s, 'h'),
        sample_size
      FROM base
      WHERE last_message_at IS NOT NULL
        AND last_message_at <= now() - (%(stale_after_hours)s * INTERVAL '1 hour')

      UNION ALL

      SELECT
        'UNDETERMINED_AGED',
        'Flow UNDETERMINED envelhecido',
        50,
        conversation_id,
        client_display_name,
        client_identifier,
        state,
        flow_type,
        handoff_status,
        expected_amount,
        COALESCE(last_message_at, created_at),
        CASE
          WHEN last_message_at IS NOT NULL THEN 'app.conversations.last_message_at'
          ELSE 'app.conversations.created_at'
        END,
        'Flow type segue UNDETERMINED alem da janela configurada.',
        COALESCE(pending_action, 'Classificar o lead e definir o fluxo de atendimento.'),
        concat('/conversas/', conversation_id::text),
        'app.conversations.flow_type + last_message_at/created_at',
        concat('age >= ', %(undetermined_after_hours)s, 'h'),
        sample_size
      FROM base
      WHERE flow_type = 'UNDETERMINED'
        AND COALESCE(last_message_at, created_at) <= now() - (%(undetermined_after_hours)s * INTERVAL '1 hour')

      UNION ALL

      SELECT
        'NEGOTIATING_AWAITING_INPUT',
        'NEGOCIANDO com input pendente',
        60,
        conversation_id,
        client_display_name,
        client_identifier,
        state,
        flow_type,
        handoff_status,
        expected_amount,
        COALESCE(last_message_at, created_at),
        CASE
          WHEN last_message_at IS NOT NULL THEN 'app.conversations.last_message_at'
          ELSE 'app.conversations.created_at'
        END,
        concat('NEGOCIANDO aguardando ', awaiting_input_type, '.'),
        COALESCE(pending_action, 'Destravar o item pendente para seguir com a negociacao.'),
        concat('/conversas/', conversation_id::text),
        'app.conversations.state + awaiting_input_type',
        'all_time',
        sample_size
      FROM base
      WHERE state = 'NEGOCIANDO'
        AND awaiting_input_type IS NOT NULL
        AND btrim(awaiting_input_type) <> ''

      UNION ALL

      SELECT
        'AWAITING_CLIENT_DECISION',
        'Aguardando decisao do cliente',
        70,
        conversation_id,
        client_display_name,
        client_identifier,
        state,
        flow_type,
        handoff_status,
        expected_amount,
        COALESCE(last_message_at, created_at),
        CASE
          WHEN last_message_at IS NOT NULL THEN 'app.conversations.last_message_at'
          ELSE 'app.conversations.created_at'
        END,
        'Conversa marcada com awaiting_client_decision=true.',
        COALESCE(pending_action, 'Responder o cliente e pedir a confirmacao final.'),
        concat('/conversas/', conversation_id::text),
        'app.conversations.awaiting_client_decision',
        'all_time',
        sample_size
      FROM base
      WHERE awaiting_client_decision = true

      UNION ALL

      SELECT
        'EXTERNAL_OPEN_HANDOFF',
        'Flow EXTERNAL com handoff aberto',
        80,
        conversation_id,
        client_display_name,
        client_identifier,
        state,
        flow_type,
        handoff_status,
        expected_amount,
        COALESCE(last_handoff_at, handoff_opened_at, last_message_at, created_at),
        CASE
          WHEN last_handoff_at IS NOT NULL THEN 'app.conversations.last_handoff_at'
          WHEN handoff_opened_at IS NOT NULL THEN 'app.handoff_events.created_at'
          WHEN last_message_at IS NOT NULL THEN 'app.conversations.last_message_at'
          ELSE 'app.conversations.created_at'
        END,
        'Fluxo externo exige acompanhamento humano com handoff aberto.',
        'Assumir o lead de maior valor e conduzir o handoff humano.',
        concat('/conversas/', conversation_id::text),
        'app.conversations.flow_type + handoff_status',
        'all_time',
        sample_size
      FROM base
      WHERE flow_type = 'EXTERNAL' AND handoff_status = 'OPENED'
    )
    SELECT
      queue_key,
      queue_label,
      queue_priority,
      conversation_id,
      client_display_name,
      client_identifier,
      state,
      flow_type,
      handoff_status,
      expected_amount,
      relevant_at,
      CASE
        WHEN relevant_at IS NULL THEN NULL
        ELSE GREATEST(0, floor(extract(epoch FROM (now() - relevant_at))))::int
      END AS age_seconds,
      age_source,
      reason,
      next_best_action,
      drilldown_href,
      source,
      queue_window AS "window",
      sample_size
    FROM queue_items
    """


def _get_conversation_read(conn: Connection[dict[str, Any]], conversation_id: uuid.UUID) -> dict[str, Any] | None:
    row = conn.execute(
        """
        SELECT
          c.id, c.state, c.flow_type, c.handoff_status, c.pending_action,
          c.awaiting_input_type, c.awaiting_client_decision, c.urgency_profile,
          c.expected_amount, c.summary, c.last_handoff_at, c.last_message_at,
          cl.id AS client_id, cl.display_name AS client_display_name, cl.whatsapp_jid,
          cl.client_status, cl.profile_summary, cl.language_hint,
          mo.id AS model_id, mo.display_name AS model_display_name,
          lm.direction AS last_direction, lm.message_type AS last_message_type,
          lm.content_preview AS last_content_preview, lm.created_at AS last_created_at,
          lm.delivery_status AS last_delivery_status
        FROM app.conversations c
        JOIN app.clients cl ON cl.id = c.client_id
        JOIN app.models mo ON mo.id = c.model_id
        LEFT JOIN LATERAL (
          SELECT direction, message_type, left(content_text, 240) AS content_preview,
                 created_at, delivery_status
          FROM app.messages m
          WHERE m.conversation_id = c.id
          ORDER BY COALESCE(provider_message_at, created_at) DESC, id DESC
          LIMIT 1
        ) lm ON true
        WHERE c.id = %(conversation_id)s
        """,
        {"conversation_id": conversation_id},
    ).fetchone()
    return _conversation_read(row) if row else None


def _conversation_read(row: dict[str, Any]) -> dict[str, Any]:
    last_message = None
    if row["last_direction"]:
        last_message = {
            "direction": row["last_direction"],
            "message_type": row["last_message_type"],
            "content_preview": row["last_content_preview"],
            "created_at": row["last_created_at"],
            "delivery_status": row["last_delivery_status"],
        }
    return {
        "id": row["id"],
        "client": {
            "id": row["client_id"],
            "display_name": row["client_display_name"],
            "whatsapp_jid": row["whatsapp_jid"],
            "client_status": row["client_status"],
            "profile_summary": row["profile_summary"],
            "language_hint": row["language_hint"],
        },
        "model": {"id": row["model_id"], "display_name": row["model_display_name"]},
        "state": row["state"],
        "flow_type": row["flow_type"],
        "handoff_status": row["handoff_status"],
        "summary": row["summary"],
        "pending_action": row["pending_action"],
        "awaiting_input_type": row["awaiting_input_type"],
        "awaiting_client_decision": row["awaiting_client_decision"],
        "urgency_profile": row["urgency_profile"],
        "expected_amount": row["expected_amount"],
        "last_handoff_at": row["last_handoff_at"],
        "last_message": last_message,
        "last_message_at": row["last_message_at"],
    }


def _receipt_read(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "conversation_id": row["conversation_id"],
        "client": {
            "id": row["client_id"],
            "display_name": row["client_display_name"],
            "whatsapp_jid": row["whatsapp_jid"],
            "client_status": row["client_status"],
            "profile_summary": row["profile_summary"],
            "language_hint": row["language_hint"],
        },
        "model": {"id": row["model_id"], "display_name": row["model_display_name"]},
        "message_id": row["message_id"],
        "detected_amount": row["detected_amount"],
        "expected_amount": row["expected_amount"],
        "analysis_status": row["analysis_status"],
        "tolerance_applied": row["tolerance_applied"],
        "needs_review": row["needs_review"],
        "metadata_json": row["metadata_json"],
        "drilldown_href": f"/conversas/{row['conversation_id']}",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _insert_handoff_event(
    conn: Connection[dict[str, Any]],
    conversation_id: uuid.UUID,
    event_type: str,
    previous_status: str,
) -> None:
    conn.execute(
        """
        INSERT INTO app.handoff_events (
          conversation_id, event_type, previous_handoff_status, source, actor_label
        ) VALUES (
          %(conversation_id)s, %(event_type)s, %(previous_status)s,
          'operator_ui', 'operator'
        )
        """,
        {
            "conversation_id": conversation_id,
            "event_type": event_type,
            "previous_status": previous_status,
        },
    )


def _default_send_constraints(media_type: str) -> dict[str, Any]:
    constraints: dict[str, Any] = {"send_only_when_requested": True}
    if media_type == "video":
        constraints["view_once"] = True
    return constraints


def _active_model_id(conn: Connection[dict[str, Any]]) -> uuid.UUID | None:
    row = conn.execute("SELECT id FROM app.models WHERE is_active = true LIMIT 1").fetchone()
    return row["id"] if row else None


def _process_connection_update(conn: Connection[dict[str, Any]], payload: dict[str, Any]) -> dict[str, Any]:
    parsed = EvolutionConnectionUpdate.model_validate(payload)
    raw = _insert_raw_event(conn, provider="evolution", payload=payload, processing_status="PROCESSED")
    status = _map_evolution_status(parsed.data.status or parsed.data.state)
    conn.execute(
        """
        INSERT INTO app.integration_status (
          provider, instance, status, qr_code_ref, last_event_at, metadata_json
        ) VALUES (
          'evolution', %(instance)s, %(status)s, %(qr_code_ref)s, now(), %(metadata_json)s
        )
        ON CONFLICT (provider, instance)
        DO UPDATE SET
          status = EXCLUDED.status,
          qr_code_ref = EXCLUDED.qr_code_ref,
          last_event_at = EXCLUDED.last_event_at,
          metadata_json = EXCLUDED.metadata_json,
          updated_at = now()
        """,
        {
            "instance": parsed.instance,
            "status": status,
            "qr_code_ref": parsed.data.qr,
            "metadata_json": Jsonb({"raw_event_id": str(raw["id"]), "reason": parsed.data.reason}),
        },
    )
    return {"status": "processed", "event": parsed.event, "integration_status": status}


def _process_message_upsert(conn: Connection[dict[str, Any]], payload: dict[str, Any]) -> dict[str, Any]:
    parsed = EvolutionMessagesUpsert.model_validate(payload)
    external_message_id = parsed.data.key.id
    raw = _insert_raw_event(
        conn,
        provider="evolution",
        payload=payload,
        external_message_id=external_message_id,
        remote_jid=parsed.data.key.remote_jid,
        processing_status="RECEIVED",
    )
    normalized = normalize_evolution_message(parsed, trace_id=raw["trace_id"], raw_event_id=raw["id"])
    model_id = _active_model_id(conn)
    if model_id is None:
        _mark_raw_failed(conn, raw["id"], "NO_ACTIVE_MODEL", "No active model is configured")
        raise HTTPException(status_code=409, detail="no active model")

    client = conn.execute(
        """
        INSERT INTO app.clients (whatsapp_jid, display_name)
        VALUES (%(whatsapp_jid)s, %(display_name)s)
        ON CONFLICT (whatsapp_jid)
        DO UPDATE SET display_name = COALESCE(app.clients.display_name, EXCLUDED.display_name),
                      updated_at = now()
        RETURNING id
        """,
        {"whatsapp_jid": normalized.remote_jid, "display_name": parsed.data.push_name},
    ).fetchone()
    conversation = conn.execute(
        """
        INSERT INTO app.conversations (client_id, model_id, state, flow_type, handoff_status, last_message_at)
        VALUES (%(client_id)s, %(model_id)s, 'QUALIFICANDO', 'UNDETERMINED', 'NONE', %(last_message_at)s)
        ON CONFLICT (client_id, model_id)
        DO UPDATE SET last_message_at = GREATEST(
          COALESCE(app.conversations.last_message_at, EXCLUDED.last_message_at),
          EXCLUDED.last_message_at
        ), updated_at = now()
        RETURNING id
        """,
        {"client_id": client["id"], "model_id": model_id, "last_message_at": normalized.received_at},
    ).fetchone()
    direction = "OUTBOUND" if normalized.from_me else "INBOUND"
    role = "human" if normalized.from_me else "client"
    inserted = conn.execute(
        """
        INSERT INTO app.messages (
          conversation_id, client_id, external_message_id, direction, role,
          message_type, content_text, from_me, trace_id, raw_event_id,
          provider_message_at
        ) VALUES (
          %(conversation_id)s, %(client_id)s, %(external_message_id)s, %(direction)s,
          %(role)s, %(message_type)s, %(content_text)s, %(from_me)s, %(trace_id)s,
          %(raw_event_id)s, %(provider_message_at)s
        )
        ON CONFLICT (external_message_id) WHERE external_message_id IS NOT NULL
        DO NOTHING
        RETURNING id
        """,
        {
            "conversation_id": conversation["id"],
            "client_id": client["id"],
            "external_message_id": normalized.external_message_id,
            "direction": direction,
            "role": role,
            "message_type": normalized.message_type,
            "content_text": normalized.text,
            "from_me": normalized.from_me,
            "trace_id": normalized.trace_id,
            "raw_event_id": normalized.raw_event_id,
            "provider_message_at": normalized.received_at,
        },
    ).fetchone()
    conn.execute(
        """
        UPDATE app.raw_webhook_events
        SET processing_status = %(status)s, processed_at = now()
        WHERE id = %(id)s
        """,
        {"id": raw["id"], "status": "PROCESSED" if inserted else "SKIPPED"},
    )
    return {
        "status": "processed" if inserted else "duplicate",
        "conversation_id": conversation["id"],
        "message_id": inserted["id"] if inserted else None,
    }


def _insert_raw_event(
    conn: Connection[dict[str, Any]],
    *,
    provider: str,
    payload: dict[str, Any],
    external_message_id: str | None = None,
    remote_jid: str | None = None,
    processing_status: str,
) -> dict[str, Any]:
    sanitized = _sanitize_payload(payload)
    event_name = str(payload.get("event") or payload.get("event_name") or "unknown")
    instance = payload.get("instance")
    if external_message_id:
        row = conn.execute(
            """
            INSERT INTO app.raw_webhook_events (
              provider, event_name, instance, external_message_id, remote_jid,
              payload_sanitized_json, processing_status
            ) VALUES (
              %(provider)s, %(event_name)s, %(instance)s, %(external_message_id)s,
              %(remote_jid)s, %(payload)s, %(processing_status)s
            )
            ON CONFLICT (provider, external_message_id) WHERE external_message_id IS NOT NULL
            DO NOTHING
            RETURNING id, trace_id
            """,
            {
                "provider": provider,
                "event_name": event_name,
                "instance": instance,
                "external_message_id": external_message_id,
                "remote_jid": remote_jid,
                "payload": Jsonb(sanitized),
                "processing_status": processing_status,
            },
        ).fetchone()
        if row:
            return row
        return conn.execute(
            """
            SELECT id, trace_id
            FROM app.raw_webhook_events
            WHERE provider = %(provider)s AND external_message_id = %(external_message_id)s
            """,
            {"provider": provider, "external_message_id": external_message_id},
        ).fetchone()

    return conn.execute(
        """
        INSERT INTO app.raw_webhook_events (
          provider, event_name, instance, remote_jid, payload_sanitized_json,
          processing_status
        ) VALUES (
          %(provider)s, %(event_name)s, %(instance)s, %(remote_jid)s,
          %(payload)s, %(processing_status)s
        )
        RETURNING id, trace_id
        """,
        {
            "provider": provider,
            "event_name": event_name,
            "instance": instance,
            "remote_jid": remote_jid,
            "payload": Jsonb(sanitized),
            "processing_status": processing_status,
        },
    ).fetchone()


def _mark_raw_failed(conn: Connection[dict[str, Any]], raw_event_id: uuid.UUID, code: str, message: str) -> None:
    conn.execute(
        """
        UPDATE app.raw_webhook_events
        SET processing_status = 'FAILED', error_code = %(code)s,
            error_message = %(message)s, processed_at = now()
        WHERE id = %(id)s
        """,
        {"id": raw_event_id, "code": code, "message": message},
    )


def _map_evolution_status(value: str | None) -> str:
    normalized = (value or "").upper()
    if normalized in {"CONNECTED", "OPEN"}:
        return "CONNECTED"
    if normalized in {"DISCONNECTED", "CLOSE", "CLOSED"}:
        return "DISCONNECTED"
    if "QR" in normalized:
        return "QR_REQUIRED"
    return "UNKNOWN"


def _sanitize_payload(value: Any) -> Any:
    if isinstance(value, dict):
        sanitized = {}
        for key, item in value.items():
            lowered = str(key).lower()
            if lowered in {"base64", "jpegthumbnail", "thumbnail", "thumbnaildirectpath"}:
                sanitized[key] = "[removed]"
            else:
                sanitized[key] = _sanitize_payload(item)
        return sanitized
    if isinstance(value, list):
        return [_sanitize_payload(item) for item in value]
    return value


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


app = create_app()
