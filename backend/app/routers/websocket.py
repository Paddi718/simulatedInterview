"""
WebSocket 处理器 — 面试实时语音交互
架构参考: F:/AI_study/PythonProject/20260530_AI_CRM

消息协议:
  客户端 -> 服务器 (binary): PCM audio (Int16, 16kHz, mono)
  客户端 -> 服务器 (text):
    {"type": "audio_start"}
    {"type": "audio_stop"}
    {"type": "tts_request", "text": "...", "voice": "..."}
    {"type": "submit_answer", "order_index": int, "transcript": "...", "duration": int}
    {"type": "score_question", "order_index": int}
    {"type": "ping"}
  服务器 -> 客户端 (text):
    {"type": "asr_result", "text": "...", "final": bool}
    {"type": "asr_error", "message": "..."}
    {"type": "answer_saved", "order_index": int}
    {"type": "question_score", "scores": {...}}
    {"type": "warmup_done"}
    {"type": "pong"}
"""
import json
import uuid
import asyncio
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.database import async_session_factory
from app.services.tts_service import synthesize_speech
from app.services.interview_engine import InterviewEngine
from app.services.vad_service import get_vad

logger = logging.getLogger(__name__)
router = APIRouter()

# 全局标志：模型是否已预热
_warmed_up = False
_warmup_lock = asyncio.Lock()


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


async def _warmup_asr():
    """预热 FunASR 模型（首次加载慢，需 10-30s）"""
    global _warmed_up
    if _warmed_up:
        return True
    async with _warmup_lock:
        if _warmed_up:
            return True
        try:
            from app.services.asr_service import warmup
            await warmup()
            _warmed_up = True
            logger.info("ASR model warmed up successfully")
            return True
        except Exception as e:
            logger.error(f"ASR warmup failed: {e}")
            return False


async def _run_funasr(pcm_bytes: bytes) -> str:
    """对 PCM 音频运行 FunASR（非阻塞）"""
    if len(pcm_bytes) < 3200:
        return ""
    try:
        from app.services.asr_service import transcribe_pcm
        text = await transcribe_pcm(pcm_bytes)
        return text
    except Exception as e:
        logger.warning(f"ASR failed: {e}")
        return ""


async def _score_single_question(db, interview_id: uuid.UUID, order_index: int) -> dict:
    """评分单道题并返回结果"""
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


@router.websocket("/api/ws/interview/{interview_id}")
async def interview_websocket(websocket: WebSocket, interview_id: str):
    await websocket.accept()

    if not await _verify_token(websocket):
        await websocket.send_json({"type": "error", "message": "Unauthorized"})
        await websocket.close()
        return

    # 后台预热 ASR 模型
    warmup_task = asyncio.create_task(_warmup_asr())

    vad = get_vad()
    vad_state = vad.reset_state()
    speech_buffer = bytearray()
    full_audio = bytearray()
    is_recording = False
    asr_tasks: list[asyncio.Task] = []

    async def _do_asr_and_send(pcm: bytes, is_final: bool):
        """后台 ASR 任务：识别并发送结果"""
        text = await _run_funasr(pcm)
        if text:
            try:
                await websocket.send_json({
                    "type": "asr_result",
                    "text": text,
                    "final": is_final,
                })
            except Exception:
                pass
        elif is_final:
            # 最终识别也失败时，发送空结果让前端停止等待
            try:
                await websocket.send_json({
                    "type": "asr_result",
                    "text": "",
                    "final": True,
                })
            except Exception:
                pass

    try:
        # 等待预热完成再开始处理
        await warmup_task
        await websocket.send_json({"type": "warmup_done"})

        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.receive":
                # === Binary: PCM audio ===
                if "bytes" in message:
                    pcm_chunk = message["bytes"]
                    if not is_recording:
                        continue

                    full_audio.extend(pcm_chunk)
                    vad_state = vad.process_pcm(vad_state, pcm_chunk)

                    # 检测到一句话说完（voice_stop）
                    if vad_state.get("client_voice_stop"):
                        vad_state["client_voice_stop"] = False
                        segment_pcm = bytes(speech_buffer)
                        speech_buffer.clear()

                        if len(segment_pcm) > 3200:
                            # 后台运行 ASR，不阻塞接收循环
                            task = asyncio.create_task(
                                _do_asr_and_send(segment_pcm, False)
                            )
                            asr_tasks.append(task)

                    # 持续累积有语音的 PCM
                    if vad_state.get("client_have_voice"):
                        speech_buffer.extend(pcm_chunk)

                # === Text messages ===
                elif "text" in message:
                    data = json.loads(message["text"])
                    msg_type = data.get("type")

                    if msg_type == "ping":
                        await websocket.send_json({"type": "pong"})

                    elif msg_type == "audio_start":
                        vad_state = vad.reset_state()
                        speech_buffer.clear()
                        full_audio.clear()
                        is_recording = True

                    elif msg_type == "audio_stop":
                        is_recording = False

                        # 等待所有进行中的 ASR 任务完成
                        if asr_tasks:
                            await asyncio.gather(*asr_tasks, return_exceptions=True)
                            asr_tasks.clear()

                        # 处理 speech_buffer 中剩余的语音
                        remaining = bytes(speech_buffer)
                        speech_buffer.clear()

                        final_texts = []
                        if len(remaining) > 3200:
                            t = await _run_funasr(remaining)
                            if t:
                                final_texts.append(t)
                                try:
                                    await websocket.send_json({
                                        "type": "asr_result",
                                        "text": t,
                                        "final": False,
                                    })
                                except Exception:
                                    pass

                        # 对整个录音做最终 ASR
                        full = bytes(full_audio)
                        if len(full) > 3200:
                            final_text = await _run_funasr(full)
                            display_text = final_text or " ".join(final_texts)
                            try:
                                await websocket.send_json({
                                    "type": "asr_result",
                                    "text": display_text,
                                    "final": True,
                                })
                            except Exception:
                                pass
                        else:
                            try:
                                await websocket.send_json({
                                    "type": "asr_result",
                                    "text": "",
                                    "final": True,
                                })
                            except Exception:
                                pass

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
                        # 单题评分 + 返回反馈和参考答案
                        order_index = data.get("order_index", 1)
                        async with async_session_factory() as db:
                            try:
                                scores = await _score_single_question(
                                    db, uuid.UUID(interview_id), order_index
                                )
                                await websocket.send_json({
                                    "type": "question_score",
                                    **scores,
                                })
                            except Exception as e:
                                await websocket.send_json({
                                    "type": "question_score",
                                    "error": str(e),
                                })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        is_recording = False
        for task in asr_tasks:
            task.cancel()
