'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import ScoreRadar from '@/components/interview/ScoreRadar';
import QuestionDetail from '@/components/interview/QuestionDetail';
import ExportButtons from '@/components/interview/ExportButtons';

interface QuestionItem {
  order_index: number;
  question_text: string;
  question_type: string;
  user_answer_transcript?: string;
  ai_score?: number;
  score_detail?: Record<string, number>;
  ai_evaluation?: string;
  reference_answer?: string;
  improvement_suggestion?: string;
}

interface InterviewResult {
  id: string;
  status: string;
  difficulty: string;
  total_score: number | null;
  dimension_scores: Record<string, number> | null;
  ai_overview: string | null;
  resume_suggestions: string | null;
  questions: QuestionItem[];
  created_at: string;
}

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<InterviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }
    loadResult();
  }, [id]);

  const loadResult = async () => {
    try {
      const data = await api.get<InterviewResult>(`/api/interview/${id}`);
      setResult(data);
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-red-500">{error || '面试记录不存在'}</p>
        <Link href="/dashboard" className="text-blue-600 hover:underline">返回仪表盘</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">面试报告</h1>
          <p className="text-gray-500 mt-1">难度：{result.difficulty === 'easy' ? '初级' : result.difficulty === 'hard' ? '高级' : '中级'}</p>
        </div>
        <button onClick={() => router.push('/history')} className="text-blue-600 hover:underline flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg> 返回
        </button>
      </div>

      {/* Overall Score */}
      <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm">
        <div className="text-center">
          <p className="text-gray-500 mb-2">总体评分</p>
          <p className="text-6xl font-bold text-blue-600">
            {result.total_score ?? '-'}
          </p>
          <p className="text-sm text-gray-400 mt-1">满分 100</p>
        </div>
      </div>

      {/* Radar Chart */}
      {result.dimension_scores && (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">各维度评分</h2>
          <ScoreRadar scores={result.dimension_scores as any} />
        </div>
      )}

      {/* AI Overview */}
      {result.ai_overview && (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-2">综合评价</h2>
          <p className="text-gray-700 dark:text-gray-300">{result.ai_overview}</p>
        </div>
      )}

      {/* Question Details */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">逐题详情</h2>
        {result.questions.map((q) => (
          <QuestionDetail key={q.order_index} question={q} />
        ))}
      </div>

      {/* Resume Suggestions */}
      {result.resume_suggestions && (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-2">简历优化建议</h2>
          <p className="text-gray-700 dark:text-gray-300">{result.resume_suggestions}</p>
        </div>
      )}

      {/* Export */}
      <div className="flex justify-center">
        <ExportButtons interviewId={result.id} />
      </div>
    </div>
  );
}
