from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass


@dataclass(frozen=True)
class QrEntry:
    token: str
    base64: str
    expires_at: float
    created_at: float


class QrBuffer:
    """In-memory store for the latest Evolution QR code.

    Holds a single active QR keyed by an opaque UUID token. Base64 stays in
    process memory only — never persisted, never logged. Old entries are
    overwritten when a newer QR arrives, and the buffer is cleared when the
    instance reports CONNECTED.
    """

    def __init__(self, ttl_seconds: int = 60) -> None:
        self._ttl_seconds = ttl_seconds
        self._lock = threading.Lock()
        self._entry: QrEntry | None = None

    @property
    def ttl_seconds(self) -> int:
        return self._ttl_seconds

    def store(self, base64_value: str, *, now: float | None = None) -> str:
        if not base64_value:
            raise ValueError("base64 must not be empty")
        token = uuid.uuid4().hex
        timestamp = now if now is not None else time.monotonic()
        with self._lock:
            self._entry = QrEntry(
                token=token,
                base64=base64_value,
                expires_at=timestamp + self._ttl_seconds,
                created_at=timestamp,
            )
        return token

    def get(self, token: str, *, now: float | None = None) -> str | None:
        timestamp = now if now is not None else time.monotonic()
        with self._lock:
            entry = self._entry
            if entry is None or entry.token != token:
                return None
            if entry.expires_at <= timestamp:
                self._entry = None
                return None
            return entry.base64

    def current_token(self, *, now: float | None = None) -> str | None:
        timestamp = now if now is not None else time.monotonic()
        with self._lock:
            entry = self._entry
            if entry is None:
                return None
            if entry.expires_at <= timestamp:
                self._entry = None
                return None
            return entry.token

    def age_seconds(self, *, now: float | None = None) -> int | None:
        timestamp = now if now is not None else time.monotonic()
        with self._lock:
            entry = self._entry
            if entry is None or entry.expires_at <= timestamp:
                return None
            return max(0, int(timestamp - entry.created_at))

    def clear(self) -> None:
        with self._lock:
            self._entry = None


qr_buffer = QrBuffer()
