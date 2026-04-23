from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from .common import ContractModel


class HandoffEventContract(ContractModel):
    id: UUID | None = None
    conversation_id: UUID
    event_type: Literal["handoff_opened", "handoff_acknowledged", "handoff_released"]
    previous_handoff_status: Literal["NONE", "OPENED", "ACKNOWLEDGED", "RELEASED"]
    source: Literal["agent", "chatwoot", "operator_ui", "whatsapp_manual", "system"]
    actor_label: str | None = None
    reason: str | None = None
    metadata_json: dict = Field(default_factory=dict)
    trace_id: UUID | None = None
    created_at: datetime | None = None
