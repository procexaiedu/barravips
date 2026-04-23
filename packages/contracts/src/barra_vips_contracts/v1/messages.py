from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from .common import ContractModel


MessageType = Literal["text", "image", "audio", "video", "document", "system"]


class NormalizedMedia(ContractModel):
    provider_media_id: str | None = None
    mime_type: str | None = None
    url: str | None = None
    file_name: str | None = None
    caption: str | None = None


class NormalizedIncomingMessage(ContractModel):
    trace_id: UUID
    provider: Literal["evolution"] = "evolution"
    event_name: Literal["messages.upsert"] = "messages.upsert"
    instance: str
    remote_jid: str
    external_message_id: str
    from_me: bool
    message_type: MessageType
    text: str | None = Field(default=None, max_length=4000)
    text_truncated: bool = False
    media: NormalizedMedia | None = None
    received_at: datetime
    raw_event_id: UUID
