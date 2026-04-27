"""Cobertura do webhook Evolution: persistencia, idempotencia e segregacao de eventos.

Criterios de aceite Fase 2 e Fase 4 (preparatorio):
- `messages.upsert` cria cliente, conversa e mensagem sem duplicar (idempotencia por `external_message_id`).
- `connection.update` atualiza `app.integration_status`.
- `qrcode.updated` armazena QR em buffer e nao deixa base64 vazar para o banco.
- Evento desconhecido nao quebra o webhook; vira `SKIPPED`.
- Payload sem evento conhecido falha de forma controlada.
- Sanitizacao remove `base64`/`jpegThumbnail` antes de gravar `payload_sanitized_json`.
"""
from __future__ import annotations

import json
import time
import uuid

from barra_vips_api.db import connect
from barra_vips_api.qr_buffer import qr_buffer


def _build_messages_upsert(*, external_id: str, remote_jid: str = "5521988887777@s.whatsapp.net") -> dict:
    return {
        "event": "messages.upsert",
        "instance": "barra-vips-main",
        "data": {
            "key": {
                "remoteJid": remote_jid,
                "fromMe": False,
                "id": external_id,
            },
            "pushName": "Cliente Webhook Test",
            "messageType": "conversation",
            "message": {"conversation": "Mensagem de teste"},
            "messageTimestamp": int(time.time()),
        },
    }


def _count_messages_with_external_id(external_id: str) -> int:
    with connect() as conn:
        row = conn.execute(
            "SELECT count(*) AS n FROM app.messages WHERE external_message_id = %(id)s",
            {"id": external_id},
        ).fetchone()
    return row["n"]


def _count_raw_events_with_external_id(external_id: str) -> int:
    with connect() as conn:
        row = conn.execute(
            "SELECT count(*) AS n FROM app.raw_webhook_events WHERE external_message_id = %(id)s",
            {"id": external_id},
        ).fetchone()
    return row["n"]


def _fetch_raw_payload(external_id: str) -> dict:
    with connect() as conn:
        row = conn.execute(
            "SELECT payload_sanitized_json FROM app.raw_webhook_events WHERE external_message_id = %(id)s",
            {"id": external_id},
        ).fetchone()
    return row["payload_sanitized_json"] if row else {}


class TestMessagesUpsertIdempotency:
    def test_first_call_creates_message(self, client, evolution_headers):
        external_id = f"MSG_TEST_{uuid.uuid4().hex}"
        response = client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json=_build_messages_upsert(external_id=external_id),
        )
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "processed"
        assert _count_messages_with_external_id(external_id) == 1

    def test_repeated_call_is_skipped_without_duplicating(self, client, evolution_headers):
        external_id = f"MSG_TEST_{uuid.uuid4().hex}"
        payload = _build_messages_upsert(external_id=external_id)

        first = client.post("/webhooks/evolution", headers=evolution_headers, json=payload)
        second = client.post("/webhooks/evolution", headers=evolution_headers, json=payload)

        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json()["status"] == "duplicate"
        assert second.json()["message_id"] is None
        assert _count_messages_with_external_id(external_id) == 1
        assert _count_raw_events_with_external_id(external_id) == 1


class TestConnectionUpdate:
    def test_persists_status(self, client, evolution_headers):
        response = client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "connection.update",
                "instance": "barra-vips-main",
                "data": {"state": "open", "status": "CONNECTED"},
            },
        )
        assert response.status_code == 200
        assert response.json()["integration_status"] == "CONNECTED"

    def test_qr_required_state_is_recognized(self, client, evolution_headers):
        response = client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "connection.update",
                "instance": "barra-vips-main",
                "data": {"state": "QR_REQUIRED", "qr": "qr-data-ref"},
            },
        )
        assert response.status_code == 200
        assert response.json()["integration_status"] == "QR_REQUIRED"

    def test_disconnected_state_persists(self, client, evolution_headers):
        response = client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "connection.update",
                "instance": "barra-vips-main",
                "data": {"state": "close", "status": "DISCONNECTED"},
            },
        )
        assert response.status_code == 200
        assert response.json()["integration_status"] == "DISCONNECTED"


