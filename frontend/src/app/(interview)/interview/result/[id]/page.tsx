'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronLeft, Loader2, Award, AlertCircle, Sparkles,
  Clock, FileText, BookOpen, Target,
  Zap, Brain, Star, BarChart3, RefreshCw, AlertTriangle,
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
  scoring_status?: string | null;
  scoring_progress?: string | null;
  scoring_error?: string | null;
}

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: '初级', mid: '中级', hard: '高级',
};
const DIFFICULTY_CLASS: Record<string, string> = {
  easy: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
  mid: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  hard: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
};

// 轮询间隔（毫秒）
const POLL_INTERVAL = 2500;
// 最大轮询次数（2.5s * 48 = 120s，足够覆盖评分+总评生成）
const MAX_POLLS = 48;

/**
 * 评分阶段对应的中文描述
 */
function scoringPhaseLabel(status: string | null | undefined): string {
  switch (status) {
    case 'pending': return '准备评分...';
    case 'scoring_questions': return 'AI 正在逐题评分';
    case 'aggregating': return '正在计算总分';
    case 'generating_overview': return 'AI 正在生成总评和简历建议';
    case 'done': return '评分完成';
    case 'failed': return '评分失败';
    default: return '分析中...';
  }
}

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [result, setResult] = useState<InterviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  // 清理定时器
  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // 初始加载
  useEffect(() => {
    if (!localStorage.getItem('access_token')) {
      router.push('/login');
      return;
    }

    let cancelled = false;
    cancelledRef.current = false;

    const load = async () => {
      try {
        const data = await api.get<InterviewResult>(`/api/interview/${id}`);
        if (cancelled || cancelledRef.current) return;

        // 未完成 → 跳转续答
        if (data.status !== 'completed') {
          router.replace(`/interview/session?id=${id}`);
          return;
        }

        setResult(data);
        setLoading(false);

        // 判断是否需要轮询等待评分
        const needsPolling =
          data.scoring_status &&
          data.scoring_status !== 'done' &&
          data.scoring_status !== 'failed';

        if (needsPolling) {
          setPolling(true);
          startPolling();
        }
      } catch (err: any) {
        if (!cancelled && !cancelledRef.current) {
          setError(err.message || '加载失败');
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      cancelledRef.current = true;
      clearPollTimer();
    };
  }, [id]);

  // 轮询逻辑
  const startPolling = useCallback(() => {
    let count = 0;

    const poll = async () => {
      if (cancelledRef.current) return;
      if (count >= MAX_POLLS) {
        // 超时：停止轮询，显示当前已有的数据
        setPolling(false);
        return;
      }

      count++;
      setPollCount(count);

      try {
        const data = await api.get<InterviewResult>(`/api/interview/${id}`);
        if (cancelledRef.current) return;

        setResult(data);

        // 评分完成或失败 → 停止轮询
        if (!data.scoring_status || data.scoring_status === 'done' || data.scoring_status === 'failed') {
          setPolling(false);
          return;
        }

        // 继续轮询
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL);
      } catch {
        // 网络错误不中断轮询
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL);
      }
    };

    pollTimerRef.current = setTimeout(poll, POLL_INTERVAL);
  }, [id]);

  // 手动重试生成总评
  const handleRetryOverview = async () => {
    setRetrying(true);
    try {
      await api.post(`/api/interview/${id}/rescore`);
      // 重新开始轮询
      setPolling(true);
      setPollCount(0);
      startPolling();
    } catch (err: any) {
      alert('重试失败：' + (err.message || '未知错误'));
    } finally {
      setRetrying(false);
    }
  };

  // ===== Loading Skeleton =====
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
        <div className="max-w-4xl mx-auto px-4 py-12 space-y-6">
          <div className="flex items-center justify-between animate-pulse">
            <div className="space-y-2">
              <div className="h-8 w-40 bg-gray-200 dark:bg-gray-800 rounded-lg" />
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded-lg" />
            </div>
            <div className="h-4 w-16 bg-gray-200 dark:bg-gray-800 rounded-lg" />
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-8 animate-pulse">
            <div className="flex flex-col items-center gap-3">
              <div className="h-4 w-20 bg-gray-200 dark:bg-gray-800 rounded-lg" />
              <div className="w-28 h-28 rounded-full bg-gray-200 dark:bg-gray-800" />
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-6 animate-pulse">
            <div className="h-5 w-32 bg-gray-200 dark:bg-gray-800 rounded-lg mb-4" />
            <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-xl" />
          </div>
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

  // ===== Error State =====
  if (error || !result) {
    return (
      <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-sm mx-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <p className="text-gray-900 dark:text-gray-100 font-semibold mb-1">{error || '面试记录不存在'}</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mb-6">无法加载面试结果，请检查后重试</p>
          <button onClick={() => router.push('/history')} className="px-5 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-xl hover:bg-brand-600 transition-all">
            返回历史记录
          </button>
        </div>
      </div>
    );
  }

  const scoredQs = result.questions.filter(q => q.ai_score != null);
  const avgScore = scoredQs.length > 0 ? Math.round(scoredQs.reduce((s, q) => s + (q.ai_score || 0), 0) / scoredQs.length) : null;
  const displayScore = result.total_score ?? avgScore;

  // 评分是否还在进行中
  const isScoring = polling || (result.scoring_status != null && result.scoring_status !== 'done' && result.scoring_status !== 'failed');
  const isFailed = result.scoring_status === 'failed';
  const showOverviewLoading = isScoring && !result.ai_overview;
  const showSuggestionsLoading = isScoring && !result.resume_suggestions;

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 py-10 sm:py-14 space-y-8">

        {/* ===== Header ===== */}
        <div className="flex items-start justify-between">
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/history')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
              返回
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await api.post<{ id: string }>(`/api/interview/${result.id}/retry`);
                  router.push(`/interview/session?id=${res.id}`);
                } catch (err: any) {
                  alert('重新模拟失败：' + (err.message || '未知错误'));
                }
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-brand-500 bg-brand-50 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-800 rounded-xl hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              重新模拟
            </button>
          </div>
        </div>

        {/* ===== Scoring Progress Indicator ===== */}
        {isScoring && (
          <div className="bg-brand-50/80 dark:bg-brand-950/30 border border-brand-100 dark:border-brand-900 rounded-2xl px-5 py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-brand-500 dark:text-brand-400 animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-brand-700 dark:text-brand-300">
                  {scoringPhaseLabel(result.scoring_status)}
                </p>
                <p className="text-xs text-brand-500/70 dark:text-brand-400/70 mt-0.5">
                  {result.scoring_status === 'scoring_questions' && result.scoring_progress
                    ? `已完成 ${result.scoring_progress} 题`
                    : '请稍候，结果将自动更新'}
                </p>
              </div>
              {pollCount > 0 && (
                <span className="text-xs text-brand-400 dark:text-brand-500 shrink-0">
                  {Math.round(pollCount * POLL_INTERVAL / 1000)}s
                </span>
              )}
            </div>
            {/* 进度条 */}
            <div className="mt-3 h-1.5 bg-brand-100 dark:bg-brand-900/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded-full transition-all duration-700 ease-out"
                style={{
                  width: result.scoring_status === 'scoring_questions'
                    ? '40%'
                    : result.scoring_status === 'aggregating'
                    ? '60%'
                    : result.scoring_status === 'generating_overview'
                    ? '80%'
                    : '20%'
                }}
              />
            </div>
          </div>
        )}

        {/* ===== Failed State ===== */}
        {isFailed && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl px-5 py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-700 dark:text-red-300">评分过程出错</p>
                <p className="text-xs text-red-500/80 dark:text-red-400/80 mt-0.5">
                  {result.scoring_error || '未知错误，请重试'}
                </p>
              </div>
              <button
                onClick={handleRetryOverview}
                disabled={retrying}
                className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors disabled:opacity-50"
              >
                {retrying ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                重新生成
              </button>
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
                  className="text-brand-500 transition-all duration-1000 ease-out" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-gray-900 dark:text-gray-100">
                  {displayScore ?? '--'}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">/ 100</span>
              </div>
            </div>
            {/* Score Info */}
            <div className="flex-1 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
                <Award className="w-5 h-5 text-brand-500 dark:text-brand-400" />
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">总体评分</p>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {isScoring
                  ? 'AI 正在分析你的面试表现，请稍候...'
                  : result.total_score != null
                  ? 'AI 已根据各维度表现完成综合评分'
                  : avgScore != null
                  ? '基于已答题目的平均分估算'
                  : '暂无评分数据'}
              </p>
            </div>
          </div>
        </div>

        {/* ===== Radar / Dimension Scores ===== */}
        {(result.dimension_scores && Object.keys(result.dimension_scores).length > 0) ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 sm:p-8">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-950/50 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-brand-500 dark:text-brand-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">各维度评分</h2>
            </div>
            <ScoreRadar scores={result.dimension_scores as any} />
          </div>
        ) : scoredQs.length > 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 sm:p-8">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-950/50 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-brand-500 dark:text-brand-400" />
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
                    <div className="w-8 h-8 mx-auto mb-2 rounded-lg bg-brand-100 dark:bg-brand-950/40 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-brand-500 dark:text-brand-400" />
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
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-sm whitespace-pre-line">{result.ai_overview}</p>
          </div>
        ) : showOverviewLoading ? (
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
            <QuestionDetail key={q.order_index} question={q} interviewId={result.id} />
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
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-sm whitespace-pre-line">{result.resume_suggestions}</p>
          </div>
        ) : showSuggestionsLoading ? (
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
