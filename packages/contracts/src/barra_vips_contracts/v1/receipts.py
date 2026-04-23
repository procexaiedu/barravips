from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import Field

from .common import ContractModel


class ReceiptContract(ContractModel):
    id: UUID | None = None
    conversation_id: UUID
    client_id: UUID
    message_id: UUID
    storage_path: str
    detected_amount: Decimal | None = None
    expected_amount: Decimal | None = None
    analysis_status: Literal["PENDING", "VALID", "INVALID", "UNCERTAIN", "NEEDS_REVIEW"]
    tolerance_applied: Decimal | None = None
    needs_review: bool
    metadata_json: dict = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None
