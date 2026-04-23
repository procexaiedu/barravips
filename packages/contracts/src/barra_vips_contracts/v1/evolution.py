from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID

from pydantic import Field, model_validator

from .common import FlexibleProviderModel
from .messages import NormalizedIncomingMessage, NormalizedMedia


class EvolutionMessageKey(FlexibleProviderModel):
    remote_jid: str = Field(alias="remoteJid")
    from_me: bool = Field(alias="fromMe")
    id: str


class EvolutionMessagesUpsertData(FlexibleProviderModel):
    key: EvolutionMessageKey
    push_name: str | None = Field(default=None, alias="pushName")
    message_type: str = Field(alias="messageType")
    message: dict[str, Any]
    message_timestamp: int | float = Field(alias="messageTimestamp")

    @model_validator(mode="after")
    def ensure_supported_minimum(self) -> "EvolutionMessagesUpsertData":
        if not self.key.remote_jid or not self.key.id:
            raise ValueError("remoteJid and message id are required")
        if not self.message:
            raise ValueError("message payload is required")
        return self


class EvolutionMessagesUpsert(FlexibleProviderModel):
    event: Literal["messages.upsert"]
    instance: str
    data: EvolutionMessagesUpsertData


class EvolutionConnectionUpdateData(FlexibleProviderModel):
    state: str | None = None
    status: str | None = None
    qr: str | None = None
    reason: str | None = None

    @model_validator(mode="after")
    def ensure_status_signal(self) -> "EvolutionConnectionUpdateData":
        if not (self.state or self.status or self.qr):
            raise ValueError("connection.update requires state, status, or qr")
        return self


class EvolutionConnectionUpdate(FlexibleProviderModel):
    event: Literal["connection.update"]
    instance: str
    data: EvolutionConnectionUpdateData


def normalize_evolution_message(
    payload: EvolutionMessagesUpsert,
    *,
    trace_id: UUID,
    raw_event_id: UUID,
    max_text_chars: int = 4000,
) -> NormalizedIncomingMessage:
    message_type, text, media = _extract_message(payload.data.message)
    text_truncated = False
    if text is not None and len(text) > max_text_chars:
        text = text[:max_text_chars]
        text_truncated = True

    return NormalizedIncomingMessage(
        trace_id=trace_id,
        provider="evolution",
        event_name=payload.event,
        instance=payload.instance,
        remote_jid=payload.data.key.remote_jid,
        external_message_id=payload.data.key.id,
        from_me=payload.data.key.from_me,
        message_type=message_type,
        text=text,
        text_truncated=text_truncated,
        media=media,
        received_at=datetime.fromtimestamp(payload.data.message_timestamp, tz=timezone.utc),
        raw_event_id=raw_event_id,
    )


def _extract_message(message: dict[str, Any]) -> tuple[str, str | None, NormalizedMedia | None]:
    if conversation := message.get("conversation"):
        return "text", str(conversation), None

    if extended := message.get("extendedTextMessage"):
        return "text", _optional_str(extended.get("text")), None

    if image := message.get("imageMessage"):
        caption = _optional_str(image.get("caption"))
        return "image", caption, _media_from_provider(image, caption=caption)

    if audio := message.get("audioMessage"):
        return "audio", None, _media_from_provider(audio)

    if video := message.get("videoMessage"):
        caption = _optional_str(video.get("caption"))
        return "video", caption, _media_from_provider(video, caption=caption)

    if document := message.get("documentMessage"):
        caption = _optional_str(document.get("caption"))
        media = _media_from_provider(document, caption=caption)
        media.file_name = _optional_str(document.get("fileName"))
        return "document", caption, media

    raise ValueError("unsupported Evolution message payload")


def _media_from_provider(payload: dict[str, Any], *, caption: str | None = None) -> NormalizedMedia:
    return NormalizedMedia(
        provider_media_id=_optional_str(payload.get("mediaKey")),
        mime_type=_optional_str(payload.get("mimetype")),
        url=_optional_str(payload.get("url")),
        caption=caption,
    )


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)
