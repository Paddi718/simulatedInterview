"""
音频缓存与存储模块

- TTS 缓存：对文本+音色+语速做哈希，缓存 edge-tts 合成结果，避免重复联网调用
- 录音存储：保存用户原始录音，支持回放与重处理
- 存储路径：{audio_storage_path}/tts_cache/ 和 {audio_storage_path}/recordings/
"""
import hashlib
import os
import asyncio
from pathlib import Path
from datetime import datetime
from app.config import get_settings

settings = get_settings()

# 缓存过期时间（天）：超过后自动删除
CACHE_MAX_AGE_DAYS = 30


def _get_base_dir() -> Path:
    path = Path(settings.audio_storage_path or os.path.join(os.path.dirname(__file__), "..", "..", "data", "audio"))
    path.mkdir(parents=True, exist_ok=True)
    return path


def _get_tts_cache_dir() -> Path:
    path = _get_base_dir() / "tts_cache"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _get_recording_dir(interview_id: str) -> Path:
    path = _get_base_dir() / "recordings" / interview_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def tts_cache_key(text: str, voice: str, speed: float) -> str:
    """生成确定性缓存键：sha256(文本|音色|语速)"""
    content = f"{text.strip()}|{voice}|{speed:.1f}"
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


async def get_cached_tts(text: str, voice: str, speed: float) -> bytes | None:
    """命中缓存则返回音频 bytes，否则返回 None"""
    key = tts_cache_key(text, voice, speed)
    cache_path = _get_tts_cache_dir() / f"{key}.mp3"
    if cache_path.exists() and cache_path.stat().st_size > 220:  # 最小有效 MP3 大小
        # 更新访问时间（用于缓存淘汰）
        try:
            os.utime(cache_path, None)
        except OSError:
            pass
        return cache_path.read_bytes()
    return None


async def save_tts_cache(text: str, voice: str, speed: float, audio: bytes):
    """将 TTS 音频写入缓存"""
    if not audio or len(audio) < 220:
        return
    key = tts_cache_key(text, voice, speed)
    cache_path = _get_tts_cache_dir() / f"{key}.mp3"
    cache_path.write_bytes(audio)


def save_recording_sync(interview_id: str, question_index: int, webm_bytes: bytes) -> str:
    """同步版本：保存原始录音 webm 文件（原子写入，避免部分文件）"""
    rec_dir = _get_recording_dir(interview_id)
    rec_path = rec_dir / f"q{question_index}.webm"
    tmp_path = rec_dir / f"q{question_index}.webm.tmp"
    # 先写临时文件，再 rename（原子操作），防止写入中断留下不完整文件
    try:
        tmp_path.write_bytes(webm_bytes)
        tmp_path.replace(rec_path)  # 原子 rename（同文件系统内）
    except Exception:
        # 清理临时文件
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass
        raise
    return str(rec_path)


async def save_recording(interview_id: str, question_index: int, webm_bytes: bytes) -> str:
    """保存原始录音 webm 文件，返回存储路径"""
    # 使用线程池避免阻塞事件循环
    return await asyncio.to_thread(save_recording_sync, interview_id, question_index, webm_bytes)


async def get_recording(interview_id: str, question_index: int) -> bytes | None:
    """读取已保存的录音"""
    rec_path = _get_recording_dir(interview_id) / f"q{question_index}.webm"
    if rec_path.exists() and rec_path.stat().st_size > 0:
        return await asyncio.to_thread(rec_path.read_bytes)
    return None


async def get_cache_stats() -> dict:
    """获取 TTS 缓存统计"""
    cache_dir = _get_tts_cache_dir()
    files = list(cache_dir.glob("*.mp3"))
    total_size = sum(f.stat().st_size for f in files)
    return {
        "file_count": len(files),
        "total_size_bytes": total_size,
        "total_size_mb": round(total_size / (1024 * 1024), 2),
        "cache_dir": str(cache_dir),
    }


async def clean_expired_cache(max_age_days: int = CACHE_MAX_AGE_DAYS) -> int:
    """清理过期缓存文件，返回删除数量"""
    cache_dir = _get_tts_cache_dir()
    cutoff = datetime.now().timestamp() - (max_age_days * 86400)
    deleted = 0
    for f in cache_dir.glob("*.mp3"):
        try:
            if f.stat().st_mtime < cutoff:
                f.unlink()
                deleted += 1
        except OSError:
            pass
    return deleted


async def clean_recording(interview_id: str):
    """删除指定面试的所有录音"""
    import shutil
    rec_dir = _get_base_dir() / "recordings" / interview_id
    if rec_dir.exists():
        await asyncio.to_thread(shutil.rmtree, str(rec_dir), ignore_errors=True)
