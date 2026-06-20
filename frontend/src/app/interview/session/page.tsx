'use client';

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

/* ---------- Types ---------- */

interface Question {
  order_index: number;
  question_text: string;
  question_type: 'introduction' | 'behavioral' | 'technical' | 'situational' | 'career';
}

type Phase = 'question' | 'recording' | 'review';

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
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [showConfirm, setShowConfirm] = useState(false);
  const [completing, setCompleting] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  /* ---------- Cleanup timer on unmount ---------- */
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId]);

  /* ---------- Recording ---------- */
  const startRecording = useCallback(async () => {
    setTranscript('');
    setSubmitState('idle');
    setTimer(0);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        // In production, send chunksRef.current to a speech-to-text API.
        // For now we simulate a transcript.
        const fakeTranscript =
          '（语音识别转写结果：' +
          (questions[currentIndex]?.question_text?.slice(0, 30) ?? '') +
          '…）';
        setTranscript(fakeTranscript);
        setPhase('review');
      };

      recorder.start();
      mediaRecorderRef.current = recorder;

      setIsRecording(true);
      setPhase('recording');
      timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    } catch {
      // Fallback: simulate recording if getUserMedia fails (e.g. no mic permission)
      setIsRecording(true);
      setPhase('recording');
      timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, questions]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      // Fallback: simulate transcript
      const fakeTranscript =
        '（语音识别转写结果：' +
        (questions[currentIndex]?.question_text?.slice(0, 30) ?? '') +
        '…）';
      setTranscript(fakeTranscript);
      setPhase('review');
    }
  }, [currentIndex, questions]);

  /* We need isRecording as a separate flag because phase changes
     from 'recording' to 'review' happen asynchronously (on recorder.onstop).
     So we use a plain state to gate the UI during the actual recording. */
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
          question_id: q.order_index,
          answer_transcript: answerText,
          duration_seconds: skip ? 0 : timer,
        });
        setSubmitState('success');
      } catch {
        setSubmitState('error');
        return;
      }

      // Move to next question or show completion
      if (currentIndex < questions.length - 1) {
        setCurrentIndex((i) => i + 1);
        setPhase('question');
        setTranscript('');
        setTimer(0);
        setSubmitState('idle');
      } else {
        // All questions answered – show completion confirmation
        setShowConfirm(true);
      }
    },
    [interviewId, currentIndex, questions, timer],
  );

  /* ---------- Skip ---------- */
  const handleSkip = useCallback(() => {
    if (submitState === 'submitting') return;
    if (isRecording) {
      // Stop recording first, then submit empty
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      // submit empty after a tiny delay so state settles
      setTimeout(() => submitAnswer('', true), 100);
    } else {
      submitAnswer('', true);
    }
  }, [submitState, isRecording, submitAnswer]);

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
  const progress = total > 0 ? ((currentIndex) / total) * 100 : 0;

  const currentQ = questions[currentIndex];

  /* ========== Render ========== */

  /* ---- Loading ---- */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 gap-4">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">加载面试题目...</p>
      </div>
    );
  }

  /* ---- Error ---- */
  if (error) {
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
            <button
              onClick={() => router.push('/dashboard')}
              className="px-5 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              返回首页
            </button>
            <button
              onClick={loadInterview}
              className="px-5 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              重试
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---- Empty state ---- */
  if (!currentQ) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 gap-4 px-4">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md w-full text-center">
          <p className="text-gray-700 font-medium mb-2">暂无面试题目</p>
          <p className="text-sm text-gray-500 mb-6">请联系管理员创建题目。</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-5 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  /* ---- Main UI ---- */
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10">
        {/* ======== Progress Bar ======== */}
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">
              第 <span className="text-blue-600 font-bold">{currentIndex + 1}</span> / {total} 题
            </span>
            <span className="text-sm text-gray-400">{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          {/* Question dots */}
          <div className="flex gap-1.5 mt-3">
            {questions.map((_, i) => (
              <div
                key={i}
                className={`h-2 flex-1 rounded-full transition-colors duration-300 ${
                  i < currentIndex
                    ? 'bg-blue-500'
                    : i === currentIndex
                    ? 'bg-blue-300'
                    : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* ======== Question Card ======== */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Type badge */}
          <div className="px-5 sm:px-7 pt-5 sm:pt-7 pb-0">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${
                QUESTION_TYPE_COLORS[currentQ.question_type] ?? 'bg-gray-50 text-gray-600 border-gray-200'
              }`}
            >
              {QUESTION_TYPE_MAP[currentQ.question_type] ?? currentQ.question_type}
            </span>
          </div>

          {/* Question text */}
          <div className="px-5 sm:px-7 pt-4 pb-6">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 leading-relaxed">
              {currentQ.question_text}
            </h2>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100" />

          {/* ======== Answer Area ======== */}
          <div className="px-5 sm:px-7 py-6 sm:py-8">
            {/* ----- Question Phase (ready to record) ----- */}
            {phase === 'question' && !isRecording && (
              <div className="flex flex-col items-center gap-6">
                <p className="text-sm text-gray-400">准备好后，点击下方按钮开始录音回答</p>

                {/* Large mic button */}
                <button
                  onClick={startRecording}
                  disabled={submitState === 'submitting'}
                  className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-white border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 flex items-center justify-center group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg
                    className="w-10 h-10 sm:w-12 sm:h-12 text-blue-500 group-hover:text-blue-600 transition-colors"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-3 0h6m-3-4a4 4 0 01-4-4V6a4 4 0 118 0v5a4 4 0 01-4 4z"
                    />
                  </svg>
                </button>

                <div className="flex gap-3 w-full sm:w-auto">
                  <button
                    onClick={handleSkip}
                    disabled={submitState === 'submitting'}
                    className="flex-1 sm:flex-none px-6 py-2.5 text-sm font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    跳过此题
                  </button>
                </div>
              </div>
            )}

            {/* ----- Recording Phase ----- */}
            {isRecording && (
              <div className="flex flex-col items-center gap-6">
                {/* Timer */}
                <div className="text-center">
                  <div className="text-3xl sm:text-4xl font-mono font-bold text-gray-800 tabular-nums">
                    {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">录音时长</p>
                </div>

                {/* Recording mic with pulse */}
                <div className="relative">
                  {/* Pulse rings */}
                  <div className="absolute inset-0 rounded-full animate-ping bg-red-400/30" />
                  <div className="absolute inset-0 rounded-full animate-pulse bg-red-400/20" style={{ animationDelay: '0.5s' }} />

                  {/* Mic button */}
                  <button
                    onClick={stopRecording}
                    className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-200 hover:shadow-red-300 hover:from-red-600 hover:to-red-700 transition-all duration-200 flex items-center justify-center active:scale-95"
                  >
                    <svg className="w-10 h-10 sm:w-12 sm:h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-3 0h6m-3-4a4 4 0 01-4-4V6a4 4 0 118 0v5a4 4 0 01-4 4z"
                      />
                    </svg>
                  </button>
                </div>

                <p className="text-sm font-medium text-red-500 animate-pulse">录音中...</p>

                {/* Skip while recording */}
                <button
                  onClick={handleSkip}
                  disabled={submitState === 'submitting'}
                  className="px-6 py-2 text-sm text-gray-400 border border-gray-200 rounded-xl hover:text-gray-600 hover:border-gray-300 transition-colors disabled:opacity-50"
                >
                  跳过此题
                </button>
              </div>
            )}

            {/* ----- Review Phase (transcript preview) ----- */}
            {phase === 'review' && !isRecording && (
              <div className="flex flex-col gap-5">
                {/* Transcript */}
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">你的回答</label>
                  <div className="bg-gray-50 rounded-xl p-4 min-h-[100px] border border-gray-200">
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {transcript || '（未检测到回答内容）'}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    录音时长 {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Submit */}
                  <button
                    onClick={() => submitAnswer(transcript, false)}
                    disabled={submitState === 'submitting'}
                    className="flex-1 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitState === 'submitting' ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        提交中...
                      </>
                    ) : (
                      '提交回答'
                    )}
                  </button>

                  {/* Re-record */}
                  <button
                    onClick={startRecording}
                    disabled={submitState === 'submitting'}
                    className="flex-1 sm:flex-none px-6 py-3 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    重新录音
                  </button>

                  {/* Skip */}
                  <button
                    onClick={handleSkip}
                    disabled={submitState === 'submitting'}
                    className="flex-1 sm:flex-none px-6 py-3 text-sm font-medium text-gray-400 border border-gray-200 rounded-xl hover:text-gray-600 hover:border-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    跳过
                  </button>
                </div>

                {/* Submit error */}
                {submitState === 'error' && (
                  <p className="text-sm text-red-500 text-center">提交失败，请重试</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ======== Hint ======== */}
        <p className="text-xs text-gray-400 text-center mt-5">
          请在一个安静的环境中回答，语速清晰
        </p>
      </div>

      {/* ======== Completion Confirmation Modal ======== */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 sm:p-8 text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">全部回答完成</h3>
            <p className="text-sm text-gray-500 mb-6">
              你已回答全部 {total} 道题目，确认完成面试并查看评估报告吗？
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={completing}
                className="flex-1 px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                再看看
              </button>
              <button
                onClick={handleComplete}
                disabled={completing}
                className="flex-1 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {completing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    提交中...
                  </>
                ) : (
                  '完成面试'
                )}
              </button>
            </div>
            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== Page Wrapper with Suspense ========== */

export default function SessionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 gap-4">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">加载中...</p>
        </div>
      }
    >
      <SessionContent />
    </Suspense>
  );
}
