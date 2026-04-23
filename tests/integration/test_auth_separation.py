"""Garante que as tres superficies de autenticacao nao se cruzam.

Criterio de aceite Fase 2:
- API bloqueia requisicoes sem `OPERATOR_API_KEY`.
- Webhooks nao compartilham autenticacao com a interface.
"""
from __future__ import annotations

import os


EVOLUTION_PROBE_PAYLOAD = {
    "event": "connection.update",
    "instance": "barra-vips-main",
    "data": {"state": "open", "status": "CONNECTED"},
}

CHATWOOT_PROBE_PAYLOAD = {
    "event": "conversation_status_changed",
    "status": "open",
}


class TestApiRejectsMissingOrWrongKey:
    def test_health_blocks_without_any_credential(self, client):
        response = client.get("/api/status/health")
        assert response.status_code == 401

    def test_health_blocks_with_evolution_secret_in_operator_header(self, client):
        # Evolution secret nao pode ser aceito pela superficie /api/*.
        headers = {"x-operator-api-key": os.environ["EVOLUTION_WEBHOOK_SECRET"]}
        response = client.get("/api/status/health", headers=headers)
        assert response.status_code == 401

    def test_health_blocks_with_chatwoot_secret_in_operator_header(self, client):
        headers = {"x-operator-api-key": os.environ["CHATWOOT_WEBHOOK_SECRET"]}
        response = client.get("/api/status/health", headers=headers)
        assert response.status_code == 401

    def test_health_blocks_with_evolution_apikey_header(self, client):
        # Header de webhook nao pode habilitar /api/*.
        headers = {"apikey": os.environ["OPERATOR_API_KEY"]}
        response = client.get("/api/status/health", headers=headers)
        assert response.status_code == 401

    def test_conversations_blocks_without_credential(self, client):
        response = client.get("/api/conversations")
        assert response.status_code == 401

    def test_bearer_token_alternative_form_works(self, client):
        headers = {"authorization": f"Bearer {os.environ['OPERATOR_API_KEY']}"}
        response = client.get("/api/status/health", headers=headers)
        assert response.status_code == 200


class TestEvolutionWebhookOnlyAcceptsItsOwnSecret:
    def test_blocks_without_apikey(self, client):
        response = client.post("/webhooks/evolution", json=EVOLUTION_PROBE_PAYLOAD)
        assert response.status_code == 401

    def test_blocks_with_operator_api_key_in_apikey_header(self, client):
        headers = {"apikey": os.environ["OPERATOR_API_KEY"]}
        response = client.post(
            "/webhooks/evolution",
            headers=headers,
            json=EVOLUTION_PROBE_PAYLOAD,
        )
        assert response.status_code == 401

    def test_blocks_with_operator_api_key_in_operator_header(self, client):
        # Webhook nao deve aceitar a chave operacional, mesmo no nome canonico.
        headers = {"x-operator-api-key": os.environ["OPERATOR_API_KEY"]}
        response = client.post(
            "/webhooks/evolution",
            headers=headers,
            json=EVOLUTION_PROBE_PAYLOAD,
        )
        assert response.status_code == 401

    def test_blocks_with_chatwoot_secret(self, client):
        headers = {"apikey": os.environ["CHATWOOT_WEBHOOK_SECRET"]}
        response = client.post(
            "/webhooks/evolution",
            headers=headers,
            json=EVOLUTION_PROBE_PAYLOAD,
        )
        assert response.status_code == 401

    def test_accepts_with_correct_secret(self, client, evolution_headers):
        response = client.post(
            "/webhooks/evolution",
            headers=evolution_headers,
            json=EVOLUTION_PROBE_PAYLOAD,
        )
        assert response.status_code == 200


class TestChatwootWebhookOnlyAcceptsItsOwnSecret:
    def test_blocks_without_secret(self, client):
        response = client.post("/webhooks/chatwoot", json=CHATWOOT_PROBE_PAYLOAD)
        assert response.status_code == 401

    def test_blocks_with_operator_api_key(self, client):
        headers = {"x-chatwoot-webhook-secret": os.environ["OPERATOR_API_KEY"]}
        response = client.post(
            "/webhooks/chatwoot",
            headers=headers,
            json=CHATWOOT_PROBE_PAYLOAD,
        )
        assert response.status_code == 401

    def test_blocks_with_evolution_secret(self, client):
        headers = {"x-chatwoot-webhook-secret": os.environ["EVOLUTION_WEBHOOK_SECRET"]}
        response = client.post(
            "/webhooks/chatwoot",
            headers=headers,
            json=CHATWOOT_PROBE_PAYLOAD,
        )
        assert response.status_code == 401

    def test_accepts_with_correct_secret(self, client, chatwoot_headers):
        response = client.post(
            "/webhooks/chatwoot",
            headers=chatwoot_headers,
            json=CHATWOOT_PROBE_PAYLOAD,
        )
        assert response.status_code == 200
