"""Integration tests for amount filters on conversations and receipts endpoints."""
from __future__ import annotations

from decimal import Decimal
from typing import Any, Iterator

import pytest
from fastapi.testclient import TestClient

from barra_vips_api.db import connect
from barra_vips_api.db import get_conn as api_get_conn


@pytest.fixture()
def isolated_amount_filter_db(app) -> Iterator[tuple[TestClient, Any]]:
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
          app.escorts
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


def _seed_conversations_with_amounts(conn: Any) -> None:
    model_id = "10000000-0000-0000-0000-00000000c001"
    conn.execute(
        """
        INSERT INTO app.escorts (id, display_name, is_active)
        VALUES (%(model_id)s, 'Modelo Amount Filter', true)
        """,
        {"model_id": model_id},
    )
    conversations = [
        # (client_suffix, jid_suffix, conversation_suffix, expected_amount)
        (1, "01", "01", "100.00"),
        (2, "02", "02", "500.00"),
        (3, "03", "03", "1000.00"),
        (4, "04", "04", None),
    ]
    for client_idx, jid_suffix, conversation_suffix, amount in conversations:
        client_id = f"26000000-0000-0000-0000-00000000c0{client_idx:02d}"
        conn.execute(
            """
            INSERT INTO app.clients (id, whatsapp_jid, display_name)
            VALUES (%(id)s, %(jid)s, %(name)s)
            """,
            {
                "id": client_id,
                "jid": f"5521500000{jid_suffix}@s.whatsapp.net",
                "name": f"Cliente Amount {client_idx}",
            },
        )
        conn.execute(
            """
            INSERT INTO app.conversations (
              id, client_id, model_id, state, flow_type, handoff_status, expected_amount
            ) VALUES (
              %(id)s, %(client_id)s, %(model_id)s, 'QUALIFICANDO', 'INTERNAL', 'NONE',
              %(expected_amount)s
            )
            """,
            {
                "id": f"3a000000-0000-0000-0000-00000000c0{conversation_suffix}",
                "client_id": client_id,
                "model_id": model_id,
                "expected_amount": amount,
            },
        )


def _seed_receipts_with_amounts(conn: Any) -> None:
    model_id = "10000000-0000-0000-0000-00000000d001"
    conn.execute(
        """
        INSERT INTO app.escorts (id, display_name, is_active)
        VALUES (%(model_id)s, 'Modelo Receipt Filter', true)
        """,
        {"model_id": model_id},
    )
    client_id = "27000000-0000-0000-0000-00000000d001"
    conn.execute(
        """
        INSERT INTO app.clients (id, whatsapp_jid, display_name)
        VALUES (%(id)s, '5521510000001@s.whatsapp.net', 'Cliente Recibo')
        """,
        {"id": client_id},
    )
    conversation_id = "3b000000-0000-0000-0000-00000000d001"
    conn.execute(
        """
        INSERT INTO app.conversations (id, client_id, model_id, state, flow_type, handoff_status)
        VALUES (%(id)s, %(client_id)s, %(model_id)s, 'NEGOCIANDO', 'INTERNAL', 'NONE')
        """,
        {"id": conversation_id, "client_id": client_id, "model_id": model_id},
    )
    receipts = [
        # (receipt_suffix, message_suffix, detected, expected)
        ("01", "01", "100.00", "800.00"),
        ("02", "02", "500.00", "500.00"),
        ("03", "03", "1500.00", "200.00"),
    ]
    for receipt_suffix, message_suffix, detected, expected in receipts:
        message_id = f"3c000000-0000-0000-0000-00000000d0{message_suffix}"
        conn.execute(
            """
            INSERT INTO app.messages (
              id, conversation_id, client_id, direction, role, message_type, content_text
            ) VALUES (
              %(id)s, %(conversation_id)s, %(client_id)s, 'INBOUND', 'client', 'image', '[comprovante]'
            )
            """,
            {
                "id": message_id,
                "conversation_id": conversation_id,
                "client_id": client_id,
            },
        )
        conn.execute(
            """
            INSERT INTO app.receipts (
              id, conversation_id, client_id, message_id, storage_path,
              detected_amount, expected_amount, analysis_status, needs_review
            ) VALUES (
              %(id)s, %(conversation_id)s, %(client_id)s, %(message_id)s,
              %(storage_path)s, %(detected)s, %(expected)s, 'VALID', false
            )
            """,
            {
                "id": f"3d000000-0000-0000-0000-00000000d0{receipt_suffix}",
                "conversation_id": conversation_id,
                "client_id": client_id,
                "message_id": message_id,
                "storage_path": f"receipt-{receipt_suffix}.jpg",
                "detected": detected,
                "expected": expected,
            },
        )


