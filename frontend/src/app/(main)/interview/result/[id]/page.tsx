'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronLeft, Loader2, Award, AlertCircle, Sparkles,
  Clock, FileText, BookOpen, Target,
  Zap, Brain, Star, BarChart3
} from 'lucide-react';
import { api } from '@/lib/api';
import ScoreRadar from '@/components/interview/ScoreRadar';
import QuestionDetail from '@/components/interview/QuestionDetail';
import ExportButtons from '@/components/interview/ExportButtons';

interface QuestionItem {
  order_index: number; question_text: string; question_type: string;
  user_answer_transcript?: string; duration_seconds?: number;
  thinking_duration_seconds?: number; ai_score?: number;
  score_detail?: Record<string, number>; ai_evaluation?: string;
  reference_answer?: string; improvement_suggestion?: string;
}
interface InterviewResult {
  id: string; status: string; difficulty: string;
  total_score: number | null; dimension_scores: Record<string, number> | null;
  ai_overview: string | null; resume_suggestions: string | null;
  questions: QuestionItem[]; created_at: string;
}

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: '初级', mid: '中级', hard: '高级',
};
const DIFFICULTY_CLASS: Record<string, string> = {
  easy: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
  mid: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  hard: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
};

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<InterviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const pollRef = useRef(0);

  useEffect(() => {
    if (!localStorage.getItem('access_token')) { router.push('/login'); return; }
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const data = await api.get<InterviewResult>(`/api/interview/${id}`);
      setResult(data);
      setLoading(false);
      if (data.total_score === null && !data.dimension_scores) {
        setScoring(true);
        startSSE();
        pollForScores();
      }
    } catch (err: any) { setError(err.message || '加载失败'); setLoading(false); }
  };

  const startSSE = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    if (!token) return;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const url = `${apiBase}/api/interview/${id}/stream?token=${encodeURIComponent(token)}`;
    try {
      const es = new EventSource(url);
      es.onmessage = async (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'overview_ready') {
            setResult((prev) => prev ? {
              ...prev,
              total_score: msg.total_score ?? prev.total_score,
              dimension_scores: msg.dimension_scores ?? prev.dimension_scores,
              ai_overview: msg.ai_overview ?? prev.ai_overview,
              resume_suggestions: msg.resume_suggestions ?? prev.resume_suggestions,
            } : prev);
            setScoring(false);
            es.close();
          } else if (msg.type === 'timeout') {
            es.close();
          }
        } catch { es.close(); }
      };
      es.onerror = () => { es.close(); };
    } catch {}
  };

  const pollForScores = async () => {
    for (let i = 0; i < 45; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const data = await api.get<InterviewResult>(`/api/interview/${id}`);
        setResult(data);
        if (data.total_score !== null || data.dimension_scores) {
          setScoring(false); return;
        }
      } catch { return; }
    }
    setScoring(false);
  };

  // Skeleton loader
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
        <div className="max-w-4xl mx-auto px-4 py-12 space-y-6">
          {/* Header skeleton */}
          <div className="flex items-center justify-between animate-pulse">
            <div className="space-y-2">
              <div className="h-8 w-40 bg-gray-200 dark:bg-gray-800 rounded-lg" />
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded-lg" />
            </div>
            <div className="h-4 w-16 bg-gray-200 dark:bg-gray-800 rounded-lg" />
          </div>
          {/* Score skeleton */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-8 animate-pulse">
            <div className="flex flex-col items-center gap-3">
              <div className="h-4 w-20 bg-gray-200 dark:bg-gray-800 rounded-lg" />
              <div className="w-28 h-28 rounded-full bg-gray-200 dark:bg-gray-800" />
            </div>
          </div>
          {/* Radar skeleton */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-6 animate-pulse">
            <div className="h-5 w-32 bg-gray-200 dark:bg-gray-800 rounded-lg mb-4" />
            <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-xl" />
          </div>
          {/* Cards skeleton */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-6 animate-pulse">
              <div className="h-5 w-40 bg-gray-200 dark:bg-gray-800 rounded-lg mb-3" />
              <div className="space-y-2">
                <div className="h-4 w-full bg-gray-100 dark:bg-gray-800 rounded-lg" />
                <div className="h-4 w-3/4 bg-gray-100 dark:bg-gray-800 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-sm mx-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <p className="text-gray-900 dark:text-gray-100 font-semibold mb-1">{error || '面试记录不存在'}</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mb-6">无法加载面试结果，请检查后重试</p>
          <button onClick={() => router.push('/history')} className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all">
            返回历史记录
          </button>
        </div>
      </div>
    );
  }

  const scoredQs = result.questions.filter(q => q.ai_score != null);
  const avgScore = scoredQs.length > 0 ? Math.round(scoredQs.reduce((s, q) => s + (q.ai_score || 0), 0) / scoredQs.length) : null;
  const displayScore = result.total_score ?? avgScore;

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 py-10 sm:py-14 space-y-8">

        {/* ===== Header ===== */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">面试报告</h1>
              <div className="flex items-center gap-3 mt-1.5">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium border ${DIFFICULTY_CLASS[result.difficulty] || ''}`}>
                  {DIFFICULTY_LABEL[result.difficulty] || result.difficulty}
                </span>
                {result.created_at && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(result.created_at).toLocaleDateString('zh-CN')}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => router.push('/history')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
            返回
          </button>
        </div>

        {/* ===== Scoring Indicator (generating state) ===== */}
        {scoring && (
          <div className="flex items-center gap-3 bg-blue-50/80 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-2xl px-5 py-3.5 animate-pulse">
            <div className="relative">
              <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
              <div className="absolute inset-0 rounded-full bg-blue-400/20 animate-ping" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-400">AI 正在生成总评和简历建议</p>
              <p className="text-xs text-blue-500 dark:text-blue-500 mt-0.5">稍后自动更新，无需刷新页面</p>
            </div>
          </div>
        )}

        {/* ===== Score Display ===== */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-8 sm:p-10">
          <div className="flex flex-col sm:flex-row items-center gap-8">
            {/* Big Score Circle */}
            <div className="relative flex-shrink-0">
              <svg className="w-32 h-32 -rotate-90" viewBox="0 0 128 128">
                <circle cx="64" cy="64" r="56" fill="none" stroke="currentColor" strokeWidth="6"
                  className="text-gray-100 dark:text-gray-800" />
                <circle cx="64" cy="64" r="56" fill="none" stroke="currentColor" strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 56}`}
                  strokeDashoffset={`${2 * Math.PI * 56 * (1 - (displayScore || 0) / 100)}`}
                  className="text-blue-500 transition-all duration-1000 ease-out" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-gray-900 dark:text-gray-100">
                  {displayScore ?? '-'}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">/ 100</span>
              </div>
            </div>
            {/* Score Info */}
            <div className="flex-1 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
                <Award className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">总体评分</p>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {result.total_score
                  ? 'AI 已根据各维度表现完成综合评分'
                  : avgScore && !result.total_score
                  ? '基于已答题目的平均分估算，最终结果生成中'
                  : '评分生成中'}
              </p>
              {scoring && (
                <div className="flex items-center gap-2 mt-3 justify-center sm:justify-start">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span className="text-xs text-amber-600 dark:text-amber-400 animate-pulse">生成中</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== Radar Chart ===== */}
        {(result.dimension_scores && Object.keys(result.dimension_scores).length > 0) ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 sm:p-8">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">各维度评分</h2>
            </div>
            <ScoreRadar scores={result.dimension_scores as any} />
          </div>
        ) : scoredQs.length > 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 sm:p-8">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">各维度评分（基于已答题）</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {['content_completeness', 'professionalism', 'expression', 'star_method'].map((k) => {
                const vals = scoredQs.map(q => q.score_detail?.[k] || 0);
                const avg = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
                const labels: Record<string, { label: string; icon: typeof Star }> = {
                  content_completeness: { label: '内容完整性', icon: FileText },
                  professionalism: { label: '专业度', icon: Brain },
                  expression: { label: '表达能力', icon: Target },
                  star_method: { label: 'STAR法则', icon: Zap },
                };
                const info = labels[k] || { label: k, icon: Star };
                const Icon = info.icon;
                return (
                  <div key={k} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 text-center border border-gray-100 dark:border-gray-800">
                    <div className="w-8 h-8 mx-auto mb-2 rounded-lg bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{avg}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{info.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ===== AI Overview ===== */}
        {result.ai_overview ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 sm:p-8">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950/50 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">综合评价</h2>
            </div>
            <div className="pl-0 border-l-0">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-sm">{result.ai_overview}</p>
            </div>
          </div>
        ) : scoring ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 sm:p-8">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950/50 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">综合评价</h2>
            </div>
            <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">生成中...</span>
            </div>
          </div>
        ) : null}

        {/* ===== Question Details ===== */}
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">逐题详情</h2>
          </div>
          {result.questions.map((q) => (
            <QuestionDetail key={q.order_index} question={q} />
          ))}
        </div>

        {/* ===== Resume Suggestions ===== */}
        {result.resume_suggestions ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 sm:p-8">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center">
                <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">简历优化建议</h2>
            </div>
            <div className="pl-0 border-l-0">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-sm">{result.resume_suggestions}</p>
            </div>
          </div>
        ) : scoring ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 sm:p-8">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center">
                <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">简历优化建议</h2>
            </div>
            <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">生成中...</span>
            </div>
          </div>
        ) : null}

        {/* ===== Export ===== */}
        <div className="flex justify-center pt-4 pb-8">
          <ExportButtons interviewId={result.id} />
        </div>
      </div>
    </div>
  );
}
