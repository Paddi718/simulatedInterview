import json
import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import async_session_factory
from app.services.tts_service import synthesize_speech
from app.services.interview_engine import InterviewEngine

router = APIRouter()


async def _verify_token(websocket: WebSocket) -> bool:
    """从 WebSocket 查询参数验证 token"""
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

            if message.get("type") == "websocket.receive":
                if "text" in message:
                    data = json.loads(message["text"])
                    msg_type = data.get("type")

                    if msg_type == "ping":
                        await websocket.send_json({"type": "pong"})

                    elif msg_type == "tts_request":
                        text = data.get("text", "")
                        voice = data.get("voice", "zhitian")
                        audio_data = await synthesize_speech(text, voice)
                        await websocket.send_bytes(audio_data)

                    elif msg_type == "submit_answer":
                        async with async_session_factory() as db:
                            question = await InterviewEngine.submit_answer(
                                db,
                                uuid.UUID(data["question_id"]),
                                transcript=data.get("transcript", ""),
                                duration=data.get("duration", 0),
                            )
                            await websocket.send_json({
                                "type": "answer_saved",
                                "question_id": data["question_id"],
                            })

                    elif msg_type == "next_question":
                        index = data.get("index", 1)
                        async with async_session_factory() as db:
                            q = await InterviewEngine.get_current_question(
                                db, uuid.UUID(interview_id), index
                            )
                            if q:
                                await websocket.send_json({
                                    "type": "question",
                                    "order_index": q.order_index,
                                    "question_text": q.question_text,
                                    "question_type": q.question_type,
                                })
                            else:
                                await websocket.send_json({
                                    "type": "interview_complete",
                                    "message": "All questions answered",
                                })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
