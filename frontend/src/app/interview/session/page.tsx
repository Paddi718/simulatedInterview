'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

interface Question {
  order_index: number;
  question_text: string;
  question_type: string;
}

function SessionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const interviewId = searchParams.get('id');

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [timer, setTimer] = useState(0);
  const [phase, setPhase] = useState<'question' | 'recording' | 'feedback'>('question');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!interviewId) {
      router.push('/dashboard');
      return;
    }
    loadInterview();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [interviewId]);

  const loadInterview = async () => {
    try {
      const data = await api.get<{ questions: Question[]; status: string }>(`/api/interview/${interviewId}`);
      // Start the interview if not started
      if (data.status === 'preparing') {
        await api.post(`/api/interview/${interviewId}/start`);
      }
      setQuestions(data.questions || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startRecording = () => {
    setIsRecording(true);
    setTimer(0);
    timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    setPhase('recording');
    // Simulated recording — in production, this would use MediaRecorder API
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    // Simulate transcript
    setTranscript('（模拟语音识别转写：面试者回答了关于' + questions[currentIndex]?.question_text?.slice(0, 20) + '...的问题）');
    setPhase('feedback');
  };

  const handleNext = async () => {
    if (currentIndex < questions.length - 1) {
      const nextIdx = currentIndex + 1;
      // Submit current answer
      try {
        await api.post(`/api/interview/${interviewId}/submit-answer`, {
          question_id: questions[currentIndex]?.order_index,
          answer_transcript: transcript,
          duration_seconds: timer,
        });
      } catch (err) {
        console.error('Failed to submit answer:', err);
      }
      setCurrentIndex(nextIdx);
      setTranscript('');
      setTimer(0);
      setPhase('question');
    } else {
      // Complete interview
      try {
        await api.post(`/api/interview/${interviewId}/complete`);
        router.push(`/interview/result/${interviewId}`);
      } catch (err) {
        console.error('Failed to complete interview:', err);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-red-500">{error}</p>
        <button onClick={() => router.push('/dashboard')} className="text-blue-600 hover:underline">返回仪表盘</button>
      </div>
    );
  }

  const currentQ = questions[currentIndex];

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-500 mb-2">
          <span>第 {currentIndex + 1} / {questions.length} 题</span>
          <span>{Math.round(((currentIndex) / questions.length) * 100)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all"
            style={{ width: `${((currentIndex) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question Display */}
      {currentQ && (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-8 shadow-sm mb-8">
          <div className="text-sm text-blue-600 mb-2">
            {currentQ.question_type === 'introduction' ? '自我介绍' :
             currentQ.question_type === 'behavioral' ? '行为面试' :
             currentQ.question_type === 'technical' ? '专业技能' :
             currentQ.question_type === 'situational' ? '情景题' : '职业规划'}
          </div>
          <h2 className="text-xl font-semibold mb-6">{currentQ.question_text}</h2>

          {/* Recording Controls */}
          <div className="flex flex-col items-center gap-4">
            {phase === 'question' && (
              <button
                onClick={startRecording}
                className="px-8 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 flex items-center gap-2"
              >
                🎤 开始回答
              </button>
            )}

            {isRecording && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-red-500 rounded-full animate-pulse mx-auto" />
                <p className="text-red-500 font-medium">录音中... {timer}s</p>
                <button onClick={stopRecording} className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">
                  停止录音
                </button>
              </div>
            )}

            {phase === 'feedback' && (
              <div className="w-full space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">你的回答：</p>
                  <p>{transcript}</p>
                </div>
                <button onClick={handleNext} className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700">
                  {currentIndex < questions.length - 1 ? '下一题' : '完成面试'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SessionPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" /></div>}>
      <SessionContent />
    </Suspense>
  );
}