class TestUnsupportedEvents:
    def test_messages_update_without_match_is_skipped(self, client, evolution_headers):
        response = client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "messages.update",
                "instance": "barra-vips-main",
                "data": {"key": {"id": "X"}, "update": {"status": "SENT"}},
            },
        )
        assert response.status_code == 200
        assert response.json()["status"] == "skipped"

    def test_completely_unknown_event_is_skipped(self, client, evolution_headers):
        response = client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "presence.update",
                "instance": "barra-vips-main",
                "data": {"foo": "bar"},
            },
        )
        assert response.status_code == 200
        assert response.json()["status"] == "skipped"

    def test_payload_without_event_is_skipped(self, client, evolution_headers):
        response = client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={"foo": "bar"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "skipped"


class TestSanitization:
    def test_base64_and_thumbnails_are_stripped(self, client, evolution_headers):
        external_id = f"MSG_TEST_{uuid.uuid4().hex}"
        payload = _build_messages_upsert(external_id=external_id)
        payload["data"]["message"] = {
            "imageMessage": {
                "url": "https://media.example.com/file",
                "mimetype": "image/jpeg",
                "caption": "preview",
                "jpegThumbnail": "AAAA-very-large-base64-blob",
                "base64": "AAAA-secret-payload",
            }
        }
        response = client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json=payload,
        )
        assert response.status_code == 200, response.text

        stored = _fetch_raw_payload(external_id)
        image_payload = stored["data"]["message"]["imageMessage"]
        assert image_payload["jpegThumbnail"] == "[removed]"
        assert image_payload["base64"] == "[removed]"
        assert image_payload["url"] == "https://media.example.com/file"
        assert image_payload["caption"] == "preview"


def _fetch_latest_evolution_status() -> dict:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT status, qr_code_ref, last_event_at
            FROM app.integration_status
            WHERE provider = 'evolution'
            ORDER BY updated_at DESC
            LIMIT 1
            """
        ).fetchone()
    return dict(row) if row else {}


def _fetch_raw_payload_for_event(event_name: str) -> dict:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT payload_sanitized_json
            FROM app.raw_webhook_events
            WHERE provider = 'evolution' AND event_name = %(event)s
            ORDER BY received_at DESC
            LIMIT 1
            """,
            {"event": event_name},
        ).fetchone()
    return row["payload_sanitized_json"] if row else {}


class TestQrcodeUpdate:
    def setup_method(self) -> None:
        qr_buffer.clear()

    def teardown_method(self) -> None:
        qr_buffer.clear()

    def test_qrcode_updated_stores_token_and_redacts_base64(self, client, evolution_headers):
        secret_base64 = "data:image/png;base64,SHOULD-NOT-LEAK"
        secret_code = "qr-pairing-code-secret"
        response = client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "qrcode.updated",
                "instance": "barra-vips-main",
                "data": {
                    "qrcode": {
                        "code": secret_code,
                        "base64": secret_base64,
                    }
                },
            },
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["integration_status"] == "QR_REQUIRED"

        status_row = _fetch_latest_evolution_status()
        assert status_row["status"] == "QR_REQUIRED"
        assert status_row["qr_code_ref"], "expected token in qr_code_ref"
        assert secret_base64 not in (status_row["qr_code_ref"] or "")
        assert qr_buffer.get(status_row["qr_code_ref"]) == secret_base64

        raw = _fetch_raw_payload_for_event("qrcode.updated")
        serialized = json.dumps(raw)
        assert "SHOULD-NOT-LEAK" not in serialized
        assert secret_code not in serialized
        assert raw["data"]["qrcode"] == "[removed]" or raw["data"]["qrcode"]["base64"] == "[removed]"

    def test_connection_update_never_persists_qr_base64(self, client, evolution_headers):
        secret_base64 = "data:image/png;base64,LEAK-VIA-CONNECTION-UPDATE"
        response = client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "connection.update",
                "instance": "barra-vips-main",
                "data": {"state": "QR_REQUIRED", "qr": secret_base64},
            },
        )
        assert response.status_code == 200, response.text

        status_row = _fetch_latest_evolution_status()
        assert status_row["status"] == "QR_REQUIRED"
        assert (status_row["qr_code_ref"] or "") != secret_base64

        raw = _fetch_raw_payload_for_event("connection.update")
        serialized = json.dumps(raw)
        assert "LEAK-VIA-CONNECTION-UPDATE" not in serialized

    def test_connected_clears_qr_buffer_and_ref(self, client, evolution_headers):
        client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "qrcode.updated",
                "instance": "barra-vips-main",
                "data": {"qrcode": {"base64": "data:image/png;base64,QR-FOR-CLEAR"}},
            },
        )
        assert qr_buffer.current_token() is not None

        response = client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "connection.update",
                "instance": "barra-vips-main",
                "data": {"state": "open", "status": "CONNECTED"},
            },
        )
        assert response.status_code == 200
        assert qr_buffer.current_token() is None

        status_row = _fetch_latest_evolution_status()
        assert status_row["status"] == "CONNECTED"
        assert status_row["qr_code_ref"] is None


