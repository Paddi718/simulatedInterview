import httpx
from app.config import get_settings

settings = get_settings()

SUPPORTED_VOICES = [
    {"id": "zhitian", "name": "知甜", "gender": "female"},
    {"id": "zhijing", "name": "知婧", "gender": "female"},
    {"id": "zhixia", "name": "知夏", "gender": "female"},
    {"id": "zhiyun", "name": "知云", "gender": "male"},
]


async def synthesize_speech(text: str, voice: str = "zhitian", speed: float = 1.0) -> bytes:
    """TTS 文本转语音，返回 WAV 音频数据"""
    url = "https://tts-api.aliyuncs.com/v1/tts"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.tts_api_key}",
    }
    payload = {
        "text": text,
        "voice": voice,
        "speed": speed,
        "format": "wav",
        "sample_rate": 16000,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        return resp.content


async def stream_synthesize(text: str, voice: str = "zhitian", speed: float = 1.0):
    """流式 TTS，返回音频流"""
    url = "https://tts-api.aliyuncs.com/v1/tts"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.tts_api_key}",
    }
    payload = {
        "text": text,
        "voice": voice,
        "speed": speed,
        "format": "wav",
        "enable_stream": True,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as resp:
            async for chunk in resp.aiter_bytes():
                yield chunk
