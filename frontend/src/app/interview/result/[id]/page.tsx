'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import ScoreRadar from '@/components/interview/ScoreRadar';
import QuestionDetail from '@/components/interview/QuestionDetail';
import ExportButtons from '@/components/interview/ExportButtons';

interface QuestionItem {
  order_index: number; question_text: string; question_type: string;
  user_answer_transcript?: string; ai_score?: number;
  score_detail?: Record<string, number>; ai_evaluation?: string;
  reference_answer?: string; improvement_suggestion?: string;
}
interface InterviewResult {
  id: string; status: string; difficulty: string;
  total_score: number | null; dimension_scores: Record<string, number> | null;
  ai_overview: string | null; resume_suggestions: string | null;
  questions: QuestionItem[]; created_at: string;
}

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<InterviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);  // 总评还在生成中
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
      // 如果总评还没生成，先用 SSE 实时推送 + 轮询兜底
      if (data.total_score === null && !data.dimension_scores) {
        setScoring(true);
        startSSE();       // 优先 SSE 推送
        pollForScores();  // 轮询兜底
      }
    } catch (err: any) { setError(err.message || '加载失败'); setLoading(false); }
  };

  // SSE: 实时接收总评完成推送（比轮询更快）
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
            // SSE 推送了完整数据，直接更新
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
      es.onerror = () => { es.close(); }; // 出错关闭，让轮询接手
    } catch {} // SSE 不支持时静默失败，轮询接手
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

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"/></div>;
  }
  if (error || !result) {
    return <div className="flex flex-col items-center justify-center min-h-screen gap-4"><p className="text-red-500">{error || '面试记录不存在'}</p><button onClick={() => router.push('/history')} className="text-blue-600">返回</button></div>;
  }

  // 计算各题均分（从已有逐题分数）
  const scoredQs = result.questions.filter(q => q.ai_score != null);
  const avgScore = scoredQs.length > 0 ? Math.round(scoredQs.reduce((s, q) => s + (q.ai_score || 0), 0) / scoredQs.length) : null;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">面试报告</h1>
          <p className="text-gray-500 mt-1">难度：{result.difficulty === 'easy' ? '初级' : result.difficulty === 'hard' ? '高级' : '中级'}</p>
        </div>
        <button onClick={() => router.push('/history')} className="text-blue-600 hover:underline flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg> 返回
        </button>
      </div>

      {/* Scoring indicator */}
      {scoring && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/>
          <p className="text-sm text-blue-700">AI 正在后台生成总评和简历建议，稍后自动更新…</p>
        </div>
      )}

      {/* Overall Score */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="text-center">
          <p className="text-gray-500 mb-2">总体评分</p>
          <p className="text-6xl font-bold text-blue-600">
            {result.total_score ?? avgScore ?? '-'}
          </p>
          <p className="text-sm text-gray-400 mt-1">满分 100{avgScore && !result.total_score ? '（基于已答题估算）' : ''}</p>
        </div>
      </div>

      {/* Radar Chart */}
      {(result.dimension_scores && Object.keys(result.dimension_scores).length > 0) ? (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">各维度评分</h2>
          <ScoreRadar scores={result.dimension_scores as any} />
        </div>
      ) : scoredQs.length > 0 ? (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">各维度评分（基于已答题）</h2>
          <div className="grid grid-cols-4 gap-2 text-center">
            {['content_completeness','professionalism','expression','star_method'].map(k => {
              const vals = scoredQs.map(q => q.score_detail?.[k] || 0);
              const avg = vals.length > 0 ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : 0;
              return <div key={k} className="bg-gray-50 rounded-lg p-3"><div className="text-xl font-bold text-blue-600">{avg}</div><div className="text-xs text-gray-500">{k==='content_completeness'?'内容':k==='professionalism'?'专业':k==='expression'?'表达':'STAR'}</div></div>;
            })}
          </div>
        </div>
      ) : null}

      {/* AI Overview */}
      {result.ai_overview ? (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-2">综合评价</h2>
          <p className="text-gray-700">{result.ai_overview}</p>
        </div>
      ) : scoring ? (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-2">综合评价</h2>
          <p className="text-gray-400 text-sm">生成中…</p>
        </div>
      ) : null}

      {/* Question Details — 立即展示 */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">逐题详情</h2>
        {result.questions.map((q) => (
          <QuestionDetail key={q.order_index} question={q} />
        ))}
      </div>

      {/* Resume Suggestions */}
      {result.resume_suggestions ? (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-2">简历优化建议</h2>
          <p className="text-gray-700">{result.resume_suggestions}</p>
        </div>
      ) : scoring ? (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-2">简历优化建议</h2>
          <p className="text-gray-400 text-sm">生成中…</p>
        </div>
      ) : null}

      {/* Export */}
      <div className="flex justify-center">
        <ExportButtons interviewId={result.id} />
      </div>
    </div>
  );
}
