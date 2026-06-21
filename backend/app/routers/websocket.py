"""
WebSocket — 面试 TTS + 答题
简化版：只处理 TTS 语音合成和答题提交
"""
import json
import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.database import async_session_factory
from app.services.tts_service import synthesize_speech
from app.services.interview_engine import InterviewEngine

router = APIRouter()


async def _verify_token(websocket: WebSocket) -> bool:
    token = websocket.query_params.get("token")
    if not token:
        return False
    try:
        from jose import jwt
        from app.config import get_settings
        settings = get_settings()
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        websocket.state.user_id = payload.get("sub")
        return True
    except Exception:
        return False


@router.websocket("/api/ws/interview/{interview_id}")
async def interview_websocket(websocket: WebSocket, interview_id: str):
    await websocket.accept()

    if not await _verify_token(websocket):
        await websocket.send_json({"type": "error", "message": "Unauthorized"})
        await websocket.close()
        return

    try:
        while True:
            message = await websocket.receive()
            if "text" not in message:
                continue

            data = json.loads(message["text"])
            msg_type = data.get("type")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "tts_request":
                text = data.get("text", "")
                voice = data.get("voice", "zh-CN-XiaoxiaoNeural")
                try:
                    audio_data = await synthesize_speech(text, voice)
                    await websocket.send_bytes(audio_data)
                except Exception:
                    pass

            elif msg_type == "submit_answer":
                async with async_session_factory() as db:
                    await InterviewEngine.submit_answer(
                        db,
                        uuid.UUID(interview_id),
                        data["order_index"],
                        transcript=data.get("transcript", ""),
                        duration=data.get("duration", 0),
                    )
                    await websocket.send_json({
                        "type": "answer_saved",
                        "order_index": data["order_index"],
                    })

            elif msg_type == "score_question":
                order_index = data.get("order_index", 1)
                async with async_session_factory() as db:
                    from app.routers.websocket import _score_single_question
                    try:
                        scores = await _score_single_question(
                            db, uuid.UUID(interview_id), order_index
                        )
                        await websocket.send_json({"type": "question_score", **scores})
                    except Exception as e:
                        await websocket.send_json({"type": "question_score", "error": str(e)})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


async def _score_single_question(db, interview_id: uuid.UUID, order_index: int) -> dict:
    from sqlalchemy import select
    from app.models.interview_question import InterviewQuestion
    from app.models.interview import Interview
    from app.models.resume import Resume
    from app.models.job_description import JobDescription

    q_result = await db.execute(
        select(InterviewQuestion).where(
            InterviewQuestion.interview_id == interview_id,
            InterviewQuestion.order_index == order_index,
        )
    )
    question = q_result.scalar_one_or_none()
    if not question:
        return {"error": "Question not found"}

    i_result = await db.execute(select(Interview).where(Interview.id == interview_id))
    interview = i_result.scalar_one_or_none()

    resume_data, jd_data = {}, {}
    if interview:
        r_result = await db.execute(select(Resume).where(Resume.id == interview.resume_id))
        resume = r_result.scalar_one_or_none()
        resume_data = resume.parsed_data if resume else {}
        j_result = await db.execute(select(JobDescription).where(JobDescription.id == interview.jd_id))
        jd = j_result.scalar_one_or_none()
        jd_data = jd.parsed_data if jd else {}

    from app.services.scoring_service import score_question
    scores = await score_question(question, resume_data, jd_data)

    question.ai_score = scores.get("total_score", 0)
    question.score_detail = {k: v for k, v in scores.items()
                             if k in ["content_completeness", "professionalism",
                                      "expression", "star_method"]}
    question.ai_evaluation = scores.get("evaluation", "")
    question.reference_answer = scores.get("reference_answer", "")
    question.improvement_suggestion = scores.get("improvement_suggestion", "")
    await db.commit()

    return {
        "order_index": order_index,
        "total_score": question.ai_score,
        "dimension_scores": question.score_detail,
        "evaluation": question.ai_evaluation,
        "reference_answer": question.reference_answer,
        "improvement_suggestion": question.improvement_suggestion,
    }
