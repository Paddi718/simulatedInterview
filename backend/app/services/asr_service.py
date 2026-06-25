"""
ASR 语音转文字服务 — 双后端：硅基流动在线 API / 本地 FunASR。

通过 system_configs 表的 `asr_provider` 配置选择后端：
  - "siliconflow"（默认）：调用硅基流动在线 API（FunAudioLLM/SenseVoiceSmall）
  - "local"：加载本地 FunASR 模型（开发调试用，需安装 funasr/torch）

对外接口保持不变：transcribe_pcm(pcm_bytes, language) → str。
两个后端的 import 都延迟到实际使用时，确保未选中的后端不会被加载
（服务器不装 funasr 时，选 siliconflow 永不 import funasr）。
"""
import asyncio
import os
import re
import struct
import time
from typing import AsyncGenerator, Optional

from app.config import get_settings

settings = get_settings()

# ---------------------------------------------------------------------------
# 并发控制：防止 OOM / 保护在线 API 速率
# ---------------------------------------------------------------------------
_asr_semaphore: Optional[asyncio.Semaphore] = None


def _get_asr_semaphore() -> Optional[asyncio.Semaphore]:
    global _asr_semaphore
    if _asr_semaphore is not None:
        return _asr_semaphore
    limit = int(os.getenv("ASR_MAX_CONCURRENT", str(settings.asr_max_concurrent)) or "0")
    if limit > 0:
        _asr_semaphore = asyncio.Semaphore(limit)
    return _asr_semaphore


# ---------------------------------------------------------------------------
# DB 配置读取（带内存缓存，避免每段语音查库）
# 优先级：DB(system_configs) > 环境变量 > 默认值
# ---------------------------------------------------------------------------
_config_cache: Optional[dict] = None
_config_cache_ts: float = 0.0
_CONFIG_TTL = 300  # 5 分钟

# 默认值与 env 回退映射
_ASR_ENV_MAP = {
    "asr_provider": ("ASR_PROVIDER", "siliconflow"),
    "asr_siliconflow_api_key": ("ASR_SILICONFLOW_API_KEY", ""),
    "asr_siliconflow_model": ("ASR_SILICONFLOW_MODEL", "FunAudioLLM/SenseVoiceSmall"),
    "asr_siliconflow_base_url": ("ASR_SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1"),
}


async def _read_db_config(key: str) -> Optional[str]:
    """从 system_configs 表异步读取单个配置值。失败返回 None。"""
    try:
        from sqlalchemy import text
        from app.database import async_session_factory
        async with async_session_factory() as db:
            r = await db.execute(
                text("SELECT value FROM system_configs WHERE key = :k"), {"k": key}
            )
            row = r.fetchone()
            return row[0] if row else None
    except Exception:
        return None


async def _load_asr_config() -> dict:
    """
    读取 ASR 配置（带 5 分钟 TTL 缓存）。
    优先级：DB > 环境变量 > 默认值。
    """
    global _config_cache, _config_cache_ts
    now = time.monotonic()
    if _config_cache is not None and (now - _config_cache_ts) < _CONFIG_TTL:
        return _config_cache

    cfg: dict = {}
    for key, (env_name, default) in _ASR_ENV_MAP.items():
        db_val = await _read_db_config(key)
        if db_val:  # DB 非空优先
            cfg[key] = db_val
        else:
            cfg[key] = os.getenv(env_name, default)
    _config_cache = cfg
    _config_cache_ts = now
    return cfg


def _invalidate_asr_config_cache():
    """管理员后台更新配置后调用，立即失效缓存。"""
    global _config_cache, _config_cache_ts
    _config_cache = None
    _config_cache_ts = 0.0


# ---------------------------------------------------------------------------
# 结果解析：去掉 SenseVoice 输出的语言/情绪/事件标签（<|zh|><|SAD|>...）
# ---------------------------------------------------------------------------
_TAG_PATTERN = re.compile(r"<\|[^|]*\|>")


def _clean_text(raw: str) -> str:
    """移除 SenseVoice 输出的 <|zh|><|SAD|><|Speech|><|withitn|> 等标签"""
    return _TAG_PATTERN.sub("", raw).strip()


