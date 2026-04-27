from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

from .config import settings

logger = logging.getLogger(__name__)


class EvolutionClientError(RuntimeError):
    """Raised when the Evolution outbound client cannot fulfil a request.

    Carries a short, log-safe ``code`` and a generic ``detail`` that never
    includes raw payloads or secrets.
    """

    def __init__(self, code: str, detail: str) -> None:
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail


@dataclass
class ConnectInstanceResult:
    """Outcome of asking Evolution to (re)open a session.

    The body is intentionally limited to non-sensitive metadata. We never
    return the QR base64 from this call — that flow is owned by the
    ``qrcode.updated`` webhook + buffer.
    """

    requested: bool
    pairing_code: str | None = None
    status_code: int = 0


@dataclass
class SendResult:
    """Outcome of an outbound send attempt.

    Always one of ``SENT`` or ``FAILED`` — never raises. Callers can persist
    ``delivery_status`` directly from this value. ``external_message_id``
    is the provider's id when available, otherwise ``None``.
    """

    status: str  # "SENT" | "FAILED"
    external_message_id: str | None
    detail: str | None = None


class EvolutionClient:
    """Minimal outbound client for the Evolution API.

    Scope for Phase 4:
    - ``connect_instance`` — manual reconnect requested by the operator.

    Future scope (separate phase):
    - ``send_text``, ``send_media``.

    Behaviour:
    - Explicit timeout from settings.
    - No retries. A failure surfaces a single ``EvolutionClientError``.
    - Logs are structured by code; never include payload bodies or apikey.
    """

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout_seconds: float | None = None,
        instance: str | None = None,
    ) -> None:
        self._base_url = (base_url if base_url is not None else settings.evolution_api_base_url).rstrip("/")
        self._api_key = api_key if api_key is not None else settings.evolution_api_key
        self._timeout = timeout_seconds if timeout_seconds is not None else settings.evolution_outbound_timeout_seconds
        self._instance = instance if instance is not None else settings.evolution_instance

    def _ensure_configured(self) -> None:
        if not self._base_url or not self._api_key:
            raise EvolutionClientError(
                "evolution_not_configured",
                "Evolution outbound base URL or API key is missing.",
            )

    def _headers(self) -> dict[str, str]:
        return {"apikey": self._api_key, "accept": "application/json"}

    def connect_instance(self) -> ConnectInstanceResult:
        self._ensure_configured()
        url = f"{self._base_url}/instance/connect/{self._instance}"
        try:
            with httpx.Client(timeout=self._timeout) as http:
                response = http.get(url, headers=self._headers())
        except httpx.TimeoutException:
            logger.warning("evolution_connect_timeout instance=%s", self._instance)
            raise EvolutionClientError("timeout", "Evolution did not respond in time.") from None
        except httpx.RequestError:
            logger.warning("evolution_connect_transport_error instance=%s", self._instance)
            raise EvolutionClientError("transport_error", "Could not reach Evolution.") from None

        if response.status_code >= 400:
            logger.warning(
                "evolution_connect_http_error instance=%s status=%s",
                self._instance,
                response.status_code,
            )
            raise EvolutionClientError(
                "http_error",
                f"Evolution rejected the connect request (HTTP {response.status_code}).",
            )

        body: dict[str, Any] = {}
        try:
            payload = response.json()
            if isinstance(payload, dict):
                body = payload
        except ValueError:
            body = {}

        pairing_code = body.get("pairingCode") if isinstance(body.get("pairingCode"), str) else None
        return ConnectInstanceResult(
            requested=True,
            pairing_code=pairing_code,
            status_code=response.status_code,
        )


    def _send(self, *, path: str, body: dict[str, Any]) -> SendResult:
        try:
            self._ensure_configured()
        except EvolutionClientError as exc:
            logger.warning("evolution_send_not_configured path=%s code=%s", path, exc.code)
            return SendResult(status="FAILED", external_message_id=None, detail=exc.detail)

        url = f"{self._base_url}{path}"
        try:
            with httpx.Client(timeout=self._timeout) as http:
                response = http.post(url, headers=self._headers(), json=body)
        except httpx.TimeoutException:
            logger.warning("evolution_send_timeout path=%s instance=%s", path, self._instance)
            return SendResult(status="FAILED", external_message_id=None, detail="timeout")
        except httpx.RequestError:
            logger.warning(
                "evolution_send_transport_error path=%s instance=%s", path, self._instance
            )
            return SendResult(status="FAILED", external_message_id=None, detail="transport_error")

        if response.status_code >= 400:
            logger.warning(
                "evolution_send_http_error path=%s instance=%s status=%s",
                path,
                self._instance,
                response.status_code,
            )
            return SendResult(
                status="FAILED",
                external_message_id=None,
                detail=f"http_{response.status_code}",
            )

        external_message_id: str | None = None
        try:
            payload = response.json()
        except ValueError:
            payload = None
        if isinstance(payload, dict):
            key = payload.get("key")
            if isinstance(key, dict):
                value = key.get("id")
                if isinstance(value, str) and value:
                    external_message_id = value

        return SendResult(status="SENT", external_message_id=external_message_id, detail=None)

    def send_text(self, jid: str, text: str) -> SendResult:
        if not jid or not text:
            logger.warning("evolution_send_text_invalid_input")
            return SendResult(status="FAILED", external_message_id=None, detail="invalid_input")
        return self._send(
            path=f"/message/sendText/{self._instance}",
            body={"number": jid, "text": text},
        )

    def send_media(
        self,
        jid: str,
        *,
        media: str,
        media_type: str,
        mime_type: str | None = None,
        caption: str | None = None,
        file_name: str | None = None,
    ) -> SendResult:
        if not jid or not media or not media_type:
            logger.warning("evolution_send_media_invalid_input")
            return SendResult(status="FAILED", external_message_id=None, detail="invalid_input")
        body: dict[str, Any] = {
            "number": jid,
            "mediatype": media_type,
            "media": media,
        }
        if mime_type:
            body["mimetype"] = mime_type
        if caption:
            body["caption"] = caption
        if file_name:
            body["fileName"] = file_name
        return self._send(
            path=f"/message/sendMedia/{self._instance}",
            body=body,
        )


_default_client: EvolutionClient | None = None


def get_evolution_client() -> EvolutionClient:
    global _default_client
    if _default_client is None:
        _default_client = EvolutionClient()
    return _default_client
