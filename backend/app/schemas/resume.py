from pydantic import BaseModel
from typing import Optional


class ResumeResponse(BaseModel):
    id: str
    original_filename: str
    file_type: str
    raw_text: Optional[str] = None
    parsed_data: Optional[dict] = None
    created_at: str

    class Config:
        from_attributes = True


class ResumeListResponse(BaseModel):
    resumes: list[ResumeResponse]
    total: int
