from pydantic import BaseModel, Field
from typing import Optional


class AdminStats(BaseModel):
    total_users: int
    today_interviews: int
    total_interviews: int
    active_users_7d: int


class AdminUserItem(BaseModel):
    id: str
    username: str
    email: str | None = None
    is_admin: bool = False
    is_active: bool = True
    is_verified: bool = False
    created_at: str
    interview_count: int = 0


class AdminUserDetail(BaseModel):
    id: str
    username: str
    email: str | None = None
    is_admin: bool = False
    is_active: bool = True
    is_verified: bool = False
    created_at: str
    stats: dict  # {total_interviews, avg_score, by_category}


class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int
    total_pages: int


class UpdateUserRequest(BaseModel):
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None


class AdminInterviewItem(BaseModel):
    id: str
    user_id: str
    username: str
    interview_category: str | None = "private_enterprise"
    position: str | None = None
    difficulty: str | None = "mid"
    total_score: int | None = None
    status: str | None = None
    question_count: int | None = None
    created_at: str
