# Mobile-Compatible Real-Time Transcription -- Minimal-Change Implementation Plan

## Overview

Browser `SpeechRecognition` API (used for live captions) is unsupported on iOS Safari and many Android browsers. The goal is to replace it with a streaming audio pipeline that sends raw PCM through the existing WebSocket, runs VAD on the backend, and returns FunASR-transcribed segments in near real-time -- keeping the existing `MediaRecorder` + REST transcribe flow as a fallback for desktop.

---

## 1. New WebSocket Message Types

### Client-to-Server

| Type | Payload | Description |
|---|---|---|
| `audio_stream_start` | none | Initialize VAD state for a new recording session (resets accumulated PCM, voice flags) |
| `audio_chunk` | `{ data: "<base64>" }` | A ~20ms PCM chunk (320 bytes = 160 samples @ 16kHz, 16-bit, mono) encoded as base64 |
| `audio_stream_end` | none | Flush any remaining PCM in VAD buffer, trigger final ASR, and send result |

### Server-to-Client

| Type | Payload | Description |
|---|---|---|
| `transcript_segment` | `{ text: "...", is_final: true, segment_id: 1 }` | A VAD-detected speech segment transcribed by FunASR. `is_final=true` always (FunASR does not support partial results) |
| `transcript_error` | `{ message: "..." }` | ASR failure for a segment -- re-raise via the next `audio_stream_start` |

**Why no `is_final=false`?** FunASR SenseVoiceSmall cannot produce partial results. Each segment is a complete utterance that takes 1-3 seconds to process. Mobile users see transcript appear in bursts rather than word-by-word -- acceptable trade-off given constraint.

**Why base64?** WebSocket `send_bytes` is already used for TTS audio (server-to-client). For client-to-server audio streaming, JSON messages with base64 PCM keep the protocol uniform and the message parser simple. (Binary frames would require a separate receive path and framing protocol.)

---

## 2. VAD Integration

The existing `SileroVAD` class in `backend/app/services/vad_service.py` is plug-and-play for this use case. It already provides:

- **`process_pcm(vad_state, pcm_chunk)`** -- processes 1024-byte (512-sample) PCM blocks, updates voice/silence state
- **`client_voice_stop` flag** -- set to `True` when silence threshold is exceeded after speech
- **`pcm_buffer`** -- accumulates incoming PCM for potential later use
- **`reset_state()`** -- returns fresh initial state dict

### Changes needed in `vad_service.py`

Add two small methods:

1. **`get_voice_pcm(vad_state)`** -- returns a `bytes` copy of the PCM accumulated since the last `client_voice_stop` was consumed (or since `reset_state()`), then clears the accumulation tracker.

2. **`mark_voice_consumed(vad_state)`** -- resets `client_voice_stop` to `False` after the ASR call completes, preventing duplicate processing of the same segment.

### Integration in WebSocket handler

Per-connection VAD state is stored in a dict keyed by `id(websocket)`:

```python
_vad_states: dict[int, dict] = {}
```

Flow for each `audio_chunk` message:
1. Decode base64 to PCM bytes
2. Call `vad.process_pcm(vad_state, pcm_bytes)`
3. Check `vad_state["client_voice_stop"]` after each call
4. If `True`: extract accumulated PCM via `get_voice_pcm()`, launch `transcribe_pcm()` as a `create_task`, send result back via `transcript_segment`, then `mark_voice_consumed()`

If the user stops recording (`audio_stream_end`), flush any remaining PCM in both the 512-byte processing buffer and the voice accumulation buffer to FunASR.

---

## 3. Frontend Audio Capture Changes

### New streaming recording mode

Add a parallel recording path alongside the existing `MediaRecorder` path. The existing flow is preserved as a fallback when `AudioContext` is not available or when the user is on desktop (detected via `window.AudioContext` / `window.webkitAudioContext`).

**Capture approach**: `ScriptProcessorNode` (deprecated but universally supported on mobile). `AudioWorklet` would be preferred but has narrower mobile support.

```typescript
// Pseudocode for the streaming capture path
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const source = audioCtx.createMediaStreamSource(stream);
const processor = audioCtx.createScriptProcessor(4096, 1, 1);  // 4096 samples ~256ms

processor.onaudioprocess = (e) => {
  const input = e.inputBuffer.getChannelData(0);      // Float32 samples
  const pcm16 = float32ToPcm16(input);                 // Convert to 16-bit PCM
  const b64 = arrayBufferToBase64(pcm16.buffer);       // Encode
  ws.send(JSON.stringify({ type: 'audio_chunk', data: b64 }));
};

source.connect(processor);
processor.connect(audioCtx.destination);  // Required for ScriptProcessor to fire
```

### Key decisions:

1. **Buffer size = 4096 samples (~256ms @ 16kHz)** -- balances latency against frame overhead. The VAD internally works with 512-sample blocks, so we feed 8 VAD cycles per message.

