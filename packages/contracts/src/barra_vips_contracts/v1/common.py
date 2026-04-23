from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FlexibleProviderModel(BaseModel):
    model_config = ConfigDict(extra="allow")


class PaginatedEnvelope(ContractModel, Generic[T]):
    items: list[T]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
