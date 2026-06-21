import json
import uuid
import tempfile
import os
import subprocess
import asyncio
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


async def _convert_webm_to_wav(webm_bytes: bytes) -> bytes:
    """使用 ffmpeg 将 webm/opus 音频转为 16kHz 16bit mono WAV"""
    with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as webm_f:
        webm_f.write(webm_bytes)
        webm_path = webm_f.name

    wav_path = webm_path + '.wav'
    try:
        # Convert to 16kHz 16bit mono WAV via ffmpeg
        proc = await asyncio.create_subprocess_exec(
            'ffmpeg', '-y', '-i', webm_path,
            '-ar', '16000', '-ac', '1', '-f', 'wav',
            wav_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()

        if os.path.exists(wav_path):
            with open(wav_path, 'rb') as f:
                wav_bytes = f.read()
            return wav_bytes
        return b''
    finally:
        # Clean up temp files
        for p in (webm_path, wav_path):
            try:
                os.unlink(p)
            except OSError:
                pass


async def _run_asr_on_webm(webm_bytes: bytes) -> str:
    """运行 FunASR 对 webm 音频进行转写"""
    if len(webm_bytes) < 1000:  # Skip tiny chunks
        return ''

    wav_bytes = await _convert_webm_to_wav(webm_bytes)
    if not wav_bytes:
        return ''

    # Parse WAV header to extract PCM data (skip 44-byte header)
    if len(wav_bytes) > 44 and wav_bytes[:4] == b'RIFF':
        pcm_bytes = wav_bytes[44:]
    else:
        pcm_bytes = wav_bytes

    if len(pcm_bytes) < 1600:  # Less than 100ms — skip
        return ''

    from app.services.asr_service import transcribe_pcm
    text = await transcribe_pcm(pcm_bytes)
    return text


@router.websocket("/api/ws/interview/{interview_id}")
async def interview_websocket(websocket: WebSocket, interview_id: str):
    await websocket.accept()

    if not await _verify_token(websocket):
        await websocket.send_json({"type": "error", "message": "Unauthorized"})
        await websocket.close()
        return

    # Audio accumulation buffer
    audio_chunks: list[bytes] = []
    asr_task: asyncio.Task | None = None
    last_asr_text = ''

    try:
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.receive":
                # --- Binary: audio chunk ---
                if "bytes" in message:
                    chunk = message["bytes"]
                    audio_chunks.append(chunk)

                # --- Text/JSON messages ---
                elif "text" in message:
                    data = json.loads(message["text"])
                    msg_type = data.get("type")

                    if msg_type == "ping":
                        await websocket.send_json({"type": "pong"})

                    elif msg_type == "tts_request":
                        text = data.get("text", "")
                        voice = data.get("voice", "zh-CN-XiaoxiaoNeural")
                        audio_data = await synthesize_speech(text, voice)
                        await websocket.send_bytes(audio_data)

                    elif msg_type == "audio_start":
                        # Start a new recording session — clear previous buffers
                        audio_chunks.clear()
                        last_asr_text = ''
                        if asr_task and not asr_task.done():
                            asr_task.cancel()
                        await websocket.send_json({"type": "audio_started"})

                    elif msg_type == "audio_stop":
                        # Recording stopped — run ASR on accumulated audio
                        if audio_chunks:
                            combined = b''.join(audio_chunks)
                            audio_chunks.clear()

                            # Run ASR in background and send result
                            async def do_asr():
                                try:
                                    text = await _run_asr_on_webm(combined)
                                    if text:
                                        try:
                                            await websocket.send_json({
                                                "type": "asr_result",
                                                "text": text,
                                                "final": True,
                                            })
                                        except Exception:
                                            pass
                                except Exception:
                                    pass

                            # We need to run in background since send_json in websocket.receive
                            # context might cause issues. Use asyncio.create_task here.
                            # Actually, we're in the receive loop so we can't easily send
                            # concurrently. Let's do it synchronously.
                            try:
                                text = await _run_asr_on_webm(combined)
                                await websocket.send_json({
                                    "type": "asr_result",
                                    "text": text,
                                    "final": True,
                                })
                            except Exception:
                                pass

                    elif msg_type == "submit_answer":
                        async with async_session_factory() as db:
                            question = await InterviewEngine.submit_answer(
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
