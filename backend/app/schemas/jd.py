from pydantic import BaseModel
from typing import Optional


class JDCreate(BaseModel):
    raw_text: str


class JDResponse(BaseModel):
    id: str
    raw_text: str
    parsed_data: Optional[dict] = None
    source: str
    created_at: str

    class Config:
        from_attributes = True


class JDListResponse(BaseModel):
    items: list[JDResponse]
    total: int
