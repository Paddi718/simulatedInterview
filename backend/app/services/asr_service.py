import asyncio
import re
from typing import AsyncGenerator, Optional
from app.config import get_settings

settings = get_settings()


# ---------------------------------------------------------------------------
# 本地 FunASR 模型（懒加载，避免启动时阻塞）
# ---------------------------------------------------------------------------
_model = None
_lock = asyncio.Lock()


def _get_model():
    """懒加载 FunASR SenseVoiceSmall 模型"""
    global _model
    if _model is not None:
        return _model

    from funasr import AutoModel

    model_dir = settings.asr_model_dir or "models/SenseVoiceSmall"
    _model = AutoModel(
        model=model_dir,
        vad_kwargs={"max_single_segment_time": 30000},
        disable_update=True,
        hub="hf",
    )
    return _model


# ---------------------------------------------------------------------------
# 结果解析：去掉 FunASR 输出的语言/情绪/事件标签
# ---------------------------------------------------------------------------
_TAG_PATTERN = re.compile(r"<\|[^|]*\|>")


def _clean_text(raw: str) -> str:
    """移除 FunASR 输出的 <|zh|><|SAD|><|Speech|><|withitn|> 等标签"""
    return _TAG_PATTERN.sub("", raw).strip()


# ---------------------------------------------------------------------------
# 离线识别：给定完整 PCM 音频，返回转写文本
# ---------------------------------------------------------------------------
async def transcribe_pcm(pcm_bytes: bytes, language: str = "auto") -> str:
    """
    对完整 PCM 音频（16kHz, 16bit, mono）进行离线识别。
    通过 asyncio.to_thread 将同步阻塞的模型调用放入线程池。
    """
    model = _get_model()

    result = await asyncio.to_thread(
        model.generate,
        input=pcm_bytes,
        cache={},
        language=language,
        use_itn=True,        # 逆文本归一化（"二零二四" -> "2024"）
        batch_size_s=60,     # 60 秒批处理窗口
    )

    if result and len(result) > 0:
        return _clean_text(result[0].get("text", ""))
    return ""


# ---------------------------------------------------------------------------
# 文件识别：读取音频文件并转写
# ---------------------------------------------------------------------------
async def transcribe_file(audio_path: str) -> str:
    """对磁盘上的音频文件进行识别"""
    with open(audio_path, "rb") as f:
        pcm_bytes = f.read()
    return await transcribe_pcm(pcm_bytes)


# ---------------------------------------------------------------------------
# 实时识别（兼容旧接口 — 面试场景用离线模式即可）
# ---------------------------------------------------------------------------
async def realtime_asr(
    audio_stream: AsyncGenerator[bytes, None],
) -> AsyncGenerator[str, None]:
    """
    接收音频流，在流结束后返回最终识别结果。
    由于 FunASR 本地模式不支持逐帧流式输出，这里是"模拟实时"：
    累积所有 PCM 块，最后一次性识别。
    """
    chunks = []
    async for chunk in audio_stream:
        chunks.append(chunk)

    if chunks:
        pcm_bytes = b"".join(chunks)
        text = await transcribe_pcm(pcm_bytes)
        yield text


# ---------------------------------------------------------------------------
# 模型预热（可选，首次调用时自动懒加载）
# ---------------------------------------------------------------------------
async def warmup():
    """提前加载模型，避免首次调用时的冷启动延迟"""
    await asyncio.to_thread(_get_model)
