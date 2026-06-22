from pydantic import BaseModel
from typing import Optional


class CreateInterviewRequest(BaseModel):
    category: str = "private_enterprise"  # private_enterprise | civil_service | institution
    resume_id: Optional[str] = None
    jd_id: Optional[str] = None
    difficulty: str = "mid"
    category_config: dict = {}  # {province, position_category, level, position_name}
    question_count: Optional[int] = None


class QuestionItem(BaseModel):
    order_index: int
    question_text: str
    question_type: str
    # 答题结果（评分后才有）
    user_answer_transcript: Optional[str] = None
    duration_seconds: Optional[int] = None
    thinking_duration_seconds: Optional[int] = None
    ai_score: Optional[int] = None
    score_detail: Optional[dict] = None
    ai_evaluation: Optional[str] = None
    reference_answer: Optional[str] = None
    improvement_suggestion: Optional[str] = None
    is_favorited: Optional[bool] = False


class InterviewResponse(BaseModel):
    id: str
    category: str = "private_enterprise"
    category_config: Optional[dict] = None
    status: str
    difficulty: str
    total_score: Optional[int] = None
    dimension_scores: Optional[dict] = None
    ai_overview: Optional[str] = None
    resume_suggestions: Optional[str] = None
    questions: list[QuestionItem] = []
    created_at: str
    scoring_status: Optional[str] = None
    scoring_progress: Optional[str] = None
    scoring_error: Optional[str] = None

    class Config:
        from_attributes = True


class SubmitAnswerRequest(BaseModel):
    order_index: int
    answer_transcript: str = ""
    duration_seconds: int = 0
    thinking_duration_seconds: int = 0