2. **Sample rate conversion**: `ScriptProcessorNode` gives native sample rate (typically 44.1kHz or 48kHz on mobile). We must downsample to 16kHz before encoding. A simple linear interpolation is sufficient.

3. **Keep both paths**: The existing `MediaRecorder` path stays for desktop. The mobile recording button conditionally uses the streaming path. Detection: check `window.AudioContext` AND platform hint (user-agent).

4. **Live text display**: Instead of `SpeechRecognition.onresult`, the streaming path listens for `transcript_segment` WebSocket messages and appends them to the live text display in the same `liveTextRef` + `liveTextElRef` mechanism already used.

### Changes in `session/page.tsx`

- Add `startStreamingRecording()` function (alongside `startRecording()`)
- Add `stopStreamingRecording()` function
- Add `float32ToPcm16()` and `arrayBufferToBase64()` utility functions
- Add handling for `transcript_segment` message type in `ws.onmessage`
- Modify the recording button logic to choose between streaming and MediaRecorder based on capability and platform

**Minimal UI change**: No new UI elements. The streaming path uses the same phase state machine (`recording` -> `review`), the same live text display area, the same timer, and the same submit flow. The only difference is how audio gets to the server.

---

## 4. Handling the FunASR Non-Streaming Limitation

FunASR SenseVoiceSmall requires complete audio and returns text in one go. We work around this via VAD segmentation:

```
Audio chunks → VAD (accumulate PCM) → VAD detects silence → [accumulated PCM] → FunASR → text
```

Each VAD-detected speech segment (typically 2-10 seconds) is a complete "utterance" passed to FunASR. This gives the user:

- **Latency**: 1-3 seconds per segment (VAD silence detection 500ms + FunASR inference 0.5-2.5s)
- **Bursty but usable**: Text appears in chunks as each segment finishes processing
- **No partial results**: The user sees final text for each segment, not a word-by-word stream

This is the best we can do without a streaming-compatible ASR model (e.g., Whisper.cpp streaming, or cloud providers like Azure/Deepgram).

**Backend concurrency**: The `_asr_semaphore` in `asr_service.py` already limits concurrent FunASR calls. Each WebSocket connection's `audio_chunk` processing should be sequential (process one segment, wait for ASR, send result, then process the next). Use `asyncio.Lock` per connection.

---

## 5. Estimated File Changes and Implementation Order

### Phase 1: Backend WebSocket + VAD (high confidence, minimal risk)

| File | Change | Type |
|---|---|---|
| `backend/app/services/vad_service.py` | Add `get_voice_pcm()` and `mark_voice_consumed()` methods | Small addition, ~20 lines |
| `backend/app/routers/websocket.py` | Add `audio_stream_start`, `audio_chunk`, `audio_stream_end` message handlers. Add per-connection VAD state management. Add per-connection ASR lock. Handle `transcript_segment` responses. | Medium change, ~80 lines |

### Phase 2: Frontend Streaming Capture (medium risk -- mobile audio APIs)

| File | Change | Type |
|---|---|---|
| `frontend/src/app/(interview)/interview/session/page.tsx` | Add `startStreamingRecording`, `stopStreamingRecording`, PCM conversion utilities. Add `transcript_segment` WS handler. Add capability detection to choose recording path. | Medium change, ~120 lines |

### Phase 3: Integration Testing

Test on:
- iOS Safari: verify `ScriptProcessorNode` works (may need `AudioContext` resume on user gesture)
- Android Chrome: verify WebSocket binary/JSON handling
- Desktop Chrome/Firefox: verify existing MediaRecorder path is unchanged
- Edge case: user switches tabs mid-stream (VAD accumulates silence)

### Total estimated delta: ~220 lines across 3 files, zero new dependencies.

---

## 6. Constraint Summary

| Constraint | How we meet it |
|---|---|
| Work on mobile browsers | `ScriptProcessorNode` + `getUserMedia` work on all modern mobile browsers |
| Use existing WebSocket | New message types use the same `/api/ws/interview/{id}` connection |
| Reuse VAD and ASR | VAD is used as designed. ASR unchanged. |
| Minimal frontend changes | One new recording path; all UI elements and state machine reused |
| Don't break desktop | Desktop continues using `MediaRecorder` + REST transcribe path |

---

## 7. Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| ScriptProcessorNode deprecation on iOS | Low (still works on iOS 18) | Graceful fallback to MediaRecorder-only recording (no live captions) |
| AudioContext suspended on mobile | Medium | Resume on user gesture (click handler) |
| High latency (VAD+ASR >5s per segment) | Low (1-3s typical) | Can reduce silence_threshold_ms from 500 to 300 for faster segment detection |
| Base64 overhead (~33%) on PCM | Low (~10KB/s for 16kHz PCM) | Can switch to binary WebSocket frames if needed; negligible at this data rate |
| Multiple WebSocket connections competing for ASR | Low | Per-connection lock + global ASR semaphore already in place |
