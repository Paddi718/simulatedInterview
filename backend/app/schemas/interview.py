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
    # 答题结果（评分后才有）
    user_answer_transcript: Optional[str] = None
    duration_seconds: Optional[int] = None
    ai_score: Optional[int] = None
    score_detail: Optional[dict] = None
    ai_evaluation: Optional[str] = None
    reference_answer: Optional[str] = None
    improvement_suggestion: Optional[str] = None


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
    order_index: int
    answer_transcript: str = ""
    duration_seconds: int = 0
