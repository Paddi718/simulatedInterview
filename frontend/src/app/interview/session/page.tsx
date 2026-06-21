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
  introduction: '自我介绍', behavioral: '行为面试', technical: '专业技能',
  situational: '情景题', career: '职业规划',
};
const QUESTION_TYPE_COLORS: Record<string, string> = {
  introduction: 'bg-blue-50 text-blue-700 border-blue-200', behavioral: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  technical: 'bg-purple-50 text-purple-700 border-purple-200', situational: 'bg-amber-50 text-amber-700 border-amber-200',
  career: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function getWsUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/^http/, 'ws');
}

/* ========== Speech Recognition helper ========== */
function createSpeechRecognition(): any {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const sr = new SpeechRecognition();
  sr.lang = 'zh-CN';
  sr.interimResults = true;
  sr.continuous = true;
  return sr;
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
  const [liveText, setLiveText] = useState('');       // SpeechRecognition real-time
  const [asrLoading, setAsrLoading] = useState(false); // FunASR loading
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [showConfirm, setShowConfirm] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [feedback, setFeedback] = useState<QuestionScore | null>(null);
  const [scoring, setScoring] = useState(false);
  const [hasSpeechAPI, setHasSpeechAPI] = useState(true);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveTextRef = useRef('');

  /* ---------- Cleanup ---------- */
  useEffect(() => { return () => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopAll();
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
  };}, []);

  const stopAll = () => {
    if (speechRef.current) { try { speechRef.current.stop(); } catch {} speechRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  };

  /* ---------- TTS Playback ---------- */
  const playTts = async (buf: ArrayBuffer) => {
    try {
      const ctx = new AudioContext(); const ab = await ctx.decodeAudioData(buf.slice(0));
      const src = ctx.createBufferSource(); src.buffer = ab; src.connect(ctx.destination);
      setTtsPlaying(true); src.onended = () => { setTtsPlaying(false); ctx.close(); }; src.start();
    } catch {}
  };

  /* ---------- WebSocket (TTS only) ---------- */
  const connectWs = useCallback(() => {
    if (!interviewId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const token = localStorage.getItem('access_token'); if (!token) return;
    const ws = new WebSocket(`${getWsUrl()}/api/ws/interview/${interviewId}?token=${token}`);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => setWsConnected(true);
    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) { playTts(e.data); return; }
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'question_score' && !m.error) { setFeedback(m); setScoring(false); setPhase('feedback'); }
        else if (m.type === 'question_score' && m.error) setScoring(false);
      } catch {}
    };
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);
    wsRef.current = ws;
  }, [interviewId]);

  const speak = (text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'tts_request', text, voice: localStorage.getItem('tts_voice') || 'zh-CN-XiaoxiaoNeural' }));
  };

  /* ---------- Load interview ---------- */
  const loadInterview = useCallback(async () => {
    if (!interviewId) { router.push('/dashboard'); return; }
    try {
      setLoading(true); setError('');
      const d = await api.get<{ questions: Question[]; status: string }>(`/api/interview/${interviewId}`);
      if (d.status === 'preparing') await api.post(`/api/interview/${interviewId}/start`);
      setQuestions(d.questions || []);
    } catch (e: any) { setError(e.message || '加载失败'); }
    finally { setLoading(false); }
  }, [interviewId, router]);

  useEffect(() => { loadInterview(); connectWs(); }, [loadInterview, connectWs]);

  /* ---------- Recording ---------- */
  const startRecording = useCallback(async () => {
    setTranscript(''); setLiveText(''); liveTextRef.current = ''; setSubmitState('idle');
    setTimer(0); setAsrLoading(false); chunksRef.current = [];
    connectWs();

    // Check SpeechRecognition availability
    const SR = createSpeechRecognition();
    if (!SR) setHasSpeechAPI(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 1. Start browser SpeechRecognition for real-time display
      if (SR) {
        speechRef.current = SR;
        SR.onresult = (event: any) => {
          let text = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            text += event.results[i][0].transcript;
          }
          liveTextRef.current = text;
          setLiveText(text);
        };
        SR.onerror = () => {}; // ignore errors
        SR.start();
      }

      // 2. Start MediaRecorder for backend FunASR
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        // SpeechRecognition stopped
        if (speechRef.current) { try { speechRef.current.stop(); } catch {} }
        stream.getTracks().forEach(t => t.stop());
        // Send audio to backend FunASR
        sendAudioForASR();
      };
      recorder.start();
      mediaRecorderRef.current = recorder;

      setIsRecording(true); setPhase('recording');
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    } catch {
      // No mic permission — fallback
      setIsRecording(true); setPhase('recording');
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    }
  }, [connectWs]);

  const sendAudioForASR = async () => {
    if (chunksRef.current.length === 0) {
      // Use browser transcript if no audio
      const text = liveTextRef.current;
      setTranscript(text);
      setPhase('review');
      return;
    }
    setAsrLoading(true);
    try {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const arrayBuf = await blob.arrayBuffer();
      const result = await api.post<{ text: string }>(
        `/api/interview/${interviewId}/transcribe`,
        arrayBuf,
      );
      const text = result?.text || liveTextRef.current || '';
      setTranscript(text);
    } catch {
      // Fallback to browser transcript
      setTranscript(liveTextRef.current);
    }
    setAsrLoading(false);
    setPhase('review');
  };

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      sendAudioForASR();
    }
  }, []);

  const [isRecording, setIsRecording] = useState(false);

  /* ---------- Submit ---------- */
  const submitAnswer = useCallback(async (answerText: string, skip: boolean) => {
    if (!interviewId) return;
    const q = questions[currentIndex]; if (!q) return;
    setSubmitState('submitting');
    try {
      await api.post(`/api/interview/${interviewId}/submit-answer`, {
        order_index: q.order_index, answer_transcript: answerText, duration_seconds: skip ? 0 : timer,
      });
    } catch { setSubmitState('error'); return; }

    // Request per-question scoring
    setScoring(true);
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'score_question', order_index: q.order_index }));
    } else {
      moveToNextOrComplete();
    }
  }, [interviewId, currentIndex, questions, timer]);

  const moveToNextOrComplete = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(i => i + 1); setPhase('question');
      setTranscript(''); setLiveText(''); setTimer(0);
      setSubmitState('idle'); setFeedback(null); setScoring(false);
    } else { setShowConfirm(true); }
  }, [currentIndex, questions.length]);

  const handleSkip = useCallback(() => {
    if (submitState === 'submitting') return;
    if (isRecording) { stopRecording(); setTimeout(() => submitAnswer('', true), 300); }
    else submitAnswer('', true);
  }, [submitState, isRecording, submitAnswer, stopRecording]);

  const handleComplete = useCallback(async () => {
    if (!interviewId || completing) return;
    setCompleting(true);
    try { await api.post(`/api/interview/${interviewId}/complete`); router.push(`/interview/result/${interviewId}`); }
    catch { setCompleting(false); setError('完成面试失败'); }
  }, [interviewId, completing, router]);

  /* ---------- Render helpers ---------- */
  const total = questions.length;
  const progress = total > 0 ? (currentIndex / total) * 100 : 0;
  const currentQ = questions[currentIndex];
  const displayText = transcript || liveText || '';

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" /></div>;
  if (error && !currentQ) return <div className="flex flex-col items-center justify-center min-h-screen gap-4"><p className="text-red-500">{error}</p><Link href="/dashboard" className="text-blue-600">返回首页</Link></div>;
  if (!currentQ) return <div className="flex flex-col items-center justify-center min-h-screen gap-4"><p>暂无题目</p><Link href="/dashboard" className="text-blue-600">返回首页</Link></div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-4">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            返回首页
          </Link>
          <div className="flex items-center gap-3">
            <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
            <span className="text-xs text-gray-400">AI 面试</span>
          </div>
        </div>

        {/* Progress */}
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">第 <span className="text-blue-600 font-bold">{currentIndex + 1}</span> / {total} 题</span>
            <span className="text-sm text-gray-400">{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Question Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 sm:px-7 pt-5 sm:pt-7 pb-0">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${QUESTION_TYPE_COLORS[currentQ.question_type] ?? ''}`}>
              {QUESTION_TYPE_MAP[currentQ.question_type] ?? currentQ.question_type}
            </span>
          </div>
          <div className="px-5 sm:px-7 pt-4 pb-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 leading-relaxed flex-1">{currentQ.question_text}</h2>
              {phase === 'question' && !isRecording && (
                <button onClick={() => speak(currentQ.question_text)} disabled={ttsPlaying || !wsConnected}
                  className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-50 hover:bg-blue-100 flex items-center justify-center disabled:opacity-40">
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
            {/* Ready to Record */}
            {phase === 'question' && !isRecording && (
              <div className="flex flex-col items-center gap-6">
                {!hasSpeechAPI && <p className="text-xs text-amber-600 bg-amber-50 px-3 py-1 rounded">浏览器不支持语音识别，录音后通过AI转写</p>}
                <p className="text-sm text-gray-400">准备好后，点击下方按钮开始录音回答</p>
                <button onClick={startRecording} disabled={submitState === 'submitting'}
                  className="relative w-24 h-24 rounded-full bg-white border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 transition-all flex items-center justify-center group disabled:opacity-50">
                  <svg className="w-10 h-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-3 0h6m-3-4a4 4 0 01-4-4V6a4 4 0 118 0v5a4 4 0 01-4 4z" />
                  </svg>
                </button>
                <button onClick={handleSkip} disabled={submitState === 'submitting'}
                  className="px-6 py-2.5 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 disabled:opacity-50">跳过此题</button>
              </div>
            )}

            {/* Recording */}
            {isRecording && (
              <div className="flex flex-col items-center gap-4">
                <div className="text-center">
                  <div className="text-3xl sm:text-4xl font-mono font-bold text-gray-800">{Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}</div>
                  <p className="text-xs text-gray-400 mt-1">录音时长</p>
                </div>
                <div className="relative">
                  <div className="absolute inset-0 rounded-full animate-ping bg-red-400/30" />
                  <button onClick={stopRecording}
                    className="relative w-24 h-24 rounded-full bg-gradient-to-br from-red-500 to-red-600 shadow-lg flex items-center justify-center active:scale-95">
                    <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-3 0h6m-3-4a4 4 0 01-4-4V6a4 4 0 118 0v5a4 4 0 01-4 4z" />
                    </svg>
                  </button>
                </div>
                <p className="text-sm font-medium text-red-500 animate-pulse">录音中...</p>
                {/* Real-time transcript from browser SpeechRecognition */}
                {liveText && (
                  <div className="w-full bg-blue-50 rounded-xl p-3 border border-blue-100 max-h-32 overflow-y-auto">
                    <p className="text-xs text-blue-500 mb-1">实时转写：</p>
                    <p className="text-sm text-gray-600">{liveText}</p>
                  </div>
                )}
                <button onClick={handleSkip} disabled={submitState === 'submitting'}
                  className="px-6 py-2 text-sm text-gray-400 border border-gray-200 rounded-xl hover:text-gray-600 disabled:opacity-50">跳过</button>
              </div>
            )}

            {/* Review */}
            {phase === 'review' && !isRecording && (
              <div className="flex flex-col gap-5">
                {asrLoading && (
                  <div className="flex items-center gap-2 text-sm text-blue-600">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    AI 正在识别语音...
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">你的回答</label>
                  <div className="bg-gray-50 rounded-xl p-4 min-h-[100px] border border-gray-200">
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {displayText || (asrLoading ? '识别中...' : '（未检测到回答内容）')}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">录音时长 {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={() => submitAnswer(displayText, false)} disabled={submitState === 'submitting' || asrLoading || scoring}
                    className="flex-1 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2">
                    {submitState === 'submitting' ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />提交中...</> : '提交回答'}
                  </button>
                  <button onClick={startRecording} disabled={submitState === 'submitting' || asrLoading || scoring}
                    className="px-6 py-3 text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 disabled:opacity-50">重新录音</button>
                  <button onClick={handleSkip} disabled={submitState === 'submitting'}
                    className="px-6 py-3 text-sm text-gray-400 border border-gray-200 rounded-xl hover:text-gray-600 disabled:opacity-50">跳过</button>
                </div>
                {submitState === 'error' && <p className="text-sm text-red-500 text-center">提交失败，请重试</p>}
              </div>
            )}

            {/* Feedback */}
            {phase === 'feedback' && feedback && (
              <div className="flex flex-col gap-5">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                    <span className="text-2xl font-bold">{feedback.total_score}</span><span className="text-xs ml-0.5 mt-1">分</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-2">本题评分</p>
                </div>
                {feedback.dimension_scores && (
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(feedback.dimension_scores).map(([k, v]) => (
                      <div key={k} className="bg-gray-50 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-blue-600">{v}</div>
                        <div className="text-xs text-gray-500">{k==='content_completeness'?'内容':k==='professionalism'?'专业':k==='expression'?'表达':'STAR'}</div>
                      </div>
                    ))}
                  </div>
                )}
                {feedback.evaluation && <div><label className="block text-sm font-medium text-gray-600 mb-2">评语</label><div className="bg-blue-50 rounded-xl p-4 border border-blue-100"><p className="text-sm text-gray-700">{feedback.evaluation}</p></div></div>}
                {feedback.reference_answer && <div><label className="block text-sm font-medium text-gray-600 mb-2">参考答案</label><div className="bg-green-50 rounded-xl p-4 border border-green-100"><p className="text-sm text-gray-700">{feedback.reference_answer}</p></div></div>}
                {feedback.improvement_suggestion && <div><label className="block text-sm font-medium text-gray-600 mb-2">改进建议</label><div className="bg-amber-50 rounded-xl p-4 border border-amber-100"><p className="text-sm text-gray-700">{feedback.improvement_suggestion}</p></div></div>}
                {scoring && <div className="flex items-center justify-center gap-2 text-sm text-blue-600 py-4"><div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />正在评分...</div>}
                <button onClick={moveToNextOrComplete} disabled={scoring}
                  className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-60">
                  {currentIndex < questions.length - 1 ? '下一题' : '查看结果'}
                </button>
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-400 text-center mt-5">请在一个安静的环境中回答，语速清晰</p>
      </div>

      {/* Completion Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 sm:p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">全部回答完成</h3>
            <p className="text-sm text-gray-500 mb-6">你已回答全部 {total} 道题目，确认完成面试？</p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} disabled={completing} className="flex-1 px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-50">再看看</button>
              <button onClick={handleComplete} disabled={completing} className="flex-1 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2">
                {completing ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />提交中...</> : '完成面试'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SessionPage() {
  return <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" /></div>}><SessionContent /></Suspense>;
}
