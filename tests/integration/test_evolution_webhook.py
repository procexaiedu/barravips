"""Cobertura do webhook Evolution: persistencia, idempotencia e segregacao de eventos.

Criterios de aceite Fase 2 e Fase 4 (preparatorio):
- `messages.upsert` cria cliente, conversa e mensagem sem duplicar (idempotencia por `external_message_id`).
- `connection.update` atualiza `app.integration_status`.
- Evento desconhecido nao quebra o webhook; vira `SKIPPED`.
- Payload sem evento conhecido falha de forma controlada.
- Sanitizacao remove `base64`/`jpegThumbnail` antes de gravar `payload_sanitized_json`.
"""
from __future__ import annotations

import time
import uuid

from barra_vips_api.db import connect


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
    def test_unsupported_event_is_skipped_not_failed(self, client, evolution_headers):
        response = client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "messages.update",
                "instance": "barra-vips-main",
                "data": {"key": {"id": "X"}},
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
