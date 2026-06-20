import json
from datetime import datetime
from typing import AsyncGenerator
import websockets
from app.config import get_settings

settings = get_settings()


async def realtime_asr(audio_stream: AsyncGenerator[bytes, None]) -> AsyncGenerator[str, None]:
    """
    实时语音识别：接收音频流，返回实时字幕文本
    使用 WebSocket 连接阿里云实时语音识别服务
    """
    gateway = "wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1"
    task_id = datetime.now().strftime("%Y%m%d%H%M%S")

    async with websockets.connect(gateway) as ws:
        # 发送启动帧
        start_payload = {
            "header": {
                "message_id": task_id,
                "task_id": task_id,
                "namespace": "SpeechRecognizer",
                "name": "StartTranscription",
                "app_key": settings.aliyun_asr_app_key,
            },
            "payload": {
                "enable_intermediate_result": True,
                "enable_punctuation": True,
                "sample_rate": 16000,
                "format": "opus",
            },
        }
        await ws.send(json.dumps(start_payload))
        resp = json.loads(await ws.recv())
        if resp["header"]["name"] != "TranscriptionStarted":
            raise Exception(f"ASR start failed: {resp}")

        # 发送音频数据
        async for chunk in audio_stream:
            await ws.send(chunk)

        # 发送结束帧
        end_payload = {
            "header": {
                "message_id": task_id,
                "task_id": task_id,
                "namespace": "SpeechRecognizer",
                "name": "StopTranscription",
                "app_key": settings.aliyun_asr_app_key,
            },
            "payload": {},
        }
        await ws.send(json.dumps(end_payload))

        # 接收结果
        async for message in ws:
            result = json.loads(message)
            name = result["header"]["name"]
            if name == "TranscriptionResultChanged":
                yield result["payload"]["result"]
            elif name == "TranscriptionCompleted":
                yield result["payload"]["result"]
                break
            elif name == "TaskFailed":
                raise Exception(f"ASR failed: {result['header'].get('message', '')}")
