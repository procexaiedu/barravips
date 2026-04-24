"""Regressao de schema dos read models operacionais.

Criterio de aceite Fase 2:
- Endpoints retornam contratos versionados e passam testes de regressao de schema.
- Listas operacionais nao fazem N+1 para dados basicos de cliente, modelo e ultima mensagem.
- Telas futuras conseguem montar lista de conversas sem chamada adicional por item.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any, Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter

from barra_vips_api.db import connect
from barra_vips_api.db import get_conn as api_get_conn
from barra_vips_contracts.v1 import (
    AgentOpsSummaryRead,
    ConversationDetailRead,
    DashboardHealthRead,
    ConversationQueueItemRead,
    ConversationRead,
    DashboardSummaryRead,
    EvolutionStatusRead,
    HandoffSummaryRead,
    ModelRead,
    MediaUsageSummaryRead,
    PaginatedEnvelope,
    ReceiptRead,
    ScheduleSlotRead,
)
from helpers import SEED_CONVERSATION_ID, SEED_MODEL_ID


CONVERSATION_LIST_ADAPTER = TypeAdapter(PaginatedEnvelope[ConversationRead])
QUEUE_LIST_ADAPTER = TypeAdapter(PaginatedEnvelope[ConversationQueueItemRead])
SCHEDULE_LIST_ADAPTER = TypeAdapter(PaginatedEnvelope[ScheduleSlotRead])
RECEIPT_LIST_ADAPTER = TypeAdapter(PaginatedEnvelope[ReceiptRead])


@pytest.fixture()
def isolated_dashboard_db(app) -> Iterator[tuple[TestClient, Any]]:
    manager = connect()
    conn = manager.__enter__()
    conn.execute(
        """
        TRUNCATE
          logs.agent_executions,
          app.receipts,
          app.handoff_events,
          app.messages,
          app.conversations,
          app.media_assets,
          app.schedule_slots,
          app.raw_webhook_events,
          app.integration_status,
          app.clients,
          app.models
        CASCADE
        """
    )

    def override_get_conn() -> Iterator[Any]:
        yield conn

    app.dependency_overrides[api_get_conn] = override_get_conn
    try:
        with TestClient(app) as test_client:
            yield test_client, conn
    finally:
        app.dependency_overrides.pop(api_get_conn, None)
        conn.rollback()
        manager.__exit__(None, None, None)


def _insert_dashboard_summary_fixture(conn: Any) -> None:
    model_id = "10000000-0000-0000-0000-0000000000aa"
    conn.execute(
        """
        INSERT INTO app.models (
          id, display_name, is_active, persona_json, services_json, pricing_json, languages, calendar_external_id
        )
        VALUES (
          %(model_id)s,
          'Modelo Dashboard Fixture',
          true,
          '{"tom": "PENDING_DECISION"}'::jsonb,
          '{}'::jsonb,
          '{}'::jsonb,
          ARRAY[]::text[],
          NULL
        )
        """,
        {"model_id": model_id},
    )
    for index in range(1, 5):
        conn.execute(
            """
            INSERT INTO app.clients (id, whatsapp_jid, display_name)
            VALUES (%(id)s, %(jid)s, %(name)s)
            """,
            {
                "id": f"20000000-0000-0000-0000-0000000000a{index}",
                "jid": f"552199999990{index}@s.whatsapp.net",
                "name": f"Cliente Dashboard {index}",
            },
        )
    conversations = [
        ("30000000-0000-0000-0000-0000000000a1", "20000000-0000-0000-0000-0000000000a1", "QUALIFICANDO", None, "INTERNAL", "NONE", "now()", "now() - interval '1 hour'"),
        ("30000000-0000-0000-0000-0000000000a2", "20000000-0000-0000-0000-0000000000a2", "ESCALADO", "NEGOCIANDO", "EXTERNAL", "OPENED", "now() - interval '2 days'", "now() - interval '2 hours'"),
        ("30000000-0000-0000-0000-0000000000a3", "20000000-0000-0000-0000-0000000000a3", "ESCALADO", "CONFIRMADO", "INTERNAL", "ACKNOWLEDGED", "now() - interval '2 days'", "now() - interval '30 hours'"),
        ("30000000-0000-0000-0000-0000000000a4", "20000000-0000-0000-0000-0000000000a4", "NOVO", None, "UNDETERMINED", "NONE", "now()", None),
    ]
    for conversation in conversations:
        conversation_id, client_id, state, state_before, flow_type, handoff_status, created_at, last_message_at = conversation
        conn.execute(
            f"""
            INSERT INTO app.conversations (
              id, client_id, model_id, state, state_before_escalation, flow_type,
              handoff_status, created_at, last_message_at
            ) VALUES (
              %(id)s, %(client_id)s, %(model_id)s, %(state)s, %(state_before)s,
              %(flow_type)s, %(handoff_status)s, {created_at}, {last_message_at or 'NULL'}
            )
            """,
            {
                "id": conversation_id,
                "client_id": client_id,
                "model_id": model_id,
                "state": state,
                "state_before": state_before,
                "flow_type": flow_type,
                "handoff_status": handoff_status,
            },
        )
    conn.execute(
        """
        INSERT INTO app.messages (
          conversation_id, client_id, direction, role, message_type, content_text, from_me, provider_message_at
        ) VALUES
          (
            '30000000-0000-0000-0000-0000000000a1',
            '20000000-0000-0000-0000-0000000000a1',
            'INBOUND',
            'client',
            'text',
            'primeiro contato',
            false,
            now() - interval '50 minutes'
          ),
          (
            '30000000-0000-0000-0000-0000000000a1',
            '20000000-0000-0000-0000-0000000000a1',
            'OUTBOUND',
            'agent',
            'text',
            'resposta rapida',
            false,
            now() - interval '20 minutes'
          ),
          (
            '30000000-0000-0000-0000-0000000000a4',
            '20000000-0000-0000-0000-0000000000a4',
            'INBOUND',
            'client',
            'text',
            'oi',
            false,
            now() - interval '30 minutes'
          )
        """
    )
    media_rows = [
        ("40000000-0000-0000-0000-0000000000a1", "image", None, "PENDING", "pending-null.jpg"),
        ("40000000-0000-0000-0000-0000000000a2", "video", "portfolio", "PENDING", "pending-category.mp4"),
        ("40000000-0000-0000-0000-0000000000a3", "image", "", "APPROVED", "approved-empty.jpg"),
    ]
    for media_id, media_type, category, approval_status, storage_path in media_rows:
        conn.execute(
            """
            INSERT INTO app.media_assets (
              id, model_id, media_type, category, storage_path, approval_status
            ) VALUES (
              %(id)s, %(model_id)s, %(media_type)s, %(category)s,
              %(storage_path)s, %(approval_status)s
            )
            """,
            {
                "id": media_id,
                "model_id": model_id,
                "media_type": media_type,
                "category": category,
                "storage_path": storage_path,
                "approval_status": approval_status,
            },
        )
    slots = [
        ("50000000-0000-0000-0000-0000000000a1", "BLOCKED", "MANUAL", "PENDING", "now() + interval '1 day'", "now() + interval '1 day 1 hour'"),
        ("50000000-0000-0000-0000-0000000000a2", "CONFIRMED", "MANUAL", "SYNCED", "now() + interval '2 days'", "now() + interval '2 days 1 hour'"),
        ("50000000-0000-0000-0000-0000000000a3", "HELD", "AUTO_BLOCK", "ERROR", "now() + interval '3 days'", "now() + interval '3 days 1 hour'"),
        ("50000000-0000-0000-0000-0000000000a4", "CANCELLED", "CALENDAR_SYNC", "SYNCED", "now() + interval '4 days'", "now() + interval '4 days 1 hour'"),
    ]
    for slot_id, status, source, sync_status, starts_at, ends_at in slots:
        conn.execute(
            f"""
            INSERT INTO app.schedule_slots (
              id, model_id, starts_at, ends_at, status, source, calendar_sync_status
            ) VALUES (
              %(id)s, %(model_id)s, {starts_at}, {ends_at}, %(status)s,
              %(source)s, %(sync_status)s
            )
            """,
            {
                "id": slot_id,
                "model_id": model_id,
                "status": status,
                "source": source,
                "sync_status": sync_status,
            },
        )


def _insert_dashboard_queue_fixture(conn: Any) -> dict[str, str]:
    model_id = "10000000-0000-0000-0000-0000000000bb"
    conn.execute(
        """
        INSERT INTO app.models (id, display_name, is_active)
        VALUES (%(model_id)s, 'Modelo Queue Fixture', true)
        """,
        {"model_id": model_id},
    )
    for index in range(1, 10):
        conn.execute(
            """
            INSERT INTO app.clients (id, whatsapp_jid, display_name)
            VALUES (%(id)s, %(jid)s, %(name)s)
            """,
            {
                "id": f"21000000-0000-0000-0000-0000000000b{index}",
                "jid": f"552188888880{index}@s.whatsapp.net",
                "name": f"Cliente Queue {index}",
            },
        )

    ids = {
        "open_old": "31000000-0000-0000-0000-0000000000b1",
        "open_new": "31000000-0000-0000-0000-0000000000b2",
        "ack": "31000000-0000-0000-0000-0000000000b3",
        "client_waiting": "31000000-0000-0000-0000-0000000000b4",
        "responded": "31000000-0000-0000-0000-0000000000b5",
        "stale": "31000000-0000-0000-0000-0000000000b6",
        "undetermined_missing_last_message": "31000000-0000-0000-0000-0000000000b7",
        "negotiating_input": "31000000-0000-0000-0000-0000000000b8",
        "decision": "31000000-0000-0000-0000-0000000000b9",
    }
    rows = [
        (ids["open_old"], 1, "ESCALADO", "NEGOCIANDO", "EXTERNAL", "OPENED", None, "now() - interval '3 hours'", None, False, "now() - interval '6 hours'"),
        (ids["open_new"], 2, "ESCALADO", "QUALIFICANDO", "INTERNAL", "OPENED", "now() - interval '30 minutes'", "now() - interval '20 minutes'", None, False, "now() - interval '2 hours'"),
        (ids["ack"], 3, "ESCALADO", "CONFIRMADO", "INTERNAL", "ACKNOWLEDGED", "now() - interval '2 hours'", "now() - interval '90 minutes'", None, False, "now() - interval '3 hours'"),
        (ids["client_waiting"], 4, "QUALIFICANDO", None, "INTERNAL", "NONE", None, "now() - interval '70 minutes'", None, False, "now() - interval '4 hours'"),
        (ids["responded"], 5, "QUALIFICANDO", None, "INTERNAL", "NONE", None, "now() - interval '10 minutes'", None, False, "now() - interval '4 hours'"),
        (ids["stale"], 6, "CONFIRMADO", None, "INTERNAL", "NONE", None, "now() - interval '30 hours'", None, False, "now() - interval '2 days'"),
        (ids["undetermined_missing_last_message"], 7, "NOVO", None, "UNDETERMINED", "NONE", None, None, None, False, "now() - interval '5 hours'"),
        (ids["negotiating_input"], 8, "NEGOCIANDO", None, "INTERNAL", "NONE", None, "now() - interval '20 minutes'", "payment_proof", False, "now() - interval '1 hour'"),
        (ids["decision"], 9, "NEGOCIANDO", None, "INTERNAL", "NONE", None, "now() - interval '15 minutes'", None, True, "now() - interval '1 hour'"),
    ]
    for conversation_id, client_index, state, state_before, flow_type, handoff_status, last_handoff_at, last_message_at, awaiting_input_type, awaiting_client_decision, created_at in rows:
        conn.execute(
            f"""
            INSERT INTO app.conversations (
              id, client_id, model_id, state, state_before_escalation, flow_type,
              handoff_status, last_handoff_at, last_message_at, awaiting_input_type,
              awaiting_client_decision, created_at
            ) VALUES (
              %(id)s, %(client_id)s, %(model_id)s, %(state)s, %(state_before)s,
              %(flow_type)s, %(handoff_status)s, {last_handoff_at or 'NULL'},
              {last_message_at or 'NULL'}, %(awaiting_input_type)s,
              %(awaiting_client_decision)s, {created_at}
            )
            """,
            {
                "id": conversation_id,
                "client_id": f"21000000-0000-0000-0000-0000000000b{client_index}",
                "model_id": model_id,
                "state": state,
                "state_before": state_before,
                "flow_type": flow_type,
                "handoff_status": handoff_status,
                "awaiting_input_type": awaiting_input_type,
                "awaiting_client_decision": awaiting_client_decision,
            },
        )

    conn.execute(
        """
        INSERT INTO app.handoff_events (
          conversation_id, event_type, previous_handoff_status, source, actor_label, created_at
        ) VALUES
          (%(open_old)s, 'handoff_opened', 'NONE', 'system', 'test', now() - interval '4 hours'),
          (%(open_new)s, 'handoff_opened', 'NONE', 'system', 'test', now() - interval '30 minutes'),
          (%(ack)s, 'handoff_opened', 'NONE', 'system', 'test', now() - interval '3 hours'),
          (%(ack)s, 'handoff_acknowledged', 'OPENED', 'operator_ui', 'operator', now() - interval '1 hour')
        """,
        ids,
    )
    conn.execute(
        """
        INSERT INTO app.messages (
          conversation_id, client_id, direction, role, message_type, content_text,
          from_me, provider_message_at
        ) VALUES
          (%(client_waiting)s, '21000000-0000-0000-0000-0000000000b4', 'OUTBOUND', 'agent', 'text', 'resposta antiga', false, now() - interval '80 minutes'),
          (%(client_waiting)s, '21000000-0000-0000-0000-0000000000b4', 'INBOUND', 'client', 'text', 'cliente voltou', false, now() - interval '70 minutes'),
          (%(responded)s, '21000000-0000-0000-0000-0000000000b5', 'INBOUND', 'client', 'text', 'pergunta antiga', false, now() - interval '90 minutes'),
          (%(responded)s, '21000000-0000-0000-0000-0000000000b5', 'OUTBOUND', 'agent', 'text', 'resposta recente', false, now() - interval '10 minutes')
        """,
        ids,
    )
    return ids


def _insert_receipts_fixture(conn: Any) -> dict[str, str]:
    model_id = "10000000-0000-0000-0000-0000000000ee"
    conn.execute(
        """
        INSERT INTO app.models (id, display_name, is_active)
        VALUES (%(model_id)s, 'Modelo Receipt Fixture', true)
        """,
        {"model_id": model_id},
    )
    clients = [
        ("24000000-0000-0000-0000-0000000000e1", "5521555555501@s.whatsapp.net", "Cliente Receipt 1"),
        ("24000000-0000-0000-0000-0000000000e2", "5521555555502@s.whatsapp.net", "Cliente Receipt 2"),
    ]
    for client_id, jid, name in clients:
        conn.execute(
            """
            INSERT INTO app.clients (id, whatsapp_jid, display_name)
            VALUES (%(id)s, %(jid)s, %(name)s)
            """,
            {"id": client_id, "jid": jid, "name": name},
        )

    ids = {
        "conversation_1": "34000000-0000-0000-0000-0000000000e1",
        "conversation_2": "34000000-0000-0000-0000-0000000000e2",
        "message_1": "35000000-0000-0000-0000-0000000000e1",
        "message_2": "35000000-0000-0000-0000-0000000000e2",
        "message_3": "35000000-0000-0000-0000-0000000000e3",
        "receipt_pending": "36000000-0000-0000-0000-0000000000e1",
        "receipt_uncertain": "36000000-0000-0000-0000-0000000000e2",
        "receipt_review": "36000000-0000-0000-0000-0000000000e3",
    }
    conn.execute(
        """
        INSERT INTO app.conversations (id, client_id, model_id, state, flow_type, handoff_status)
        VALUES
          (%(conversation_1)s, '24000000-0000-0000-0000-0000000000e1', %(model_id)s, 'NEGOCIANDO', 'EXTERNAL', 'NONE'),
          (%(conversation_2)s, '24000000-0000-0000-0000-0000000000e2', %(model_id)s, 'NEGOCIANDO', 'EXTERNAL', 'NONE')
        """,
        {**ids, "model_id": model_id},
    )
    conn.execute(
        """
        INSERT INTO app.messages (
          id, conversation_id, client_id, direction, role, message_type, content_text
        ) VALUES
          (%(message_1)s, %(conversation_1)s, '24000000-0000-0000-0000-0000000000e1', 'INBOUND', 'client', 'image', '[comprovante]'),
          (%(message_2)s, %(conversation_2)s, '24000000-0000-0000-0000-0000000000e2', 'INBOUND', 'client', 'image', '[comprovante]'),
          (%(message_3)s, %(conversation_2)s, '24000000-0000-0000-0000-0000000000e2', 'INBOUND', 'client', 'image', '[comprovante]')
        """,
        ids,
    )
    conn.execute(
        """
        INSERT INTO app.receipts (
          id, conversation_id, client_id, message_id, storage_path,
          detected_amount, expected_amount, analysis_status, tolerance_applied,
          needs_review, created_at
        ) VALUES
          (%(receipt_pending)s, %(conversation_1)s, '24000000-0000-0000-0000-0000000000e1', %(message_1)s, 'receipt-pending.jpg', NULL, 750.00, 'PENDING', NULL, false, now() - interval '30 minutes'),
          (%(receipt_uncertain)s, %(conversation_2)s, '24000000-0000-0000-0000-0000000000e2', %(message_2)s, 'receipt-uncertain.jpg', 720.00, 750.00, 'UNCERTAIN', 10.00, true, now() - interval '20 minutes'),
          (%(receipt_review)s, %(conversation_2)s, '24000000-0000-0000-0000-0000000000e2', %(message_3)s, 'receipt-review.jpg', 700.00, 750.00, 'NEEDS_REVIEW', 10.00, true, now() - interval '10 minutes')
        """,
        ids,
    )
    return ids


def _insert_dashboard_financial_fixture(conn: Any) -> None:
    """Seeds conversations with expected_amount and receipts for financial aggregates."""
    model_id = "10000000-0000-0000-0000-0000000000ff"
    conn.execute(
        """
        INSERT INTO app.models (id, display_name, is_active)
        VALUES (%(model_id)s, 'Modelo Financial Fixture', true)
        """,
        {"model_id": model_id},
    )
    clients = [
        ("25000000-0000-0000-0000-0000000000f1", "5521544444441@s.whatsapp.net", "Cliente Fin 1"),
        ("25000000-0000-0000-0000-0000000000f2", "5521544444442@s.whatsapp.net", "Cliente Fin 2"),
        ("25000000-0000-0000-0000-0000000000f3", "5521544444443@s.whatsapp.net", "Cliente Fin 3"),
        ("25000000-0000-0000-0000-0000000000f4", "5521544444444@s.whatsapp.net", "Cliente Fin 4"),
    ]
    for client_id, jid, name in clients:
        conn.execute(
            """
            INSERT INTO app.clients (id, whatsapp_jid, display_name)
            VALUES (%(id)s, %(jid)s, %(name)s)
            """,
            {"id": client_id, "jid": jid, "name": name},
        )

    # Three open-pipeline conversations with expected_amount (in last 7d) and
    # one CONFIRMADO with expected_amount (should not contribute to open_pipeline).
    conversations = [
        (
            "37000000-0000-0000-0000-0000000000f1",
            "25000000-0000-0000-0000-0000000000f1",
            "NOVO",
            "100.00",
            "now() - interval '1 day'",
        ),
        (
            "37000000-0000-0000-0000-0000000000f2",
            "25000000-0000-0000-0000-0000000000f2",
            "QUALIFICANDO",
            "500.00",
            "now() - interval '2 days'",
        ),
        (
            "37000000-0000-0000-0000-0000000000f3",
            "25000000-0000-0000-0000-0000000000f3",
            "NEGOCIANDO",
            "1000.00",
            "now() - interval '3 days'",
        ),
        (
            "37000000-0000-0000-0000-0000000000f4",
            "25000000-0000-0000-0000-0000000000f4",
            "CONFIRMADO",
            "3000.00",
            "now() - interval '4 days'",
        ),
    ]
    for conversation_id, client_id, state, expected_amount, created_at in conversations:
        conn.execute(
            f"""
            INSERT INTO app.conversations (
              id, client_id, model_id, state, flow_type, handoff_status,
              expected_amount, created_at
            ) VALUES (
              %(id)s, %(client_id)s, %(model_id)s, %(state)s, 'INTERNAL', 'NONE',
              %(expected_amount)s, {created_at}
            )
            """,
            {
                "id": conversation_id,
                "client_id": client_id,
                "model_id": model_id,
                "state": state,
                "expected_amount": expected_amount,
            },
        )

    # Messages required by the receipts foreign key.
    conn.execute(
        """
        INSERT INTO app.messages (
          id, conversation_id, client_id, direction, role, message_type, content_text
        ) VALUES
          (
            '38000000-0000-0000-0000-0000000000f1',
            '37000000-0000-0000-0000-0000000000f1',
            '25000000-0000-0000-0000-0000000000f1',
            'INBOUND', 'client', 'image', '[comprovante 1]'
          ),
          (
            '38000000-0000-0000-0000-0000000000f2',
            '37000000-0000-0000-0000-0000000000f2',
            '25000000-0000-0000-0000-0000000000f2',
            'INBOUND', 'client', 'image', '[comprovante 2]'
          ),
          (
            '38000000-0000-0000-0000-0000000000f3',
            '37000000-0000-0000-0000-0000000000f3',
            '25000000-0000-0000-0000-0000000000f3',
            'INBOUND', 'client', 'image', '[comprovante 3]'
          ),
          (
            '38000000-0000-0000-0000-0000000000f4',
            '37000000-0000-0000-0000-0000000000f4',
            '25000000-0000-0000-0000-0000000000f4',
            'INBOUND', 'client', 'image', '[comprovante 4]'
          )
        """
    )

    # Receipts inside last 7d:
    #   VALID 200 vs expected 250 (contributes to detected_total and divergence)
    #   INVALID 900 vs expected 1000 (contributes to divergence only)
    #   NULL detected / NULL expected (should be ignored in divergence)
    # One UNCERTAIN outside the window (should be ignored everywhere in the 7d aggregates).
    conn.execute(
        """
        INSERT INTO app.receipts (
          id, conversation_id, client_id, message_id, storage_path,
          detected_amount, expected_amount, analysis_status, tolerance_applied,
          needs_review, created_at
        ) VALUES
          (
            '39000000-0000-0000-0000-0000000000f1',
            '37000000-0000-0000-0000-0000000000f1',
            '25000000-0000-0000-0000-0000000000f1',
            '38000000-0000-0000-0000-0000000000f1',
            'receipt-valid.jpg', 200.00, 250.00, 'VALID', 10.00, false,
            now() - interval '2 days'
          ),
          (
            '39000000-0000-0000-0000-0000000000f2',
            '37000000-0000-0000-0000-0000000000f2',
            '25000000-0000-0000-0000-0000000000f2',
            '38000000-0000-0000-0000-0000000000f2',
            'receipt-invalid.jpg', 900.00, 1000.00, 'INVALID', NULL, true,
            now() - interval '3 days'
          ),
          (
            '39000000-0000-0000-0000-0000000000f3',
            '37000000-0000-0000-0000-0000000000f3',
            '25000000-0000-0000-0000-0000000000f3',
            '38000000-0000-0000-0000-0000000000f3',
            'receipt-partial.jpg', NULL, 500.00, 'PENDING', NULL, true,
            now() - interval '1 day'
          ),
          (
            '39000000-0000-0000-0000-0000000000f4',
            '37000000-0000-0000-0000-0000000000f4',
            '25000000-0000-0000-0000-0000000000f4',
            '38000000-0000-0000-0000-0000000000f4',
            'receipt-outside.jpg', 1500.00, 1500.00, 'UNCERTAIN', NULL, false,
            now() - interval '10 days'
          )
        """
    )


def _insert_dashboard_growth_fixture(conn: Any) -> None:
    """Seeds conversations covering 14d pipeline window + 12 terminal conversations in 30d."""
    model_id = "10000000-0000-0000-0000-0000000000ab"
    conn.execute(
        """
        INSERT INTO app.models (id, display_name, is_active)
        VALUES (%(model_id)s, 'Modelo Growth Fixture', true)
        """,
        {"model_id": model_id},
    )

    # Pipeline growth: one NOVO in previous window (7-14d ago, 1000)
    #                  two NOVO in current window (last 7d, 400 + 800 = 1200).
    growth_conversations = [
        ("41000000-0000-0000-0000-0000000000a1", "NOVO", "1000.00", "now() - interval '10 days'"),
        ("41000000-0000-0000-0000-0000000000a2", "NOVO", "400.00", "now() - interval '2 days'"),
        ("41000000-0000-0000-0000-0000000000a3", "NOVO", "800.00", "now() - interval '1 day'"),
    ]
    for idx, (conversation_id, state, amount, created_at) in enumerate(growth_conversations, start=1):
        client_id = f"28000000-0000-0000-0000-0000000000a{idx}"
        conn.execute(
            """
            INSERT INTO app.clients (id, whatsapp_jid, display_name)
            VALUES (%(id)s, %(jid)s, %(name)s)
            """,
            {
                "id": client_id,
                "jid": f"5521566666660{idx}@s.whatsapp.net",
                "name": f"Cliente Growth {idx}",
            },
        )
        conn.execute(
            f"""
            INSERT INTO app.conversations (
              id, client_id, model_id, state, flow_type, handoff_status,
              expected_amount, created_at
            ) VALUES (
              %(id)s, %(client_id)s, %(model_id)s, %(state)s, 'INTERNAL', 'NONE',
              %(expected_amount)s, {created_at}
            )
            """,
            {
                "id": conversation_id,
                "client_id": client_id,
                "model_id": model_id,
                "state": state,
                "expected_amount": amount,
            },
        )

    # Conversion rate: 6 CONFIRMADO + 6 ESCALADO within last 30d (50% rate).
    terminal_states = ["CONFIRMADO"] * 6 + ["ESCALADO"] * 6
    for idx, state in enumerate(terminal_states, start=1):
        # Use hex digit suffixes (1..c) to keep the UUIDs valid.
        suffix = format(idx, "x")
        conversation_id = f"42000000-0000-0000-0000-0000000000b{suffix}"
        client_id = f"29000000-0000-0000-0000-0000000000b{suffix}"
        conn.execute(
            """
            INSERT INTO app.clients (id, whatsapp_jid, display_name)
            VALUES (%(id)s, %(jid)s, %(name)s)
            """,
            {
                "id": client_id,
                "jid": f"5521577777770{idx:02d}@s.whatsapp.net",
                "name": f"Cliente Terminal {idx}",
            },
        )
        conn.execute(
            """
            INSERT INTO app.conversations (
              id, client_id, model_id, state, flow_type, handoff_status, created_at
            ) VALUES (
              %(id)s, %(client_id)s, %(model_id)s, %(state)s, 'INTERNAL', 'NONE',
              now() - interval '15 days'
            )
            """,
            {
                "id": conversation_id,
                "client_id": client_id,
                "model_id": model_id,
                "state": state,
            },
        )


@pytest.fixture()
def without_active_model() -> Iterator[None]:
    with connect() as conn:
        row = conn.execute("SELECT id FROM app.models WHERE is_active = true").fetchone()
        active_model_id = row["id"] if row else SEED_MODEL_ID
        conn.execute("UPDATE app.models SET is_active = false WHERE is_active = true")
    try:
        yield
    finally:
        with connect() as conn:
            conn.execute("UPDATE app.models SET is_active = false WHERE is_active = true")
            conn.execute(
                "UPDATE app.models SET is_active = true WHERE id = %(id)s",
                {"id": active_model_id},
            )


class TestActiveModelRead:
    def test_active_model_matches_contract_and_seed(self, client, api_headers, seed_model_id):
        response = client.get("/api/models/active", headers=api_headers)
        assert response.status_code == 200, response.text
        model = ModelRead.model_validate(response.json())
        assert model.id == seed_model_id
        assert model.display_name == "Modelo em cadastro"
        assert model.is_active is True
        assert model.persona_json["fixture_only"] is True
        assert model.services_json["fixture_only"] is True
        assert model.pricing_json["fixture_only"] is True
        assert model.languages == []
        assert model.calendar_external_id is None

    def test_active_model_requires_operator_api_key(self, client):
        response = client.get("/api/models/active")
        assert response.status_code == 401

    def test_active_model_returns_404_when_missing(self, client, api_headers, without_active_model):
        response = client.get("/api/models/active", headers=api_headers)
        assert response.status_code == 404
        assert response.json()["detail"] == "active model not found"


class TestDashboardSummaryRead:
    def test_summary_matches_contract_with_empty_database(self, isolated_dashboard_db, api_headers):
        test_client, _conn = isolated_dashboard_db
        response = test_client.get("/api/dashboard/summary", headers=api_headers)
        assert response.status_code == 200, response.text

        summary = DashboardSummaryRead.model_validate(response.json())
        assert summary.requested_window == "24h"
        assert summary.windows["requested"].label == "24h"
        assert summary.windows["requested"].starts_at is not None
        assert summary.windows["requested"].ends_at is not None
        assert summary.windows["today"].starts_at is not None
        assert summary.windows["next_14_days"].ends_at is not None

        assert summary.total_conversations.value == 0
        assert summary.active_conversations.value == 0
        assert summary.new_conversations_today.value == 0
        assert summary.handoffs_opened.value == 0
        assert summary.handoffs_acknowledged.value == 0
        assert summary.media_pending.value == 0
        assert summary.media_without_category.value == 0
        assert summary.schedule_slots_next_14d_total.value == 0
        assert summary.calendar_sync_pending.value == 0
        assert summary.calendar_sync_error.value == 0
        assert summary.ready_for_human_count.value == 0
        assert summary.awaiting_client_decision_count.value == 0
        assert summary.stalled_conversations_count.value == 0
        assert summary.hot_leads_count.value == 0
        assert summary.response_rate.value == 0
        assert summary.qualification_rate.value == 0
        assert summary.time_to_first_response.average_seconds is None
        assert summary.conversation_funnel.counts["PRONTO_PARA_HUMANO"] == 0
        assert summary.total_conversations.meta.sample_method == "full_aggregate"
        assert summary.total_conversations.meta.sample_size == 0
        assert set(summary.conversations_by_state.counts) == {
            "NOVO",
            "QUALIFICANDO",
            "NEGOCIANDO",
            "CONFIRMADO",
            "ESCALADO",
        }
        assert summary.financial.open_pipeline_total.value == Decimal("0")
        assert summary.financial.open_pipeline_total.meta.sample_size == 0
        assert set(summary.financial.open_pipeline_by_state.amounts) == {
            "NOVO",
            "QUALIFICANDO",
            "NEGOCIANDO",
        }
        assert all(
            amount == Decimal("0")
            for amount in summary.financial.open_pipeline_by_state.amounts.values()
        )
        assert summary.financial.avg_ticket_last_7d.value == Decimal("0")
        assert summary.financial.avg_ticket_last_7d.meta.sample_size == 0
        assert summary.financial.detected_total_last_7d.value == Decimal("0")
        assert summary.financial.detected_total_last_7d.meta.sample_size == 0
        assert summary.financial.divergence_abs_last_7d.value == Decimal("0")
        assert summary.financial.divergence_abs_last_7d.meta.sample_size == 0
        assert summary.financial.pipeline_growth.current_amount == Decimal("0")
        assert summary.financial.pipeline_growth.previous_amount == Decimal("0")
        assert summary.financial.pipeline_growth.delta_percent is None
        assert summary.financial.pipeline_growth.meta.sample_size == 0
        assert summary.financial.conversion_rate_last_30d.value_percent is None
        assert summary.financial.conversion_rate_last_30d.numerator == 0
        assert summary.financial.conversion_rate_last_30d.denominator == 0
        assert summary.financial.conversion_rate_last_30d.meta.sample_size == 0
        assert summary.financial.projected_revenue.value is None
        assert summary.financial.projected_revenue.minimum_sample_size == 10
        assert summary.financial.projected_revenue.meta.sample_size == 0

    def test_summary_aggregates_seeded_operational_data(self, isolated_dashboard_db, api_headers):
        test_client, conn = isolated_dashboard_db
        _insert_dashboard_summary_fixture(conn)

        response = test_client.get("/api/dashboard/summary", headers=api_headers)
        assert response.status_code == 200, response.text

        summary = DashboardSummaryRead.model_validate(response.json())
        assert summary.total_conversations.value == 4
        assert summary.active_conversations.value == 2
        assert summary.new_conversations_today.value == 2
        assert summary.conversations_by_state.counts["ESCALADO"] == 2
        assert summary.conversations_by_flow_type.counts["UNDETERMINED"] == 1
        assert summary.conversations_by_handoff_status.counts["OPENED"] == 1
        assert summary.conversations_by_handoff_status.counts["ACKNOWLEDGED"] == 1
        assert summary.handoffs_opened.value == 1
        assert summary.handoffs_acknowledged.value == 1
        assert summary.media_pending.value == 2
        assert summary.media_without_category.value == 2
        assert summary.schedule_slots_next_14d_total.value == 4
        assert summary.schedule_slots_next_14d_by_status.counts["BLOCKED"] == 1
        assert summary.schedule_slots_next_14d_by_status.counts["CONFIRMED"] == 1
        assert summary.schedule_slots_next_14d_by_status.counts["HELD"] == 1
        assert summary.schedule_slots_next_14d_by_status.counts["CANCELLED"] == 1
        assert summary.calendar_sync_pending.value == 1
        assert summary.calendar_sync_error.value == 1
        assert summary.ready_for_human_count.value == 1
        assert summary.awaiting_client_decision_count.value == 0
        assert summary.stalled_conversations_count.value == 0
        assert summary.hot_leads_count.value == 2
        assert summary.response_rate.value == 50
        assert summary.response_rate.meta.sample_size == 2
        assert summary.qualification_rate.value == 75
        assert summary.qualification_rate.meta.window == "last_7_days"
        assert summary.time_to_first_response.average_seconds == 1800
        assert summary.time_to_first_response.meta.sample_size == 1
        assert summary.conversation_funnel.counts["NOVO"] == 1
        assert summary.conversation_funnel.counts["QUALIFICANDO"] == 1
        assert summary.conversation_funnel.counts["PRONTO_PARA_HUMANO"] == 2
        assert summary.active_conversations.meta.source == "app.conversations.last_message_at"
        assert summary.active_conversations.meta.window == "requested"
        assert summary.active_conversations.meta.sample_size == 4

    def test_summary_rejects_unsupported_window(self, client, api_headers):
        response = client.get(
            "/api/dashboard/summary",
            headers=api_headers,
            params={"window": "7d"},
        )
        assert response.status_code == 422

    def test_summary_financial_aggregates_amounts_and_receipts(
        self, isolated_dashboard_db, api_headers
    ):
        test_client, conn = isolated_dashboard_db
        _insert_dashboard_financial_fixture(conn)

        response = test_client.get("/api/dashboard/summary", headers=api_headers)
        assert response.status_code == 200, response.text

        summary = DashboardSummaryRead.model_validate(response.json())
        financial = summary.financial

        assert financial.open_pipeline_total.value == Decimal("1600.00")
        assert financial.open_pipeline_by_state.amounts["NOVO"] == Decimal("100.00")
        assert financial.open_pipeline_by_state.amounts["QUALIFICANDO"] == Decimal("500.00")
        assert financial.open_pipeline_by_state.amounts["NEGOCIANDO"] == Decimal("1000.00")
        # CONFIRMADO and ESCALADO are excluded from the open pipeline totals.
        assert "CONFIRMADO" not in financial.open_pipeline_by_state.amounts
        assert "ESCALADO" not in financial.open_pipeline_by_state.amounts

        # Three conversations created in the last 7d had expected_amount set (100, 500, 1000).
        assert financial.avg_ticket_last_7d.value == Decimal("533.33")
        assert financial.avg_ticket_last_7d.meta.sample_size == 3

        # Only VALID receipts within 7d contribute to detected_total.
        # Fixture seeds one VALID (200.00), one INVALID (900.00) and one UNCERTAIN outside window.
        assert financial.detected_total_last_7d.value == Decimal("200.00")
        assert financial.detected_total_last_7d.meta.sample_size == 1

        # Divergence ignores rows with any of the two amounts NULL.
        # VALID: |200 - 250| = 50. INVALID: |900 - 1000| = 100. Sum = 150.
        assert financial.divergence_abs_last_7d.value == Decimal("150.00")
        assert financial.divergence_abs_last_7d.meta.sample_size == 2

        # All four seeded conversations were created within the last 7 days, so
        # the previous window (7-14d ago) is empty -> delta_percent is None.
        assert financial.pipeline_growth.current_amount == Decimal("4600.00")
        assert financial.pipeline_growth.previous_amount == Decimal("0")
        assert financial.pipeline_growth.delta_percent is None

        # One CONFIRMADO, zero ESCALADO -> 1/1 = 100%.
        assert financial.conversion_rate_last_30d.numerator == 1
        assert financial.conversion_rate_last_30d.denominator == 1
        assert financial.conversion_rate_last_30d.value_percent == 100

        # Terminal sample is below the 10-sample minimum, so forecast is null.
        assert financial.projected_revenue.value is None
        assert financial.projected_revenue.minimum_sample_size == 10
        assert financial.projected_revenue.meta.sample_size == 1

    def test_summary_pipeline_growth_and_forecast_with_sufficient_sample(
        self, isolated_dashboard_db, api_headers
    ):
        test_client, conn = isolated_dashboard_db
        _insert_dashboard_growth_fixture(conn)

        response = test_client.get("/api/dashboard/summary", headers=api_headers)
        assert response.status_code == 200, response.text

        summary = DashboardSummaryRead.model_validate(response.json())
        financial = summary.financial

        # Current window: two conversations with expected_amount summing to 1200.
        # Previous window (7-14d ago): one conversation with expected_amount 1000.
        # Delta: (1200 - 1000) / 1000 = 20%.
        assert financial.pipeline_growth.current_amount == Decimal("1200.00")
        assert financial.pipeline_growth.previous_amount == Decimal("1000.00")
        assert financial.pipeline_growth.delta_percent == 20

        # 12 terminal conversations (6 CONFIRMADO + 6 ESCALADO) -> rate 50%.
        assert financial.conversion_rate_last_30d.numerator == 6
        assert financial.conversion_rate_last_30d.denominator == 12
        assert financial.conversion_rate_last_30d.value_percent == 50

        # Forecast = open_pipeline_total * (6/12).
        # Seeded open pipeline (NOVO) = 800.00 -> forecast = 400.00.
        assert financial.projected_revenue.value == Decimal("400.00")
        assert financial.projected_revenue.meta.sample_size == 12


class TestDashboardHealthRead:
    def test_health_matches_contract_with_empty_database(self, isolated_dashboard_db, api_headers):
        test_client, _conn = isolated_dashboard_db
        response = test_client.get("/api/dashboard/health", headers=api_headers)
        assert response.status_code == 200, response.text

        health = DashboardHealthRead.model_validate(response.json())
        assert health.agent.status == "offline"
        assert health.whatsapp.status == "disconnected"
        assert health.calendar.status == "synced"
        assert health.model.status == "missing"

    def test_health_aggregates_agent_whatsapp_calendar_and_model(self, isolated_dashboard_db, api_headers):
        test_client, conn = isolated_dashboard_db
        _insert_dashboard_summary_fixture(conn)
        conn.execute(
            """
            INSERT INTO app.integration_status (
              provider, instance, status, qr_code_ref, last_event_at, metadata_json, updated_at
            ) VALUES (
              'evolution',
              'barra-vips-main',
              'CONNECTED',
              NULL,
              now() - interval '5 minutes',
              '{}'::jsonb,
              now()
            )
            """
        )
        conn.execute(
            """
            INSERT INTO logs.agent_executions (
              id, conversation_id, trace_id, status, duration_ms, tool_count,
              retry_count, fallback_used, error_summary, created_at
            ) VALUES
              (
                '60000000-0000-0000-0000-0000000000f1',
                '30000000-0000-0000-0000-0000000000a1',
                '70000000-0000-0000-0000-0000000000f1',
                'SUCCESS',
                1200,
                1,
                0,
                false,
                NULL,
                now() - interval '2 hours'
              ),
              (
                '60000000-0000-0000-0000-0000000000f2',
                '30000000-0000-0000-0000-0000000000a2',
                '70000000-0000-0000-0000-0000000000f2',
                'FAILED',
                2600,
                1,
                0,
                false,
                'falha de teste',
                now() - interval '1 hour'
              )
            """
        )

        response = test_client.get("/api/dashboard/health", headers=api_headers)
        assert response.status_code == 200, response.text

        health = DashboardHealthRead.model_validate(response.json())
        assert health.agent.status == "degraded"
        assert health.whatsapp.status == "connected"
        assert health.calendar.status == "error"
        assert health.model.status == "pending"


class TestMediaUsageSummaryRead:
    def test_usage_summary_counts_messages_with_media_id_only(self, isolated_dashboard_db, api_headers):
        test_client, conn = isolated_dashboard_db
        _insert_dashboard_summary_fixture(conn)

        conn.execute(
            """
            INSERT INTO app.messages (
              conversation_id, client_id, direction, role, message_type,
              content_text, media_id, delivery_status, provider_message_at
            ) VALUES
              (
                '30000000-0000-0000-0000-0000000000a1',
                '20000000-0000-0000-0000-0000000000a1',
                'OUTBOUND',
                'agent',
                'image',
                'midia enviada',
                '40000000-0000-0000-0000-0000000000a1',
                'SENT',
                now() - interval '1 day'
              ),
              (
                '30000000-0000-0000-0000-0000000000a1',
                '20000000-0000-0000-0000-0000000000a1',
                'OUTBOUND',
                'agent',
                'image',
                'midia enviada de novo',
                '40000000-0000-0000-0000-0000000000a1',
                'FAILED',
                now() - interval '2 days'
              ),
              (
                '30000000-0000-0000-0000-0000000000a2',
                '20000000-0000-0000-0000-0000000000a2',
                'OUTBOUND',
                'agent',
                'video',
                'outra midia',
                '40000000-0000-0000-0000-0000000000a2',
                'DELIVERED',
                now() - interval '3 days'
              ),
              (
                '30000000-0000-0000-0000-0000000000a2',
                '20000000-0000-0000-0000-0000000000a2',
                'OUTBOUND',
                'agent',
                'text',
                'sem media_id',
                NULL,
                'FAILED',
                now() - interval '1 day'
              ),
              (
                '30000000-0000-0000-0000-0000000000a3',
                '20000000-0000-0000-0000-0000000000a3',
                'OUTBOUND',
                'agent',
                'image',
                'fora da janela',
                '40000000-0000-0000-0000-0000000000a3',
                'FAILED',
                now() - interval '8 days'
              )
            """
        )

        response = test_client.get("/api/media/usage-summary", headers=api_headers)
        assert response.status_code == 200, response.text

        summary = MediaUsageSummaryRead.model_validate(response.json())
        assert summary.requested_window == "7d"
        assert summary.pending.value == 2
        assert summary.without_category.value == 2
        assert summary.approved_by_category.counts == {"SEM_CATEGORIA": 1}
        assert summary.most_used.meta.source == "app.messages.media_id + app.messages.provider_message_at/created_at"
        assert summary.most_used.meta.window == "requested"
        assert summary.most_used.meta.sample_size == 3
        assert summary.most_used.items[0].media_id.hex == "400000000000000000000000000000a1"
        assert summary.most_used.items[0].count == 2
        assert summary.send_failures.meta.sample_size == 3
        assert summary.delivery_status_available is True
        assert len(summary.send_failures.items) == 1
        assert summary.send_failures.items[0].media_id.hex == "400000000000000000000000000000a1"
        assert summary.send_failures.items[0].count == 1
        assert summary.send_failures.items[0].drilldown_href == (
            "/midias#media-40000000-0000-0000-0000-0000000000a1"
        )

    def test_usage_summary_handles_missing_delivery_status_sample(
        self, isolated_dashboard_db, api_headers
    ):
        test_client, conn = isolated_dashboard_db
        _insert_dashboard_summary_fixture(conn)
        conn.execute(
            """
            INSERT INTO app.messages (
              conversation_id, client_id, direction, role, message_type,
              content_text, media_id, provider_message_at
            ) VALUES
              (
                '30000000-0000-0000-0000-0000000000a1',
                '20000000-0000-0000-0000-0000000000a1',
                'OUTBOUND',
                'agent',
                'image',
                'midia sem status',
                '40000000-0000-0000-0000-0000000000a1',
                now() - interval '1 day'
              ),
              (
                '30000000-0000-0000-0000-0000000000a2',
                '20000000-0000-0000-0000-0000000000a2',
                'OUTBOUND',
                'agent',
                'text',
                'mensagem sem media_id',
                NULL,
                now() - interval '1 day'
              )
            """
        )

        response = test_client.get("/api/media/usage-summary", headers=api_headers)
        assert response.status_code == 200, response.text

        summary = MediaUsageSummaryRead.model_validate(response.json())
        assert summary.most_used.meta.sample_size == 1
        assert summary.delivery_status_available is False
        assert summary.send_failures.meta.sample_size == 0
        assert summary.send_failures.items == []

    def test_usage_summary_rejects_unsupported_window(self, client, api_headers):
        response = client.get(
            "/api/media/usage-summary",
            headers=api_headers,
            params={"window": "24h"},
        )
        assert response.status_code == 422


def _insert_handoff_summary_fixture(conn: Any) -> None:
    model_id = "10000000-0000-0000-0000-0000000000cc"
    conn.execute(
        """
        INSERT INTO app.models (id, display_name, is_active)
        VALUES (%(model_id)s, 'Modelo Handoff Summary Fixture', true)
        """,
        {"model_id": model_id},
    )
    for index in range(1, 5):
        conn.execute(
            """
            INSERT INTO app.clients (id, whatsapp_jid, display_name)
            VALUES (%(id)s, %(jid)s, %(name)s)
            """,
            {
                "id": f"22000000-0000-0000-0000-0000000000c{index}",
                "jid": f"552177777770{index}@s.whatsapp.net",
                "name": f"Cliente Handoff {index}",
            },
        )
    rows = [
        (
            "32000000-0000-0000-0000-0000000000c1",
            1,
            "ESCALADO",
            "NEGOCIANDO",
            "EXTERNAL",
            "OPENED",
            "now() - interval '2 hours'",
        ),
        (
            "32000000-0000-0000-0000-0000000000c2",
            2,
            "ESCALADO",
            "CONFIRMADO",
            "INTERNAL",
            "ACKNOWLEDGED",
            "now() - interval '3 hours'",
        ),
        (
            "32000000-0000-0000-0000-0000000000c3",
            3,
            "NEGOCIANDO",
            None,
            "INTERNAL",
            "RELEASED",
            "now() - interval '4 days'",
        ),
        (
            "32000000-0000-0000-0000-0000000000c4",
            4,
            "NOVO",
            None,
            "UNDETERMINED",
            "NONE",
            "NULL",
        ),
    ]
    for conversation_id, client_index, state, state_before, flow_type, handoff_status, last_handoff_at in rows:
        conn.execute(
            f"""
            INSERT INTO app.conversations (
              id, client_id, model_id, state, state_before_escalation, flow_type,
              handoff_status, last_handoff_at, created_at
            ) VALUES (
              %(id)s, %(client_id)s, %(model_id)s, %(state)s, %(state_before)s,
              %(flow_type)s, %(handoff_status)s, {last_handoff_at}, now() - interval '5 days'
            )
            """,
            {
                "id": conversation_id,
                "client_id": f"22000000-0000-0000-0000-0000000000c{client_index}",
                "model_id": model_id,
                "state": state,
                "state_before": state_before,
                "flow_type": flow_type,
                "handoff_status": handoff_status,
            },
        )

    conn.execute(
        """
        INSERT INTO app.handoff_events (
          conversation_id, event_type, previous_handoff_status, source, actor_label,
          reason, created_at
        ) VALUES
          (
            '32000000-0000-0000-0000-0000000000c1',
            'handoff_opened',
            'NONE',
            'agent',
            'agent',
            'external_flow',
            now() - interval '2 hours'
          ),
          (
            '32000000-0000-0000-0000-0000000000c2',
            'handoff_opened',
            'NONE',
            'system',
            'test',
            NULL,
            now() - interval '3 hours'
          ),
          (
            '32000000-0000-0000-0000-0000000000c2',
            'handoff_acknowledged',
            'OPENED',
            'operator_ui',
            'operator',
            NULL,
            now() - interval '1 hour'
          ),
          (
            '32000000-0000-0000-0000-0000000000c3',
            'handoff_opened',
            'NONE',
            'agent',
            'agent',
            '',
            now() - interval '4 days'
          ),
          (
            '32000000-0000-0000-0000-0000000000c3',
            'handoff_released',
            'ACKNOWLEDGED',
            'operator_ui',
            'operator',
            NULL,
            now() - interval '4 days' + interval '1 hour'
          )
        """
    )


class TestHandoffSummaryRead:
    def test_summary_matches_contract_with_empty_database(self, isolated_dashboard_db, api_headers):
        test_client, _conn = isolated_dashboard_db
        response = test_client.get("/api/handoffs/summary", headers=api_headers)
        assert response.status_code == 200, response.text

        payload = response.json()
        summary = HandoffSummaryRead.model_validate(payload)
        assert "escalation_rate" not in payload
        assert summary.requested_window == "7d"
        assert summary.current_by_status.counts["OPENED"] == 0
        assert summary.current_by_status.counts["ACKNOWLEDGED"] == 0
        assert summary.current_by_status.counts["RELEASED"] == 0
        assert summary.open_age_buckets.meta.sample_size == 0
        assert summary.reasons.counts == {}
        assert summary.time_to_acknowledge is None
        assert summary.time_to_release is None

    def test_summary_aggregates_handoff_events_and_matches_listing(
        self,
        isolated_dashboard_db,
        api_headers,
    ):
        test_client, conn = isolated_dashboard_db
        _insert_handoff_summary_fixture(conn)

        response = test_client.get("/api/handoffs/summary", headers=api_headers)
        assert response.status_code == 200, response.text

        summary = HandoffSummaryRead.model_validate(response.json())
        assert summary.current_by_status.counts["OPENED"] == 1
        assert summary.current_by_status.counts["ACKNOWLEDGED"] == 1
        assert summary.current_by_status.counts["RELEASED"] == 1
        assert summary.open_age_buckets.counts["1-4h"] == 2
        assert summary.open_age_buckets.meta.sample_size == 2
        assert summary.reasons.counts["external_flow"] == 1
        assert summary.reasons.counts["SEM_MOTIVO"] == 2
        assert summary.reasons.meta.source == "app.handoff_events.reason"
        assert summary.reasons.meta.window == "requested"
        assert summary.time_to_acknowledge is not None
        assert summary.time_to_acknowledge.average_seconds == 7200
        assert summary.time_to_release is not None
        assert summary.time_to_release.average_seconds == 3600

        opened = test_client.get(
            "/api/conversations",
            headers=api_headers,
            params={"handoff_status": "OPENED"},
        )
        acknowledged = test_client.get(
            "/api/conversations",
            headers=api_headers,
            params={"handoff_status": "ACKNOWLEDGED"},
        )
        assert opened.status_code == 200
        assert acknowledged.status_code == 200
        assert opened.json()["total"] == summary.current_by_status.counts["OPENED"]
        assert acknowledged.json()["total"] == summary.current_by_status.counts["ACKNOWLEDGED"]

    def test_summary_rejects_unsupported_window(self, client, api_headers):
        response = client.get(
            "/api/handoffs/summary",
            headers=api_headers,
            params={"window": "24h"},
        )
        assert response.status_code == 422


class TestDashboardQueuesRead:
    def test_queues_match_contract_with_empty_database(self, isolated_dashboard_db, api_headers):
        test_client, _conn = isolated_dashboard_db
        response = test_client.get("/api/dashboard/queues", headers=api_headers)
        assert response.status_code == 200, response.text

        envelope = QUEUE_LIST_ADAPTER.validate_python(response.json())
        assert envelope.total == 0
        assert envelope.items == []

    def test_queues_apply_filters_and_reliable_ordering(self, isolated_dashboard_db, api_headers):
        test_client, conn = isolated_dashboard_db
        ids = _insert_dashboard_queue_fixture(conn)

        response = test_client.get(
            "/api/dashboard/queues",
            headers=api_headers,
            params={"page_size": 100},
        )
        assert response.status_code == 200, response.text

        envelope = QUEUE_LIST_ADAPTER.validate_python(response.json())
        items = envelope.items
        keys = [item.queue_key for item in items]
        assert "OPEN_HANDOFF" in keys
        assert "ACKNOWLEDGED_HANDOFF" in keys
        assert "CLIENT_WAITING_RESPONSE" in keys
        assert "STALE_CONVERSATION" in keys
        assert "UNDETERMINED_AGED" in keys
        assert "NEGOTIATING_AWAITING_INPUT" in keys
        assert "AWAITING_CLIENT_DECISION" in keys
        assert "EXTERNAL_OPEN_HANDOFF" in keys

        opened = [item for item in items if item.queue_key == "OPEN_HANDOFF"]
        assert [str(item.conversation_id) for item in opened] == [ids["open_old"], ids["open_new"]]
        assert opened[0].age_source == "app.handoff_events.created_at"
        assert opened[0].drilldown_href == f"/conversas/{ids['open_old']}"
        assert opened[0].next_best_action is not None
        assert opened[0].sample_size == 9

        waiting = [item for item in items if item.queue_key == "CLIENT_WAITING_RESPONSE"]
        assert [str(item.conversation_id) for item in waiting] == [ids["client_waiting"]]
        assert ids["responded"] not in {str(item.conversation_id) for item in waiting}

        undetermined = [item for item in items if item.queue_key == "UNDETERMINED_AGED"]
        assert [str(item.conversation_id) for item in undetermined] == [
            ids["undetermined_missing_last_message"]
        ]
        assert undetermined[0].age_source == "app.conversations.created_at"

    def test_queues_can_filter_by_queue_key(self, isolated_dashboard_db, api_headers):
        test_client, conn = isolated_dashboard_db
        ids = _insert_dashboard_queue_fixture(conn)

        response = test_client.get(
            "/api/dashboard/queues",
            headers=api_headers,
            params={"queue": "CLIENT_WAITING_RESPONSE"},
        )
        assert response.status_code == 200, response.text

        envelope = QUEUE_LIST_ADAPTER.validate_python(response.json())
        assert envelope.total == 1
        assert str(envelope.items[0].conversation_id) == ids["client_waiting"]

    def test_queues_reject_unknown_queue_filter(self, client, api_headers):
        response = client.get(
            "/api/dashboard/queues",
            headers=api_headers,
            params={"queue": "UNKNOWN_QUEUE"},
        )
        assert response.status_code == 422


class TestReceiptsRead:
    def test_receipts_empty_table_returns_empty_envelope(self, isolated_dashboard_db, api_headers):
        test_client, _conn = isolated_dashboard_db
        response = test_client.get("/api/receipts", headers=api_headers)
        assert response.status_code == 200, response.text

        envelope = RECEIPT_LIST_ADAPTER.validate_python(response.json())
        assert envelope.total == 0
        assert envelope.items == []

    def test_receipts_filter_by_needs_review_and_status(self, isolated_dashboard_db, api_headers):
        test_client, conn = isolated_dashboard_db
        ids = _insert_receipts_fixture(conn)

        needs_review = test_client.get(
            "/api/receipts",
            headers=api_headers,
            params={"needs_review": "true"},
        )
        assert needs_review.status_code == 200, needs_review.text
        needs_review_envelope = RECEIPT_LIST_ADAPTER.validate_python(needs_review.json())
        assert needs_review_envelope.total == 2
        assert {str(item.id) for item in needs_review_envelope.items} == {
            ids["receipt_uncertain"],
            ids["receipt_review"],
        }
        assert all(item.needs_review for item in needs_review_envelope.items)
        assert all(item.drilldown_href == f"/conversas/{item.conversation_id}" for item in needs_review_envelope.items)

        uncertain = test_client.get(
            "/api/receipts",
            headers=api_headers,
            params={"status": "UNCERTAIN"},
        )
        assert uncertain.status_code == 200, uncertain.text
        uncertain_envelope = RECEIPT_LIST_ADAPTER.validate_python(uncertain.json())
        assert uncertain_envelope.total == 1
        assert uncertain_envelope.items[0].analysis_status == "UNCERTAIN"
        assert uncertain_envelope.items[0].client.display_name == "Cliente Receipt 2"

        review = test_client.get(
            "/api/receipts",
            headers=api_headers,
            params={"needs_review": "true", "status": "NEEDS_REVIEW"},
        )
        assert review.status_code == 200, review.text
        review_envelope = RECEIPT_LIST_ADAPTER.validate_python(review.json())
        assert review_envelope.total == 1
        assert str(review_envelope.items[0].id) == ids["receipt_review"]
        assert review_envelope.items[0].expected_amount == Decimal("750.00")


class TestConversationsListEnvelope:
    def test_envelope_matches_paginated_contract(self, client, api_headers):
        response = client.get("/api/conversations", headers=api_headers)
        assert response.status_code == 200, response.text
        envelope = CONVERSATION_LIST_ADAPTER.validate_python(response.json())
        assert envelope.page == 1
        assert envelope.page_size > 0
        assert envelope.total >= 1
        assert len(envelope.items) >= 1

    def test_list_carries_client_and_model_brief_without_n_plus_one(self, client, api_headers):
        response = client.get("/api/conversations", headers=api_headers)
        assert response.status_code == 200, response.text
        envelope = CONVERSATION_LIST_ADAPTER.validate_python(response.json())
        for item in envelope.items:
            # Lista operacional precisa entregar dados suficientes para a tela
            # sem que o frontend faca chamada adicional por conversa.
            assert item.client.id is not None
            assert item.client.whatsapp_jid
            assert item.model.id is not None
            assert item.model.display_name
            # Campos operacionais visiveis na lista
            assert item.state in {"NOVO", "QUALIFICANDO", "NEGOCIANDO", "CONFIRMADO", "ESCALADO"}
            assert item.flow_type in {"INTERNAL", "EXTERNAL", "UNDETERMINED"}
            assert item.handoff_status in {"NONE", "OPENED", "ACKNOWLEDGED", "RELEASED"}

    def test_list_and_detail_expose_persisted_rich_context(self, client, api_headers):
        with connect() as conn:
            conn.execute(
                """
                UPDATE app.clients cl
                SET client_status = 'VIP',
                    profile_summary = 'Cliente objetivo com preferencia por noite.',
                    language_hint = 'pt-BR'
                FROM app.conversations c
                WHERE c.client_id = cl.id AND c.id = %(id)s
                """,
                {"id": SEED_CONVERSATION_ID},
            )
            conn.execute(
                """
                UPDATE app.conversations
                SET summary = 'Cliente avaliando horario e valor combinados.',
                    awaiting_client_decision = true,
                    urgency_profile = 'IMMEDIATE',
                    expected_amount = 750.00,
                    last_handoff_at = now()
                WHERE id = %(id)s
                """,
                {"id": SEED_CONVERSATION_ID},
            )
        try:
            response = client.get("/api/conversations", headers=api_headers)
            assert response.status_code == 200, response.text
            envelope = CONVERSATION_LIST_ADAPTER.validate_python(response.json())
            item = next(item for item in envelope.items if item.id == SEED_CONVERSATION_ID)

            assert item.client.client_status == "VIP"
            assert item.client.profile_summary == "Cliente objetivo com preferencia por noite."
            assert item.client.language_hint == "pt-BR"
            assert item.summary == "Cliente avaliando horario e valor combinados."
            assert item.awaiting_client_decision is True
            assert item.urgency_profile == "IMMEDIATE"
            assert item.expected_amount == Decimal("750.00")
            assert item.last_handoff_at is not None

            detail_response = client.get(
                f"/api/conversations/{SEED_CONVERSATION_ID}",
                headers=api_headers,
            )
            assert detail_response.status_code == 200, detail_response.text
            detail = ConversationDetailRead.model_validate(detail_response.json())
            assert detail.conversation.client.client_status == "VIP"
            assert detail.conversation.summary == item.summary
            assert detail.conversation.expected_amount == Decimal("750.00")
        finally:
            with connect() as conn:
                conn.execute(
                    """
                    UPDATE app.clients cl
                    SET client_status = 'NEW',
                        profile_summary = 'Cadastro de exemplo para desenvolvimento. Sem dados reais.',
                        language_hint = NULL
                    FROM app.conversations c
                    WHERE c.client_id = cl.id AND c.id = %(id)s
                    """,
                    {"id": SEED_CONVERSATION_ID},
                )
                conn.execute(
                    """
                    UPDATE app.conversations
                    SET summary = 'Fixture de conversa vazia para validacao de leitura operacional.',
                        awaiting_client_decision = false,
                        urgency_profile = NULL,
                        expected_amount = NULL,
                        last_handoff_at = NULL
                    WHERE id = %(id)s
                    """,
                    {"id": SEED_CONVERSATION_ID},
                )

    def test_pagination_params_respected(self, client, api_headers):
        response = client.get(
            "/api/conversations",
            headers=api_headers,
            params={"page": 1, "page_size": 5},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["page"] == 1
        assert body["page_size"] == 5
        assert len(body["items"]) <= 5

    def test_unknown_filter_status_returns_empty_envelope(self, client, api_headers):
        response = client.get(
            "/api/conversations",
            headers=api_headers,
            params={"status": "ESTADO_INEXISTENTE"},
        )
        assert response.status_code == 200
        envelope = CONVERSATION_LIST_ADAPTER.validate_python(response.json())
        assert envelope.total == 0
        assert envelope.items == []


class TestConversationDetail:
    def test_detail_matches_contract(self, client, api_headers, seed_conversation_id):
        response = client.get(
            f"/api/conversations/{seed_conversation_id}",
            headers=api_headers,
        )
        assert response.status_code == 200, response.text
        detail = ConversationDetailRead.model_validate(response.json())
        assert detail.conversation.id == seed_conversation_id
        assert isinstance(detail.messages, list)
        assert isinstance(detail.handoff_events, list)
        assert isinstance(detail.media, list)

    def test_detail_returns_404_for_unknown_id(self, client, api_headers):
        unknown_id = "00000000-0000-0000-0000-000000009999"
        response = client.get(f"/api/conversations/{unknown_id}", headers=api_headers)
        assert response.status_code == 404


class TestScheduleSlotsEnvelope:
    def test_list_validates_against_contract(self, client, api_headers):
        response = client.get("/api/schedule/slots", headers=api_headers)
        assert response.status_code == 200, response.text
        body: dict[str, Any] = response.json()
        # Envelope canonico { items, total, page, page_size } com items validos.
        assert set(body.keys()) >= {"items", "total", "page", "page_size"}
        for item in body["items"]:
            ScheduleSlotRead.model_validate(item)


class TestEvolutionStatus:
    def test_status_matches_contract(self, client, api_headers):
        response = client.get("/api/status/evolution", headers=api_headers)
        assert response.status_code == 200, response.text
        EvolutionStatusRead.model_validate(response.json())


class TestAgentStatus:
    def test_status_matches_contract_with_empty_logs(self, isolated_dashboard_db, api_headers):
        test_client, _conn = isolated_dashboard_db
        response = test_client.get("/api/status/agent", headers=api_headers)
        assert response.status_code == 200, response.text

        summary = AgentOpsSummaryRead.model_validate(response.json())
        assert summary.requested_window == "24h"
        assert summary.windows["requested"].starts_at is not None
        assert summary.windows["requested"].ends_at is not None
        assert summary.total_executions.value == 0
        assert summary.executions_by_status.counts == {
            "SUCCESS": 0,
            "PARTIAL": 0,
            "FAILED": 0,
            "SKIPPED": 0,
        }
        assert summary.failed_or_partial.value == 0
        assert summary.duration.p50_ms is None
        assert summary.duration.p95_ms is None
        assert summary.duration.average_ms is None
        assert summary.duration.meta.sample_size == 0
        assert summary.fallback_used.value == 0
        assert summary.tool_failures.value == 0
        assert summary.latest_failures == []

    def test_status_aggregates_failures_and_duration_window(self, isolated_dashboard_db, api_headers):
        test_client, conn = isolated_dashboard_db
        model_id = "10000000-0000-0000-0000-0000000000dd"
        client_id = "23000000-0000-0000-0000-0000000000d1"
        conversation_id = "33000000-0000-0000-0000-0000000000d1"
        conn.execute(
            """
            INSERT INTO app.models (id, display_name, is_active)
            VALUES (%(model_id)s, 'Modelo Agent Status Fixture', true)
            """,
            {"model_id": model_id},
        )
        conn.execute(
            """
            INSERT INTO app.clients (id, whatsapp_jid, display_name)
            VALUES (%(client_id)s, '5521666666601@s.whatsapp.net', 'Cliente Agent Status')
            """,
            {"client_id": client_id},
        )
        conn.execute(
            """
            INSERT INTO app.conversations (id, client_id, model_id, state, flow_type, handoff_status)
            VALUES (%(conversation_id)s, %(client_id)s, %(model_id)s, 'NOVO', 'UNDETERMINED', 'NONE')
            """,
            {"conversation_id": conversation_id, "client_id": client_id, "model_id": model_id},
        )
        conn.execute(
            """
            INSERT INTO logs.agent_executions (
              id, conversation_id, trace_id, status, duration_ms, tool_count,
              retry_count, fallback_used, error_summary, created_at
            ) VALUES
              (
                '60000000-0000-0000-0000-0000000000d1',
                %(conversation_id)s,
                '70000000-0000-0000-0000-0000000000d1',
                'SUCCESS',
                1000,
                1,
                0,
                false,
                NULL,
                now() - interval '3 hours'
              ),
              (
                '60000000-0000-0000-0000-0000000000d2',
                %(conversation_id)s,
                '70000000-0000-0000-0000-0000000000d2',
                'FAILED',
                5000,
                2,
                1,
                true,
                'tool send failed',
                now() - interval '2 hours'
              ),
              (
                '60000000-0000-0000-0000-0000000000d3',
                %(conversation_id)s,
                '70000000-0000-0000-0000-0000000000d3',
                'PARTIAL',
                2000,
                0,
                2,
                true,
                'fallback degraded',
                now() - interval '1 hour'
              ),
              (
                '60000000-0000-0000-0000-0000000000d4',
                %(conversation_id)s,
                '70000000-0000-0000-0000-0000000000d4',
                'FAILED',
                9000,
                1,
                0,
                false,
                'old failure outside window',
                now() - interval '2 days'
              )
            """,
            {"conversation_id": conversation_id},
        )

        response = test_client.get("/api/status/agent", headers=api_headers)
        assert response.status_code == 200, response.text

        summary = AgentOpsSummaryRead.model_validate(response.json())
        assert summary.total_executions.value == 3
        assert summary.executions_by_status.counts["SUCCESS"] == 1
        assert summary.executions_by_status.counts["FAILED"] == 1
        assert summary.executions_by_status.counts["PARTIAL"] == 1
        assert summary.failed_or_partial.value == 2
        assert summary.fallback_used.value == 2
        assert summary.tool_failures.value == 1
        assert summary.duration.p50_ms == 2000
        assert summary.duration.p95_ms == 4700
        assert summary.duration.average_ms == 2667
        assert summary.duration.meta.source == "logs.agent_executions.duration_ms"
        assert summary.duration.meta.window == "requested"
        assert summary.duration.meta.sample_size == 3
        assert len(summary.latest_failures) == 2
        assert summary.latest_failures[0].status == "PARTIAL"
        assert summary.latest_failures[0].drilldown_href == f"/conversas/{conversation_id}"
        assert summary.latest_failures_meta.sample_size == 2

    def test_status_rejects_unsupported_window(self, client, api_headers):
        response = client.get(
            "/api/status/agent",
            headers=api_headers,
            params={"window": "7d"},
        )
        assert response.status_code == 422


class TestMediaListPagination:
    def test_envelope_keys_present(self, client, api_headers):
        response = client.get("/api/media", headers=api_headers)
        assert response.status_code == 200, response.text
        body = response.json()
        assert set(body.keys()) >= {"items", "total", "page", "page_size"}
        assert body["page"] == 1
        assert body["page_size"] > 0
