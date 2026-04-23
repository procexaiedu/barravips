"""Cobertura de acknowledge/release de handoff via API operacional.

Criterio de aceite Fase 2:
- `POST /api/conversations/{id}/handoff/acknowledge` e `/release` persistem eventos.
"""
from __future__ import annotations

from helpers import (
    fetch_conversation_handoff_status,
    open_handoff_for_seed,
)


class TestHandoffAcknowledge:
    def test_acknowledge_when_no_handoff_returns_409(
        self,
        client,
        api_headers,
        seed_conversation_id,
        reset_seed_conversation,
    ):
        response = client.post(
            f"/api/conversations/{seed_conversation_id}/handoff/acknowledge",
            headers=api_headers,
        )
        assert response.status_code == 409

    def test_acknowledge_open_handoff_persists_event(
        self,
        client,
        api_headers,
        seed_conversation_id,
        reset_seed_conversation,
    ):
        open_handoff_for_seed(reason="ack-test")

        response = client.post(
            f"/api/conversations/{seed_conversation_id}/handoff/acknowledge",
            headers=api_headers,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["status"] == "ACKNOWLEDGED"

        state = fetch_conversation_handoff_status()
        assert state["handoff_status"] == "ACKNOWLEDGED"

        detail = client.get(
            f"/api/conversations/{seed_conversation_id}",
            headers=api_headers,
        ).json()
        event_types = [event["event_type"] for event in detail["handoff_events"]]
        assert "handoff_acknowledged" in event_types
        assert "handoff_opened" in event_types

    def test_acknowledge_is_idempotent(
        self,
        client,
        api_headers,
        seed_conversation_id,
        reset_seed_conversation,
    ):
        open_handoff_for_seed()
        first = client.post(
            f"/api/conversations/{seed_conversation_id}/handoff/acknowledge",
            headers=api_headers,
        )
        second = client.post(
            f"/api/conversations/{seed_conversation_id}/handoff/acknowledge",
            headers=api_headers,
        )
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json()["status"] == "ACKNOWLEDGED"


class TestHandoffRelease:
    def test_release_without_open_handoff_returns_409(
        self,
        client,
        api_headers,
        seed_conversation_id,
        reset_seed_conversation,
    ):
        response = client.post(
            f"/api/conversations/{seed_conversation_id}/handoff/release",
            headers=api_headers,
        )
        assert response.status_code == 409

    def test_release_after_open_restores_state_before_escalation(
        self,
        client,
        api_headers,
        seed_conversation_id,
        reset_seed_conversation,
    ):
        open_handoff_for_seed(reason="release-test")
        before = fetch_conversation_handoff_status()
        assert before["state"] == "ESCALADO"
        assert before["state_before_escalation"] == "NOVO"

        response = client.post(
            f"/api/conversations/{seed_conversation_id}/handoff/release",
            headers=api_headers,
        )
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "RELEASED"

        after = fetch_conversation_handoff_status()
        assert after["handoff_status"] == "RELEASED"
        assert after["state"] == "NOVO"
        assert after["state_before_escalation"] is None

        detail = client.get(
            f"/api/conversations/{seed_conversation_id}",
            headers=api_headers,
        ).json()
        event_types = [event["event_type"] for event in detail["handoff_events"]]
        assert "handoff_released" in event_types

    def test_release_after_acknowledged_persists_event(
        self,
        client,
        api_headers,
        seed_conversation_id,
        reset_seed_conversation,
    ):
        open_handoff_for_seed()
        client.post(
            f"/api/conversations/{seed_conversation_id}/handoff/acknowledge",
            headers=api_headers,
        )
        response = client.post(
            f"/api/conversations/{seed_conversation_id}/handoff/release",
            headers=api_headers,
        )
        assert response.status_code == 200
        assert response.json()["status"] == "RELEASED"

    def test_release_is_idempotent(
        self,
        client,
        api_headers,
        seed_conversation_id,
        reset_seed_conversation,
    ):
        open_handoff_for_seed()
        first = client.post(
            f"/api/conversations/{seed_conversation_id}/handoff/release",
            headers=api_headers,
        )
        second = client.post(
            f"/api/conversations/{seed_conversation_id}/handoff/release",
            headers=api_headers,
        )
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json()["status"] == "RELEASED"
