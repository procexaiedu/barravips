from __future__ import annotations

import httpx
import pytest

from barra_vips_api.evolution_client import EvolutionClient, EvolutionClientError


def _client(handler) -> EvolutionClient:
    transport = httpx.MockTransport(handler)
    client = EvolutionClient(
        base_url="https://evolution.test",
        api_key="test-key",
        timeout_seconds=5.0,
        instance="barra-vips-main",
    )
    client._transport = transport  # type: ignore[attr-defined]
    return client


def test_requires_base_url_and_api_key():
    client = EvolutionClient(base_url="", api_key="", instance="x")
    with pytest.raises(EvolutionClientError) as exc:
        client.connect_instance()
    assert exc.value.code == "evolution_not_configured"


def test_connect_instance_success(monkeypatch):
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["apikey"] = request.headers.get("apikey")
        return httpx.Response(200, json={"pairingCode": "ABCD-1234"})

    transport = httpx.MockTransport(handler)
    real_client_cls = httpx.Client

    def fake_client(*args, **kwargs):
        kwargs["transport"] = transport
        return real_client_cls(*args, **kwargs)

    monkeypatch.setattr("barra_vips_api.evolution_client.httpx.Client", fake_client)

    client = EvolutionClient(
        base_url="https://evolution.test",
        api_key="test-key",
        timeout_seconds=5.0,
        instance="barra-vips-main",
    )
    result = client.connect_instance()

    assert result.requested is True
    assert result.pairing_code == "ABCD-1234"
    assert result.status_code == 200
    assert captured["url"] == "https://evolution.test/instance/connect/barra-vips-main"
    assert captured["apikey"] == "test-key"


def test_connect_instance_http_error(monkeypatch):
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="upstream down")

    transport = httpx.MockTransport(handler)
    real_client_cls = httpx.Client

    def fake_client(*args, **kwargs):
        kwargs["transport"] = transport
        return real_client_cls(*args, **kwargs)

    monkeypatch.setattr("barra_vips_api.evolution_client.httpx.Client", fake_client)

    client = EvolutionClient(
        base_url="https://evolution.test",
        api_key="test-key",
        timeout_seconds=5.0,
        instance="barra-vips-main",
    )
    with pytest.raises(EvolutionClientError) as exc:
        client.connect_instance()
    assert exc.value.code == "http_error"
    assert "503" in exc.value.detail


def test_connect_instance_timeout(monkeypatch):
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("simulated timeout")

    transport = httpx.MockTransport(handler)
    real_client_cls = httpx.Client

    def fake_client(*args, **kwargs):
        kwargs["transport"] = transport
        return real_client_cls(*args, **kwargs)

    monkeypatch.setattr("barra_vips_api.evolution_client.httpx.Client", fake_client)

    client = EvolutionClient(
        base_url="https://evolution.test",
        api_key="test-key",
        timeout_seconds=0.5,
        instance="barra-vips-main",
    )
    with pytest.raises(EvolutionClientError) as exc:
        client.connect_instance()
    assert exc.value.code == "timeout"


def test_connect_instance_transport_error(monkeypatch):
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("simulated transport error")

    transport = httpx.MockTransport(handler)
    real_client_cls = httpx.Client

    def fake_client(*args, **kwargs):
        kwargs["transport"] = transport
        return real_client_cls(*args, **kwargs)

    monkeypatch.setattr("barra_vips_api.evolution_client.httpx.Client", fake_client)

    client = EvolutionClient(
        base_url="https://evolution.test",
        api_key="test-key",
        timeout_seconds=5.0,
        instance="barra-vips-main",
    )
    with pytest.raises(EvolutionClientError) as exc:
        client.connect_instance()
    assert exc.value.code == "transport_error"


def _patch_httpx_with(monkeypatch, handler) -> None:
    transport = httpx.MockTransport(handler)
    real_client_cls = httpx.Client

    def fake_client(*args, **kwargs):
        kwargs["transport"] = transport
        return real_client_cls(*args, **kwargs)

    monkeypatch.setattr("barra_vips_api.evolution_client.httpx.Client", fake_client)


def _build_client() -> EvolutionClient:
    return EvolutionClient(
        base_url="https://evolution.test",
        api_key="test-key",
        timeout_seconds=5.0,
        instance="barra-vips-main",
    )


def test_send_text_success_returns_sent(monkeypatch):
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["body"] = request.content.decode("utf-8")
        return httpx.Response(200, json={"key": {"id": "EVO-MSG-1"}})

    _patch_httpx_with(monkeypatch, handler)
    result = _build_client().send_text("5521000@s.whatsapp.net", "hello")
    assert result.status == "SENT"
    assert result.external_message_id == "EVO-MSG-1"
    assert "/message/sendText/barra-vips-main" in captured["url"]  # type: ignore[arg-type]
    assert "hello" in captured["body"]  # type: ignore[arg-type]


def test_send_text_failure_returns_failed(monkeypatch):
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    _patch_httpx_with(monkeypatch, handler)
    result = _build_client().send_text("5521000@s.whatsapp.net", "hello")
    assert result.status == "FAILED"
    assert result.external_message_id is None
    assert result.detail == "http_500"


def test_send_text_timeout_returns_failed(monkeypatch):
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("boom")

    _patch_httpx_with(monkeypatch, handler)
    result = _build_client().send_text("5521000@s.whatsapp.net", "hello")
    assert result.status == "FAILED"
    assert result.detail == "timeout"


def test_send_text_invalid_input_returns_failed_without_call(monkeypatch):
    called = {"n": 0}

    def handler(_request: httpx.Request) -> httpx.Response:
        called["n"] += 1
        return httpx.Response(200, json={"key": {"id": "X"}})

    _patch_httpx_with(monkeypatch, handler)
    result = _build_client().send_text("", "hi")
    assert result.status == "FAILED"
    assert result.detail == "invalid_input"
    assert called["n"] == 0


def test_send_media_includes_caption_and_mime(monkeypatch):
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = request.content.decode("utf-8")
        captured["url"] = str(request.url)
        return httpx.Response(200, json={"key": {"id": "EVO-MEDIA-9"}})

    _patch_httpx_with(monkeypatch, handler)
    result = _build_client().send_media(
        "5521000@s.whatsapp.net",
        media="https://media.example.com/img.jpg",
        media_type="image",
        mime_type="image/jpeg",
        caption="legenda",
    )
    assert result.status == "SENT"
    assert result.external_message_id == "EVO-MEDIA-9"
    assert "/message/sendMedia/barra-vips-main" in captured["url"]  # type: ignore[arg-type]
    body = captured["body"]  # type: ignore[assignment]
    assert "image/jpeg" in body  # type: ignore[operator]
    assert "legenda" in body  # type: ignore[operator]


def test_send_media_failure_on_transport(monkeypatch):
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("nope")

    _patch_httpx_with(monkeypatch, handler)
    result = _build_client().send_media(
        "5521000@s.whatsapp.net",
        media="https://media.example.com/img.jpg",
        media_type="image",
    )
    assert result.status == "FAILED"
    assert result.detail == "transport_error"


def test_send_text_returns_failed_when_not_configured():
    client = EvolutionClient(base_url="", api_key="", instance="x")
    result = client.send_text("5521000@s.whatsapp.net", "hello")
    assert result.status == "FAILED"
    assert "missing" in (result.detail or "").lower()