class TestConversationAmountFilters:
    def test_min_greater_than_max_returns_422(self, isolated_amount_filter_db, api_headers):
        test_client, _conn = isolated_amount_filter_db
        response = test_client.get(
            "/api/conversations",
            params={"min_amount": "500", "max_amount": "100"},
            headers=api_headers,
        )
        assert response.status_code == 422
        detail = response.json()["detail"]
        assert "min_amount" in detail if isinstance(detail, str) else detail

    def test_negative_min_amount_returns_422(self, isolated_amount_filter_db, api_headers):
        test_client, _conn = isolated_amount_filter_db
        response = test_client.get(
            "/api/conversations",
            params={"min_amount": "-5"},
            headers=api_headers,
        )
        assert response.status_code == 422

    def test_min_max_filter_applies(self, isolated_amount_filter_db, api_headers):
        test_client, conn = isolated_amount_filter_db
        _seed_conversations_with_amounts(conn)

        response = test_client.get(
            "/api/conversations",
            params={"min_amount": "200", "max_amount": "900"},
            headers=api_headers,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        amounts = {Decimal(item["expected_amount"]) for item in body["items"] if item.get("expected_amount") is not None}
        assert amounts == {Decimal("500.00")}

    def test_sort_amount_asc_places_nulls_last(self, isolated_amount_filter_db, api_headers):
        test_client, conn = isolated_amount_filter_db
        _seed_conversations_with_amounts(conn)

        response = test_client.get(
            "/api/conversations",
            params={"sort": "amount_asc", "page_size": "10"},
            headers=api_headers,
        )
        assert response.status_code == 200, response.text
        items = response.json()["items"]
        # Expect NULL amounts at the end.
        amounts = [item.get("expected_amount") for item in items]
        # Non-null amounts must be sorted ascending and come first.
        non_null = [Decimal(value) for value in amounts if value is not None]
        assert non_null == sorted(non_null)
        # If there's at least one NULL, it must be after the last non-null value.
        if any(value is None for value in amounts):
            last_non_null_idx = max(i for i, value in enumerate(amounts) if value is not None)
            first_null_idx = next(i for i, value in enumerate(amounts) if value is None)
            assert first_null_idx > last_non_null_idx

    def test_sort_amount_desc_places_nulls_last(self, isolated_amount_filter_db, api_headers):
        test_client, conn = isolated_amount_filter_db
        _seed_conversations_with_amounts(conn)

        response = test_client.get(
            "/api/conversations",
            params={"sort": "amount_desc", "page_size": "10"},
            headers=api_headers,
        )
        assert response.status_code == 200, response.text
        amounts = [item.get("expected_amount") for item in response.json()["items"]]
        non_null = [Decimal(value) for value in amounts if value is not None]
        assert non_null == sorted(non_null, reverse=True)


class TestReceiptAmountFilters:
    def test_min_greater_than_max_returns_422(self, isolated_amount_filter_db, api_headers):
        test_client, _conn = isolated_amount_filter_db
        response = test_client.get(
            "/api/receipts",
            params={"min_amount": "500", "max_amount": "100"},
            headers=api_headers,
        )
        assert response.status_code == 422

    def test_negative_min_amount_returns_422(self, isolated_amount_filter_db, api_headers):
        test_client, _conn = isolated_amount_filter_db
        response = test_client.get(
            "/api/receipts",
            params={"min_amount": "-1"},
            headers=api_headers,
        )
        assert response.status_code == 422

    def test_amount_field_detected_filters_detected_column(
        self, isolated_amount_filter_db, api_headers
    ):
        test_client, conn = isolated_amount_filter_db
        _seed_receipts_with_amounts(conn)

        response = test_client.get(
            "/api/receipts",
            params={"amount_field": "detected", "min_amount": "400", "max_amount": "600"},
            headers=api_headers,
        )
        assert response.status_code == 200, response.text
        items = response.json()["items"]
        detected = {Decimal(item["detected_amount"]) for item in items}
        assert detected == {Decimal("500.00")}

    def test_amount_field_expected_filters_expected_column(
        self, isolated_amount_filter_db, api_headers
    ):
        test_client, conn = isolated_amount_filter_db
        _seed_receipts_with_amounts(conn)

        response = test_client.get(
            "/api/receipts",
            params={"amount_field": "expected", "min_amount": "400", "max_amount": "600"},
            headers=api_headers,
        )
        assert response.status_code == 200, response.text
        items = response.json()["items"]
        expected = {Decimal(item["expected_amount"]) for item in items}
        # Only the receipt with expected_amount=500 falls in range when filtering by expected.
        assert expected == {Decimal("500.00")}