class TestMessagesUpdateDeliveryStatus:
    SEED_CONVERSATION_ID = "30000000-0000-0000-0000-000000000001"
    SEED_CLIENT_ID = "20000000-0000-0000-0000-000000000001"

    def _insert_outbound_message(self, external_id: str) -> None:
        with connect() as conn:
            conn.execute(
                """
                INSERT INTO app.messages (
                  conversation_id, client_id, external_message_id, direction, role,
                  message_type, content_text, from_me, delivery_status, provider_message_at
                ) VALUES (
                  %(conv)s, %(cli)s, %(ext)s, 'OUTBOUND', 'agent',
                  'text', 'msg de teste outbound', true, 'PENDING', now()
                )
                """,
                {"conv": self.SEED_CONVERSATION_ID, "cli": self.SEED_CLIENT_ID, "ext": external_id},
            )

    def _fetch_delivery_status(self, external_id: str) -> str | None:
        with connect() as conn:
            row = conn.execute(
                """
                SELECT delivery_status FROM app.messages WHERE external_message_id = %(ext)s
                """,
                {"ext": external_id},
            ).fetchone()
        return row["delivery_status"] if row else None

    def test_status_sent_is_applied(self, client, evolution_headers):
        external_id = f"OUTBOUND_{uuid.uuid4().hex}"
        self._insert_outbound_message(external_id)
        response = client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "messages.update",
                "instance": "barra-vips-main",
                "data": {
                    "key": {"id": external_id, "remoteJid": "5521000@s.whatsapp.net", "fromMe": True},
                    "update": {"status": "SENT"},
                },
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "processed"
        assert body["updates_applied"] == 1
        assert self._fetch_delivery_status(external_id) == "SENT"

    def test_status_failed_is_applied(self, client, evolution_headers):
        external_id = f"OUTBOUND_{uuid.uuid4().hex}"
        self._insert_outbound_message(external_id)
        response = client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "messages.update",
                "instance": "barra-vips-main",
                "data": [
                    {
                        "key": {"id": external_id, "fromMe": True},
                        "update": {"status": "FAILED"},
                    }
                ],
            },
        )
        assert response.status_code == 200
        assert response.json()["updates_applied"] == 1
        assert self._fetch_delivery_status(external_id) == "FAILED"

    def test_delivered_is_skipped(self, client, evolution_headers):
        external_id = f"OUTBOUND_{uuid.uuid4().hex}"
        self._insert_outbound_message(external_id)
        response = client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "messages.update",
                "instance": "barra-vips-main",
                "data": {
                    "key": {"id": external_id, "fromMe": True},
                    "update": {"status": "DELIVERED"},
                },
            },
        )
        assert response.status_code == 200
        assert response.json()["status"] == "skipped"
        assert self._fetch_delivery_status(external_id) == "PENDING"

    def test_read_is_skipped(self, client, evolution_headers):
        external_id = f"OUTBOUND_{uuid.uuid4().hex}"
        self._insert_outbound_message(external_id)
        response = client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "messages.update",
                "instance": "barra-vips-main",
                "data": {
                    "key": {"id": external_id, "fromMe": True},
                    "status": "READ",
                },
            },
        )
        assert response.status_code == 200
        assert response.json()["status"] == "skipped"
        assert self._fetch_delivery_status(external_id) == "PENDING"


