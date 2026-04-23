from typing import Literal
from uuid import UUID

from .common import ContractModel


class AgentToolCallContract(ContractModel):
    conversation_id: UUID
    trace_id: UUID
    tool_name: Literal[
        "get_client_profile",
        "update_conversation_state",
        "check_availability",
        "block_slot",
        "select_media",
        "open_handoff",
        "record_receipt",
    ]
    arguments: dict