# ---------------------------------------------------------------------------
# 裸 PCM → WAV（16kHz, 16bit, mono）
# 在线 API 需要完整音频文件，本地后端收裸 PCM，所以在线分支要先包头。
# ---------------------------------------------------------------------------
def _pcm_to_wav(pcm: bytes) -> bytes:
    """给 16kHz/16bit/mono 裸 PCM 加 44 字节标准 WAV 头。"""
    if not pcm:
        return b""
    n = len(pcm)
    sample_rate = 16000
    bits_per_sample = 16
    channels = 1
    byte_rate = sample_rate * channels * bits_per_sample // 8
    block_align = channels * bits_per_sample // 8
    # RIFF header + fmt chunk + data chunk
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + n,
        b"WAVE",
        b"fmt ",
        16,                   # PCM chunk size
        1,                    # audio format = PCM
        channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b"data",
        n,
    )
    return header + pcm


# ---------------------------------------------------------------------------
# 离线识别入口（对外接口不变）
# ---------------------------------------------------------------------------
async def transcribe_pcm(pcm_bytes: bytes, language: str = "auto") -> str:
    """
    对完整 PCM 音频（16kHz, 16bit, mono）进行识别，返回转写文本。
    根据 asr_provider 配置选择在线 API 或本地模型。
    通过 ASR_MAX_CONCURRENT 限制并行数。
    """
    sem = _get_asr_semaphore()
    if sem:
        async with sem:
            return await _dispatch(pcm_bytes, language)
    return await _dispatch(pcm_bytes, language)


async def _dispatch(pcm_bytes: bytes, language: str) -> str:
    cfg = await _load_asr_config()
    provider = (cfg.get("asr_provider") or "siliconflow").strip().lower()
    if provider == "local":
        return await _transcribe_local(pcm_bytes, language)
    return await _transcribe_siliconflow(pcm_bytes, language, cfg)


# ---------------------------------------------------------------------------
# 后端 A：硅基流动在线 API
# ---------------------------------------------------------------------------
async def _transcribe_siliconflow(
    pcm_bytes: bytes, language: str, cfg: dict
) -> str:
    """调用硅基流动 audio transcriptions API。失败返回空字符串。"""
    import httpx

    api_key = (cfg.get("asr_siliconflow_api_key") or "").strip()
    if not api_key:
        print("[ASR online] 未配置 asr_siliconflow_api_key，跳过")
        return ""

    base_url = (cfg.get("asr_siliconflow_base_url") or "https://api.siliconflow.cn/v1").strip()
    model = (cfg.get("asr_siliconflow_model") or "FunAudioLLM/SenseVoiceSmall").strip()

    wav_bytes = _pcm_to_wav(pcm_bytes)
    if not wav_bytes:
        return ""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{base_url.rstrip('/')}/audio/transcriptions",
                headers={"Authorization": f"Bearer {api_key}"},
                files={
                    "file": ("audio.wav", wav_bytes, "audio/wav"),
                    "model": (None, model),
                },
            )
            resp.raise_for_status()
            data = resp.json()
            text = data.get("text", "") if isinstance(data, dict) else ""
            return _clean_text(text)
    except Exception as e:
        import traceback
        print(f"[ASR online] error: {e}")
        traceback.print_exc()
        return ""


# ---------------------------------------------------------------------------
# 后端 B：本地 FunASR（import 延迟到此处；服务器不装 funasr 也不会触发）
# ---------------------------------------------------------------------------
_model = None
_model_lock = asyncio.Lock()


def _get_local_model():
    """懒加载本地 FunASR SenseVoiceSmall 模型。"""
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


async def _transcribe_local(pcm_bytes: bytes, language: str) -> str:
    """本地 FunASR 离线识别。"""
    try:
        async with _model_lock:
            model = _get_local_model()
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
    except Exception as e:
        import traceback
        print(f"[ASR local] error: {e}")
        traceback.print_exc()
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
    由于 ASR 本地模式不支持逐帧流式输出，这里是"模拟实时"：
    累积所有 PCM 块，最后一次性识别。
    """
    chunks = []
    async for chunk in audio_stream:
        chunks.append(chunk)

    if chunks:
        pcm_bytes = b"".join(chunks)
        text = await transcribe_pcm(pcm_bytes)
        yield text
