from pydantic import BaseModel
from typing import Optional


class CreateInterviewRequest(BaseModel):
    resume_id: str
    jd_id: str
    difficulty: str = "mid"


class QuestionItem(BaseModel):
    order_index: int
    question_text: str
    question_type: str


class InterviewResponse(BaseModel):
    id: str
    status: str
    difficulty: str
    total_score: Optional[int] = None
    dimension_scores: Optional[dict] = None
    ai_overview: Optional[str] = None
    resume_suggestions: Optional[str] = None
    questions: list[QuestionItem] = []
    created_at: str

    class Config:
        from_attributes = True


class SubmitAnswerRequest(BaseModel):
    question_id: str
    answer_transcript: str = ""
    duration_seconds: int = 0
