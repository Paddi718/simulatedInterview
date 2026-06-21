"""
WebSocket 处理器 — 面试实时语音交互
架构参考: F:/AI_study/PythonProject/20260530_AI_CRM

消息协议:
  客户端 → 服务器 (binary): PCM 音频数据 (Int16, 16kHz, mono)
  客户端 → 服务器 (text):
    {"type": "audio_start"}          — 开始录音（重置缓冲区）
    {"type": "audio_stop"}           — 结束录音（最终 ASR）
    {"type": "tts_request", ...}     — TTS 语音合成请求
    {"type": "submit_answer", ...}   — 提交回答
    {"type": "ping"}                 — 心跳
  服务器 → 客户端 (text):
    {"type": "asr_result", "text": "...", "final": true/false}
    {"type": "pong"}
    {"type": "audio_started"}
"""
import json
import uuid
import time
import asyncio
import struct
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.database import async_session_factory
from app.services.tts_service import synthesize_speech
from app.services.interview_engine import InterviewEngine
from app.services.vad_service import get_vad

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


async def _run_funasr(pcm_bytes: bytes) -> str:
    """对 PCM 音频 (16kHz, 16bit, mono) 运行 FunASR 识别"""
    if len(pcm_bytes) < 3200:  # 至少 100ms 音频
        return ""

    from app.services.asr_service import transcribe_pcm
    try:
        text = await transcribe_pcm(pcm_bytes)
        return text
    except Exception:
        return ""


@router.websocket("/api/ws/interview/{interview_id}")
async def interview_websocket(websocket: WebSocket, interview_id: str):
    await websocket.accept()

    if not await _verify_token(websocket):
        await websocket.send_json({"type": "error", "message": "Unauthorized"})
        await websocket.close()
        return

    # 初始化 VAD
    vad = get_vad()
    vad_state = vad.reset_state()

    # 语音段缓冲区（累积有语音的 PCM）
    speech_buffer = bytearray()
    # 用于最终 ASR 的完整音频
    full_audio = bytearray()
    # 是否正在录音
    is_recording = False

    try:
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.receive":
                # === 二进制消息：PCM 音频数据 ===
                if "bytes" in message:
                    pcm_chunk = message["bytes"]

                    if not is_recording:
                        continue

                    # 累积完整音频（用于最终 ASR）
                    full_audio.extend(pcm_chunk)

                    # VAD 处理
                    vad_state = vad.process_pcm(vad_state, pcm_chunk)

                    # 检测到语音停止（一句话说完）
                    if vad_state.get("client_voice_stop"):
                        # 提取当前语音段（从 speech_buffer 中）
                        segment_pcm = bytes(speech_buffer)
                        speech_buffer.clear()
                        vad_state["client_voice_stop"] = False
                        vad_state["client_have_voice"] = False

                        # 异步运行 FunASR
                        if len(segment_pcm) > 3200:
                            text = await _run_funasr(segment_pcm)
                            if text:
                                try:
                                    await websocket.send_json({
                                        "type": "asr_result",
                                        "text": text,
                                        "final": False,
                                    })
                                except Exception:
                                    pass

                    # 如果在说话，累积语音段
                    if vad_state.get("client_have_voice"):
                        speech_buffer.extend(pcm_chunk)

                # === 文本消息 ===
                elif "text" in message:
                    data = json.loads(message["text"])
                    msg_type = data.get("type")

                    if msg_type == "ping":
                        await websocket.send_json({"type": "pong"})

                    elif msg_type == "audio_start":
                        # 开始录音 — 重置所有缓冲区
                        vad_state = vad.reset_state()
                        speech_buffer.clear()
                        full_audio.clear()
                        is_recording = True
                        await websocket.send_json({"type": "audio_started"})

                    elif msg_type == "audio_stop":
                        # 停止录音 — 对剩余语音 + 全部音频做最终 ASR
                        is_recording = False

                        # 1. 处理 speech_buffer 中剩余的语音
                        remaining = bytes(speech_buffer)
                        speech_buffer.clear()
                        if len(remaining) > 3200:
                            text = await _run_funasr(remaining)
                            if text:
                                try:
                                    await websocket.send_json({
                                        "type": "asr_result",
                                        "text": text,
                                        "final": False,
                                    })
                                except Exception:
                                    pass

                        # 2. 对完整音频做最终 ASR（用于提交）
                        full = bytes(full_audio)
                        if len(full) > 3200:
                            final_text = await _run_funasr(full)
                            if final_text:
                                try:
                                    await websocket.send_json({
                                        "type": "asr_result",
                                        "text": final_text,
                                        "final": True,
                                    })
                                except Exception:
                                    pass
                        elif not remaining:
                            # 没有检测到任何语音
                            try:
                                await websocket.send_json({
                                    "type": "asr_result",
                                    "text": "",
                                    "final": True,
                                })
                            except Exception:
                                pass

                    elif msg_type == "tts_request":
                        # TTS 语音合成：将文本转为语音返回
                        text = data.get("text", "")
                        voice = data.get("voice", "zh-CN-XiaoxiaoNeural")
                        try:
                            audio_data = await synthesize_speech(text, voice)
                            await websocket.send_bytes(audio_data)
                        except Exception:
                            await websocket.send_json({
                                "type": "tts_error",
                                "message": "TTS synthesis failed",
                            })

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
    finally:
        is_recording = False
