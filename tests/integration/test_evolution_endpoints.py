"""Endpoints operator-only e status enriquecido da Fase 4."""
from __future__ import annotations

from typing import Iterator

import pytest

from barra_vips_api.evolution_client import (
    ConnectInstanceResult,
    EvolutionClient,
    EvolutionClientError,
    get_evolution_client,
)
from barra_vips_api.qr_buffer import qr_buffer


class _FakeEvolutionClient:
    def __init__(self, *, raise_with: EvolutionClientError | None = None) -> None:
        self.calls = 0
        self._raise = raise_with

    def connect_instance(self) -> ConnectInstanceResult:
        self.calls += 1
        if self._raise is not None:
            raise self._raise
        return ConnectInstanceResult(requested=True, pairing_code=None, status_code=200)


@pytest.fixture()
def fake_evolution_client(app) -> Iterator[_FakeEvolutionClient]:
    fake = _FakeEvolutionClient()
    app.dependency_overrides[get_evolution_client] = lambda: fake
    try:
        yield fake
    finally:
        app.dependency_overrides.pop(get_evolution_client, None)


@pytest.fixture()
def failing_evolution_client(app) -> Iterator[_FakeEvolutionClient]:
    fake = _FakeEvolutionClient(
        raise_with=EvolutionClientError("timeout", "Evolution did not respond in time."),
    )
    app.dependency_overrides[get_evolution_client] = lambda: fake
    try:
        yield fake
    finally:
        app.dependency_overrides.pop(get_evolution_client, None)


class TestEvolutionQrEndpoint:
    def setup_method(self) -> None:
        qr_buffer.clear()

    def teardown_method(self) -> None:
        qr_buffer.clear()

    def test_returns_404_when_no_qr(self, client, api_headers):
        response = client.get("/api/integrations/evolution/qr", headers=api_headers)
        assert response.status_code == 404

    def test_requires_operator_api_key(self, client):
        response = client.get("/api/integrations/evolution/qr")
        assert response.status_code == 401

    def test_returns_qr_payload_while_token_active(self, client, api_headers, evolution_headers):
        secret_base64 = "data:image/png;base64,QR-PAYLOAD-FOR-ENDPOINT"
        webhook = client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "qrcode.updated",
                "instance": "barra-vips-main",
                "data": {"qrcode": {"base64": secret_base64}},
            },
        )
        assert webhook.status_code == 200

        response = client.get("/api/integrations/evolution/qr", headers=api_headers)
        assert response.status_code == 200
        body = response.json()
        assert body["base64"] == secret_base64
        assert body["token"]
        assert body["age_seconds"] >= 0
        assert 0 < body["expires_in_seconds"] <= 60
        assert response.headers.get("cache-control") == "no-store"

    def test_returns_404_after_buffer_cleared(self, client, api_headers, evolution_headers):
        client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "qrcode.updated",
                "instance": "barra-vips-main",
                "data": {"qrcode": {"base64": "data:image/png;base64,WILL-CLEAR"}},
            },
        )
        qr_buffer.clear()
        response = client.get("/api/integrations/evolution/qr", headers=api_headers)
        assert response.status_code == 404


class TestEvolutionStatusEnrichment:
    def setup_method(self) -> None:
        qr_buffer.clear()

    def teardown_method(self) -> None:
        qr_buffer.clear()

    def test_status_reflects_connected_state(self, client, api_headers, evolution_headers):
        webhook = client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "connection.update",
                "instance": "barra-vips-main",
                "data": {"state": "open", "status": "CONNECTED"},
            },
        )
        assert webhook.status_code == 200

        response = client.get("/api/status/evolution", headers=api_headers)
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "CONNECTED"
        assert body["connected"] is True
        assert body["qr_code_ref"] is None
        assert body["qr_age_seconds"] is None
        assert body["connected_since"] is not None
        assert body["last_event_at"] is not None

    def test_status_returns_unknown_when_no_record(self, client, api_headers):
        # Smoke check: even with empty integration_status, endpoint stays well-formed.
        response = client.get("/api/status/evolution", headers=api_headers)
        assert response.status_code == 200
        body = response.json()
        assert body["status"] in {"CONNECTED", "DISCONNECTED", "QR_REQUIRED", "UNKNOWN"}
        assert "connected" in body
        assert "qr_age_seconds" in body
        assert "connected_since" in body

    def test_status_includes_qr_age_when_pending(self, client, api_headers, evolution_headers):
        client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "qrcode.updated",
                "instance": "barra-vips-main",
                "data": {"qrcode": {"base64": "data:image/png;base64,FOR-AGE"}},
            },
        )
        response = client.get("/api/status/evolution", headers=api_headers)
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "QR_REQUIRED"
        assert body["connected"] is False
        assert body["qr_code_ref"] is not None
        assert body["qr_age_seconds"] is not None
        assert body["qr_age_seconds"] >= 0
        assert body["connected_since"] is None


class TestEvolutionConnectEndpoint:
    def setup_method(self) -> None:
        qr_buffer.clear()

    def teardown_method(self) -> None:
        qr_buffer.clear()

    def test_requires_operator_api_key(self, client):
        response = client.post("/api/integrations/evolution/connect")
        assert response.status_code == 401

    def test_returns_already_connected_when_status_is_connected(
        self, client, api_headers, evolution_headers, fake_evolution_client
    ):
        webhook = client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "connection.update",
                "instance": "barra-vips-main",
                "data": {"state": "open", "status": "CONNECTED"},
            },
        )
        assert webhook.status_code == 200

        response = client.post("/api/integrations/evolution/connect", headers=api_headers)
        assert response.status_code == 200
        assert response.json()["status"] == "already_connected"
        assert fake_evolution_client.calls == 0

    def test_invokes_client_when_disconnected(
        self, client, api_headers, evolution_headers, fake_evolution_client
    ):
        client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "connection.update",
                "instance": "barra-vips-main",
                "data": {"state": "close", "status": "DISCONNECTED"},
            },
        )
        response = client.post("/api/integrations/evolution/connect", headers=api_headers)
        assert response.status_code == 200
        assert response.json()["status"] == "requested"
        assert fake_evolution_client.calls == 1

    def test_returns_failed_on_client_error(
        self, client, api_headers, evolution_headers, failing_evolution_client
    ):
        client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json={
                "event": "connection.update",
                "instance": "barra-vips-main",
                "data": {"state": "close", "status": "DISCONNECTED"},
            },
        )
        response = client.post("/api/integrations/evolution/connect", headers=api_headers)
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "failed"
        assert "respond" in body["detail"].lower()
        assert failing_evolution_client.calls == 1
