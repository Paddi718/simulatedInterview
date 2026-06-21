'use client';

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

/* ---------- Types ---------- */

interface Question {
  order_index: number;
  question_text: string;
  question_type: 'introduction' | 'behavioral' | 'technical' | 'situational' | 'career';
}

interface QuestionScore {
  order_index: number;
  total_score: number;
  dimension_scores: Record<string, number>;
  evaluation: string;
  reference_answer: string;
  improvement_suggestion: string;
  error?: string;
}

type Phase = 'question' | 'recording' | 'review' | 'feedback';

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

const QUESTION_TYPE_MAP: Record<string, string> = {
  introduction: '自我介绍',
  behavioral: '行为面试',
  technical: '专业技能',
  situational: '情景题',
  career: '职业规划',
};

const QUESTION_TYPE_COLORS: Record<string, string> = {
  introduction: 'bg-blue-50 text-blue-700 border-blue-200',
  behavioral: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  technical: 'bg-purple-50 text-purple-700 border-purple-200',
  situational: 'bg-amber-50 text-amber-700 border-amber-200',
  career: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function getWsUrl(): string {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return apiBase.replace(/^http/, 'ws');
}

/* ========== SessionContent ========== */

function SessionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const interviewId = searchParams.get('id');

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('question');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [partialTranscripts, setPartialTranscripts] = useState<string[]>([]);
  const [asrProcessing, setAsrProcessing] = useState(false);
  const [asrReady, setAsrReady] = useState(false);  // ASR model warmup
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [showConfirm, setShowConfirm] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [feedback, setFeedback] = useState<QuestionScore | null>(null);  // per-question feedback
  const [scoring, setScoring] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const transcriptRef = useRef('');
  const partialsRef = useRef<string[]>([]);

  /* ---------- Cleanup ---------- */
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopAudioCapture();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopAudioCapture = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  /* ---------- WebSocket ---------- */
  const connectWs = useCallback((): WebSocket | null => {
    if (!interviewId) return null;
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    if (!token) return null;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return wsRef.current;
    }

    const ws = new WebSocket(`${getWsUrl()}/api/ws/interview/${interviewId}?token=${token}`);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => setWsConnected(true);

    ws.onmessage = (event) => {
      // Binary: TTS audio
      if (event.data instanceof ArrayBuffer) {
        playTtsAudio(event.data);
        return;
      }

      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'asr_result':
            if (msg.final) {
              transcriptRef.current = msg.text;
              setTranscript(msg.text);
              setAsrProcessing(false);
            } else if (msg.text) {
              // 实时逐句显示
              partialsRef.current = [...partialsRef.current, msg.text];
              setPartialTranscripts([...partialsRef.current]);
            }
            break;
          case 'asr_error':
            console.warn('[WS] ASR error:', msg.message);
            setAsrProcessing(false);
            break;
          case 'warmup_done':
            setAsrReady(true);
            break;
          case 'question_score':
            if (!msg.error) {
              setFeedback(msg as QuestionScore);
              setScoring(false);
              setPhase('feedback');
            } else {
              setScoring(false);
            }
            break;
          case 'answer_saved':
            break;
          case 'pong':
            break;
          case 'error':
            console.warn('[WS] Error:', msg.message);
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);

    wsRef.current = ws;
    return ws;
  }, [interviewId]);

  /* ---------- TTS Playback ---------- */
  const playTtsAudio = async (arrayBuffer: ArrayBuffer) => {
    try {
      const ctx = new AudioContext();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      setTtsPlaying(true);
      source.onended = () => {
        setTtsPlaying(false);
        ctx.close();
      };
      source.start();
    } catch {
      // TTS playback failed silently
    }
  };

  const speakQuestion = useCallback((text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: 'tts_request',
      text,
      voice: localStorage.getItem('tts_voice') || 'zh-CN-XiaoxiaoNeural',
    }));
  }, []);

  /* ---------- Load interview ---------- */
  const loadInterview = useCallback(async () => {
    if (!interviewId) {
      router.push('/dashboard');
      return;
    }
    try {
      setLoading(true);
      setError('');
      const data = await api.get<{ questions: Question[]; status: string }>(
        `/api/interview/${interviewId}`,
      );
      if (data.status === 'preparing') {
        await api.post(`/api/interview/${interviewId}/start`);
      }
      setQuestions(data.questions || []);
    } catch (err: any) {
      setError(err.message || '加载面试失败');
    } finally {
      setLoading(false);
    }
  }, [interviewId, router]);

  useEffect(() => {
    loadInterview();
    // Connect WebSocket early for ASR warmup
    connectWs();
  }, [loadInterview, connectWs]);

  /* ---------- PCM Audio Capture ---------- */
  const startPcmCapture = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(int16.buffer);
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
      return true;
    } catch {
      return false;
    }
  }, []);

  /* ---------- Recording ---------- */
  const startRecording = useCallback(async () => {
    transcriptRef.current = '';
    partialsRef.current = [];
    setTranscript('');
    setPartialTranscripts([]);
    setSubmitState('idle');
    setTimer(0);
    setAsrProcessing(false);
    setFeedback(null);

    // Ensure WebSocket is connected
    let ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      ws = connectWs();
      if (ws) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('timeout')), 5000);
          ws!.onopen = () => { clearTimeout(timeout); resolve(); };
        });
      }
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError('无法连接到语音服务，请刷新重试');
      return;
    }

    const ok = await startPcmCapture();
    if (!ok) {
      setError('无法访问麦克风，请检查权限设置');
      return;
    }

    ws.send(JSON.stringify({ type: 'audio_start' }));
    setIsRecording(true);
    setPhase('recording');
    timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
  }, [connectWs, startPcmCapture]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopAudioCapture();

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'audio_stop' }));
    }

    setAsrProcessing(true);
    setPhase('review');
  }, [stopAudioCapture]);

  const [isRecording, setIsRecording] = useState(false);

  /* ---------- Submit answer ---------- */
  const submitAnswer = useCallback(
    async (answerText: string, skip: boolean) => {
      if (!interviewId) return;
      const q = questions[currentIndex];
      if (!q) return;

      setSubmitState('submitting');
      try {
        await api.post(`/api/interview/${interviewId}/submit-answer`, {
          order_index: q.order_index,
          answer_transcript: answerText,
          duration_seconds: skip ? 0 : timer,
        });
        setSubmitState('success');
      } catch {
        setSubmitState('error');
        return;
      }

      // 请求单题评分（通过 WebSocket 获取反馈和参考答案）
      setScoring(true);
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'score_question',
          order_index: q.order_index,
        }));
      } else {
        // 降级：直接进入下一题
        moveToNextOrComplete();
      }
    },
    [interviewId, currentIndex, questions, timer],
  );

  const moveToNextOrComplete = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setPhase('question');
      setTranscript('');
      setPartialTranscripts([]);
      setTimer(0);
      setSubmitState('idle');
      setFeedback(null);
      setScoring(false);
    } else {
      setShowConfirm(true);
    }
  }, [currentIndex, questions.length]);

  /* ---------- Skip ---------- */
  const handleSkip = useCallback(() => {
    if (submitState === 'submitting') return;
    if (isRecording) {
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      stopAudioCapture();
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'audio_stop' }));
      }
      setTimeout(() => submitAnswer('', true), 200);
    } else {
      submitAnswer('', true);
    }
  }, [submitState, isRecording, submitAnswer, stopAudioCapture]);

  /* ---------- Complete interview ---------- */
  const handleComplete = useCallback(async () => {
    if (!interviewId || completing) return;
    setCompleting(true);
    try {
      await api.post(`/api/interview/${interviewId}/complete`);
      router.push(`/interview/result/${interviewId}`);
    } catch {
      setCompleting(false);
      setError('完成面试失败，请重试');
    }
  }, [interviewId, completing, router]);

  /* ---------- Progress helpers ---------- */
  const total = questions.length;
  const progress = total > 0 ? (currentIndex / total) * 100 : 0;
  const currentQ = questions[currentIndex];
  const displayTranscript = transcript || partialTranscripts.join('');

  /* ========== Render ========== */

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 gap-4">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">加载面试题目...</p>
      </div>
    );
  }

  if (error && !currentQ) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 gap-6 px-4">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-700 font-medium mb-1">出错了</p>
          <p className="text-sm text-gray-500 mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <Link href="/dashboard" className="px-5 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">返回首页</Link>
            <button onClick={loadInterview} className="px-5 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">重试</button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentQ) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 gap-4 px-4">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md w-full text-center">
          <p className="text-gray-700 font-medium mb-2">暂无面试题目</p>
          <p className="text-sm text-gray-500 mb-6">请联系管理员创建题目。</p>
          <Link href="/dashboard" className="inline-block px-5 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">返回首页</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-4">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回首页
          </Link>
          <div className="flex items-center gap-3">
            <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : asrReady ? 'bg-yellow-500' : 'bg-gray-300'}`}
              title={wsConnected ? '已连接' : asrReady ? '预热中' : '未连接'} />
            <span className="text-xs text-gray-400">AI 模拟面试</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">
              第 <span className="text-blue-600 font-bold">{currentIndex + 1}</span> / {total} 题
            </span>
            <span className="text-sm text-gray-400">{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex gap-1.5 mt-3">
            {questions.map((_, i) => (
              <div key={i} className={`h-2 flex-1 rounded-full transition-colors duration-300 ${
                i < currentIndex ? 'bg-blue-500' : i === currentIndex ? 'bg-blue-300' : 'bg-gray-200'
              }`} />
            ))}
          </div>
        </div>

        {/* Question Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 sm:px-7 pt-5 sm:pt-7 pb-0">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${
              QUESTION_TYPE_COLORS[currentQ.question_type] ?? 'bg-gray-50 text-gray-600 border-gray-200'
            }`}>
              {QUESTION_TYPE_MAP[currentQ.question_type] ?? currentQ.question_type}
            </span>
          </div>

          <div className="px-5 sm:px-7 pt-4 pb-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 leading-relaxed flex-1">
                {currentQ.question_text}
              </h2>
              {phase === 'question' && !isRecording && (
                <button onClick={() => speakQuestion(currentQ.question_text)}
                  disabled={ttsPlaying || !wsConnected}
                  className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-50 hover:bg-blue-100 flex items-center justify-center transition-colors disabled:opacity-40"
                  title={ttsPlaying ? '播放中...' : '朗读题目'}>
                  <svg className={`w-5 h-5 text-blue-600 ${ttsPlaying ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* Answer Area */}
          <div className="px-5 sm:px-7 py-6 sm:py-8">
            {/* ----- Ready to Record ----- */}
            {phase === 'question' && !isRecording && (
              <div className="flex flex-col items-center gap-6">
                {!asrReady && wsConnected && (
                  <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-lg">
                    <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                    语音模型加载中，请稍候...
                  </div>
                )}
                <p className="text-sm text-gray-400">准备好后，点击下方按钮开始录音回答</p>
                <button onClick={startRecording} disabled={submitState === 'submitting'}
                  className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-white border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 flex items-center justify-center group disabled:opacity-50 disabled:cursor-not-allowed">
                  <svg className="w-10 h-10 sm:w-12 sm:h-12 text-blue-500 group-hover:text-blue-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-3 0h6m-3-4a4 4 0 01-4-4V6a4 4 0 118 0v5a4 4 0 01-4 4z" />
                  </svg>
                </button>
                <div className="flex gap-3 w-full sm:w-auto">
                  <button onClick={handleSkip} disabled={submitState === 'submitting'}
                    className="flex-1 sm:flex-none px-6 py-2.5 text-sm font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    跳过此题
                  </button>
                </div>
              </div>
            )}

            {/* ----- Recording ----- */}
            {isRecording && (
              <div className="flex flex-col items-center gap-4">
                <div className="text-center">
                  <div className="text-3xl sm:text-4xl font-mono font-bold text-gray-800 tabular-nums">
                    {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">录音时长</p>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 rounded-full animate-ping bg-red-400/30" />
                  <div className="absolute inset-0 rounded-full animate-pulse bg-red-400/20" style={{ animationDelay: '0.5s' }} />
                  <button onClick={stopRecording}
                    className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-200 hover:shadow-red-300 hover:from-red-600 hover:to-red-700 transition-all duration-200 flex items-center justify-center active:scale-95">
                    <svg className="w-10 h-10 sm:w-12 sm:h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-3 0h6m-3-4a4 4 0 01-4-4V6a4 4 0 118 0v5a4 4 0 01-4 4z" />
                    </svg>
                  </button>
                </div>

                <p className="text-sm font-medium text-red-500 animate-pulse">录音中...</p>

                {/* Real-time partial transcripts DURING recording */}
                {partialTranscripts.length > 0 && (
                  <div className="w-full bg-blue-50 rounded-xl p-3 border border-blue-100 max-h-40 overflow-y-auto">
                    <p className="text-xs text-blue-500 mb-2">实时转写：</p>
                    <div className="space-y-1">
                      {partialTranscripts.map((t, i) => (
                        <p key={i} className="text-sm text-gray-600 leading-relaxed">{t}</p>
                      ))}
                    </div>
                  </div>
                )}

                <button onClick={handleSkip} disabled={submitState === 'submitting'}
                  className="px-6 py-2 text-sm text-gray-400 border border-gray-200 rounded-xl hover:text-gray-600 hover:border-gray-300 transition-colors disabled:opacity-50">
                  跳过此题
                </button>
              </div>
            )}

            {/* ----- Review ----- */}
            {phase === 'review' && !isRecording && (
              <div className="flex flex-col gap-5">
                {asrProcessing && (
                  <div className="flex items-center gap-2 text-sm text-blue-600">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    正在识别语音...
                  </div>
                )}

                {partialTranscripts.length > 0 && (
                  <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                    <p className="text-xs text-blue-500 mb-2">分段识别结果：</p>
                    <div className="space-y-1">
                      {partialTranscripts.map((t, i) => (
                        <p key={i} className="text-sm text-gray-600">{t}</p>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">你的回答</label>
                  <div className="bg-gray-50 rounded-xl p-4 min-h-[100px] border border-gray-200">
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {displayTranscript || (asrProcessing ? '识别中...' : '（未检测到回答内容）')}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    录音时长 {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={() => submitAnswer(displayTranscript, false)}
                    disabled={submitState === 'submitting' || asrProcessing || scoring}
                    className="flex-1 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    {submitState === 'submitting' ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />提交中...</> : '提交回答'}
                  </button>
                  <button onClick={startRecording} disabled={submitState === 'submitting' || asrProcessing || scoring}
                    className="flex-1 sm:flex-none px-6 py-3 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    重新录音
                  </button>
                  <button onClick={handleSkip} disabled={submitState === 'submitting'}
                    className="flex-1 sm:flex-none px-6 py-3 text-sm font-medium text-gray-400 border border-gray-200 rounded-xl hover:text-gray-600 hover:border-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    跳过
                  </button>
                </div>

                {submitState === 'error' && (
                  <p className="text-sm text-red-500 text-center">提交失败，请重试</p>
                )}
              </div>
            )}

            {/* ----- Feedback (per-question scoring) ----- */}
            {phase === 'feedback' && feedback && (
              <div className="flex flex-col gap-5 animate-in fade-in duration-300">
                {/* Score */}
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                    <span className="text-2xl font-bold">{feedback.total_score}</span>
                    <span className="text-xs ml-0.5 mt-1">分</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-2">本题评分</p>
                </div>

                {/* Dimension scores */}
                {feedback.dimension_scores && (
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(feedback.dimension_scores).map(([key, val]) => (
                      <div key={key} className="bg-gray-50 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-blue-600">{val}</div>
                        <div className="text-xs text-gray-500">
                          {key === 'content_completeness' ? '内容完整性' :
                           key === 'professionalism' ? '专业度' :
                           key === 'expression' ? '表达能力' : 'STAR法则'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Evaluation */}
                {feedback.evaluation && (
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">评语</label>
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                      <p className="text-sm text-gray-700 leading-relaxed">{feedback.evaluation}</p>
                    </div>
                  </div>
                )}

                {/* Reference Answer */}
                {feedback.reference_answer && (
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">参考答案</label>
                    <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                      <p className="text-sm text-gray-700 leading-relaxed">{feedback.reference_answer}</p>
                    </div>
                  </div>
                )}

                {/* Improvement */}
                {feedback.improvement_suggestion && (
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">改进建议</label>
                    <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                      <p className="text-sm text-gray-700 leading-relaxed">{feedback.improvement_suggestion}</p>
                    </div>
                  </div>
                )}

                {/* Scoring loading or error fallback */}
                {scoring && (
                  <div className="flex items-center justify-center gap-2 text-sm text-blue-600 py-4">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    正在评分...
                  </div>
                )}

                {/* Next question button */}
                <button
                  onClick={moveToNextOrComplete}
                  disabled={scoring}
                  className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60"
                >
                  {currentIndex < questions.length - 1 ? '下一题' : '查看结果'}
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-400 text-center mt-5">
          请在一个安静的环境中回答，语速清晰
        </p>
      </div>

      {/* Completion Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 sm:p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">全部回答完成</h3>
            <p className="text-sm text-gray-500 mb-6">你已回答全部 {total} 道题目，确认完成面试并查看评估报告吗？</p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} disabled={completing}
                className="flex-1 px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50">
                再看看
              </button>
              <button onClick={handleComplete} disabled={completing}
                className="flex-1 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {completing ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />提交中...</> : '完成面试'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== Page Wrapper ========== */

export default function SessionPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 gap-4">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">加载中...</p>
      </div>
    }>
      <SessionContent />
    </Suspense>
  );
}
