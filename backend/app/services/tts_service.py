import io
import edge_tts
from app.config import get_settings

settings = get_settings()

SUPPORTED_VOICES = [
    {"id": "zh-CN-XiaoxiaoNeural", "name": "晓晓", "gender": "female", "style": "活泼"},
    {"id": "zh-CN-XiaoyiNeural", "name": "晓伊", "gender": "female", "style": "温柔"},
    {"id": "zh-CN-YunyangNeural", "name": "云扬", "gender": "male", "style": "专业"},
    {"id": "zh-CN-YunjianNeural", "name": "云健", "gender": "male", "style": "运动"},
    {"id": "zh-CN-YunxiNeural", "name": "云希", "gender": "male", "style": "叙述"},
    {"id": "zh-CN-YunxiaNeural", "name": "云夏", "gender": "male", "style": "少年"},
]

# Speed mapping: our 0.5-2.0 range -> edge-tts rate string
# edge-tts rate: -50% to +100%, 0% = default
def _speed_to_rate(speed: float) -> str:
    if speed <= 0.5:
        return "-50%"
    elif speed <= 0.75:
        return "-25%"
    elif speed >= 2.0:
        return "+100%"
    elif speed >= 1.75:
        return "+75%"
    elif speed >= 1.5:
        return "+50%"
    elif speed >= 1.25:
        return "+25%"
    else:
        return "+0%"


async def synthesize_speech(text: str, voice: str = "zh-CN-XiaoxiaoNeural", speed: float = 1.0) -> bytes:
    """Edge TTS 文本转语音，带缓存：先查缓存，命中直接返回，未命中则联网合成后写缓存"""
    # 1. 查缓存
    from app.services.audio_cache import get_cached_tts, save_tts_cache
    cached = await get_cached_tts(text, voice, speed)
    if cached is not None:
        return cached

    # 2. 缓存未命中 → 联网合成（截断长文本，Edge TTS 对过长文本会失败）
    rate = _speed_to_rate(speed)
    tts_text = text[:800] if len(text) > 800 else text
    communicate = edge_tts.Communicate(tts_text, voice, rate=rate)

    buffer = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buffer.write(chunk["data"])

    audio_bytes = buffer.getvalue()

    # 3. 写入缓存
    if audio_bytes and len(audio_bytes) > 220:
        await save_tts_cache(text, voice, speed, audio_bytes)

    return audio_bytes


async def stream_synthesize(text: str, voice: str = "zh-CN-XiaoxiaoNeural", speed: float = 1.0):
    """Edge TTS 流式合成（不走缓存，因为流式场景需要即时响应）"""
    rate = _speed_to_rate(speed)
    communicate = edge_tts.Communicate(text, voice, rate=rate)

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            yield chunk["data"]
