from __future__ import annotations

from barra_vips_api.qr_buffer import QrBuffer


def test_store_returns_unique_token():
    buffer = QrBuffer(ttl_seconds=60)
    token_a = buffer.store("base64-A", now=1000.0)
    token_b = buffer.store("base64-B", now=1001.0)
    assert token_a != token_b
    assert buffer.get(token_a, now=1002.0) is None
    assert buffer.get(token_b, now=1002.0) == "base64-B"


def test_get_returns_none_for_unknown_token():
    buffer = QrBuffer(ttl_seconds=60)
    buffer.store("base64", now=1000.0)
    assert buffer.get("not-the-token", now=1001.0) is None


def test_entry_expires_after_ttl():
    buffer = QrBuffer(ttl_seconds=60)
    token = buffer.store("base64", now=1000.0)
    assert buffer.get(token, now=1059.0) == "base64"
    assert buffer.get(token, now=1060.0) is None
    assert buffer.current_token(now=1060.0) is None


def test_clear_drops_active_entry():
    buffer = QrBuffer(ttl_seconds=60)
    token = buffer.store("base64", now=1000.0)
    buffer.clear()
    assert buffer.get(token, now=1001.0) is None
    assert buffer.current_token(now=1001.0) is None


def test_age_seconds_reflects_clock():
    buffer = QrBuffer(ttl_seconds=60)
    buffer.store("base64", now=1000.0)
    assert buffer.age_seconds(now=1000.0) == 0
    assert buffer.age_seconds(now=1042.0) == 42
    assert buffer.age_seconds(now=1100.0) is None


def test_empty_base64_rejected():
    buffer = QrBuffer(ttl_seconds=60)
    try:
        buffer.store("")
    except ValueError:
        return
    raise AssertionError("expected ValueError for empty base64")
