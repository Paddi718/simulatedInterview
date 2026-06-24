"""
SileroVAD 语音活动检测服务
基于参考项目 F:/AI_study/PythonProject/20260530_AI_CRM/core/providers/vad/silero.py
适配为 FastAPI async 架构，直接处理 PCM 字节（无需 Opus 解码）
"""
import os
import time
import numpy as np
import onnxruntime
from app.config import get_settings

settings = get_settings()

# 模型路径: 适配 Docker (/app/models/) 和本地 (../models/)
_SERVICE_DIR = os.path.dirname(os.path.abspath(__file__))  # .../backend/app/services
_BACKEND_DIR = os.path.dirname(os.path.dirname(_SERVICE_DIR))  # .../backend
_CANDIDATES = [
    os.path.join(_BACKEND_DIR, "models", "snakers4_silero-vad"),          # Docker: /app/models/...
    os.path.join(os.path.dirname(_BACKEND_DIR), "models", "snakers4_silero-vad"),  # 本地: ../models/...
    os.path.join(os.getcwd(), "models", "snakers4_silero-vad"),
]
VAD_MODEL_DIR = None
for _c in _CANDIDATES:
    _mp = os.path.join(_c, "src", "silero_vad", "data", "silero_vad.onnx")
    if os.path.exists(_mp):
        VAD_MODEL_DIR = _c
        VAD_MODEL_PATH = _mp
        break
if VAD_MODEL_DIR is None:
    VAD_MODEL_PATH = os.path.join(_CANDIDATES[0], "src", "silero_vad", "data", "silero_vad.onnx")


class SileroVAD:
    """Silero VAD — ONNX 推理，检测语音活动"""

    def __init__(self):
        if not os.path.exists(VAD_MODEL_PATH):
            raise FileNotFoundError(f"VAD model not found: {VAD_MODEL_PATH}")

        opts = onnxruntime.SessionOptions()
        opts.inter_op_num_threads = 1
        opts.intra_op_num_threads = 1
        self.session = onnxruntime.InferenceSession(
            VAD_MODEL_PATH, providers=["CPUExecutionProvider"], sess_options=opts
        )

        # 双阈值：>= 0.5 判定为语音，<= 0.3 判定为静音
        self.vad_threshold = 0.5
        self.vad_threshold_low = 0.3
        # 静音 500ms 后认为说话结束
        self.silence_threshold_ms = 500
        # 滑动窗口：5 帧中至少 3 帧有语音
        self.window_size = 5
        self.window_threshold = 3

    def reset_state(self):
        """返回初始化的 VAD 状态"""
        return {
            "state": np.zeros((2, 1, 128), dtype=np.float32),
            "context": np.zeros((1, 64), dtype=np.float32),
            "last_is_voice": False,
            "voice_window": [],
            "client_have_voice": False,
            "client_voice_stop": False,
            "vad_last_voice_time": 0.0,
            "pcm_buffer": bytearray(),       # 内部帧对齐缓冲
            "voice_pcm": bytearray(),         # 当前语音段的全部 PCM
        }

    def process_pcm(self, vad_state: dict, pcm_chunk: bytes) -> dict:
        """
        处理 PCM 音频块（16kHz, 16bit, mono）
        更新并返回 VAD 状态
        """
        vad_state["pcm_buffer"].extend(pcm_chunk)
        vad_state["voice_pcm"].extend(pcm_chunk)  # 累计语音段 PCM

        client_have_voice = False

        # 每次取 512 个样本（32ms @ 16kHz）= 1024 字节
        while len(vad_state["pcm_buffer"]) >= 1024:
            chunk = bytes(vad_state["pcm_buffer"][:1024])
            vad_state["pcm_buffer"] = vad_state["pcm_buffer"][1024:]

            audio_int16 = np.frombuffer(chunk, dtype=np.int16)
            audio_float32 = audio_int16.astype(np.float32) / 32768.0
            audio_input = np.concatenate(
                [vad_state["context"], audio_float32.reshape(1, -1)], axis=1
            ).astype(np.float32)

            ort_inputs = {
                "input": audio_input,
                "state": vad_state["state"],
                "sr": np.array(16000, dtype=np.int64),
            }
            out, state = self.session.run(None, ort_inputs)
            vad_state["state"] = state
            vad_state["context"] = audio_input[:, -64:]
            speech_prob = out.item()

            # 双阈值判断
            if speech_prob >= self.vad_threshold:
                is_voice = True
            elif speech_prob <= self.vad_threshold_low:
                is_voice = False
            else:
                is_voice = vad_state["last_is_voice"]

            vad_state["last_is_voice"] = is_voice
            vad_state["voice_window"].append(is_voice)

            # 保持窗口大小
            if len(vad_state["voice_window"]) > self.window_size:
                vad_state["voice_window"] = vad_state["voice_window"][-self.window_size:]

            # 窗口中 >= threshold 帧有语音 → 判定为有人声
            client_have_voice = (
                sum(1 for v in vad_state["voice_window"] if v) >= self.window_threshold
            )

            # 语音停止检测：之前有声音，现在无声音，且静音超过阈值
            if vad_state["client_have_voice"] and not client_have_voice:
                stop_duration = time.time() * 1000 - vad_state["vad_last_voice_time"]
                if stop_duration >= self.silence_threshold_ms:
                    vad_state["client_voice_stop"] = True

            if client_have_voice:
                vad_state["client_have_voice"] = True
                vad_state["vad_last_voice_time"] = time.time() * 1000

        return vad_state

    def get_voice_pcm(self, vad_state: dict) -> bytes:
        """返回当前语音段累积的全部 PCM，不重置状态"""
        return bytes(vad_state["voice_pcm"])

    def mark_voice_consumed(self, vad_state: dict):
        """清空语音 PCM 缓冲并重置 stop 标记（ASR 处理完后调用）"""
        vad_state["voice_pcm"] = bytearray()
        vad_state["client_voice_stop"] = False
        vad_state["client_have_voice"] = False


# 单例
_vad_instance = None


def get_vad() -> SileroVAD:
    global _vad_instance
    if _vad_instance is None:
        _vad_instance = SileroVAD()
    return _vad_instance
