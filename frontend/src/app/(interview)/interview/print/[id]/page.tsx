'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Loader2 } from 'lucide-react';

interface Question {
  order_index: number;
  question_text: string;
  question_type: string;
  user_answer_transcript?: string | null;
  ai_score?: number | null;
  score_detail?: Record<string, number> | null;
  ai_evaluation?: string | null;
  reference_answer?: string | null;
  improvement_suggestion?: string | null;
}

interface InterviewData {
  id: string;
  interview_category: string;
  category_config?: Record<string, any> | null;
  difficulty?: string;
  total_score?: number | null;
  score_detail?: Record<string, number> | null;
  ai_evaluation?: string | null;
  started_at?: string | null;
  questions: Question[];
}

const CAT_LABELS: Record<string, string> = {
  private_enterprise: '私企面试',
  civil_service: '公务员面试',
  institution: '事业单位面试',
};

const TYPE_LABELS: Record<string, string> = {
  behavioral: '行为面试',
  technical: '专业技术',
  situational: '情境模拟',
  knowledge: '专业知识',
  analysis: '综合分析',
  planning: '组织协调',
  emergency: '应急应变',
  interpersonal: '人际沟通',
  expression: '语言表达',
};

const DIFF_LABELS: Record<string, string> = {
  easy: '初级', mid: '中级', hard: '高级',
};

export default function PrintPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<InterviewData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<InterviewData>(`/api/interview/${id}`)
      .then(d => {
        setData(d);
        // 数据加载完后自动弹出打印对话框
        setTimeout(() => window.print(), 600);
      })
      .catch(e => setError(e.message || '加载失败'));
  }, [id]);

  if (error) {
    return <p className="p-8 text-red-500 text-center">加载失败：{error}</p>;
  }
  if (!data) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>;
  }

  const cat = data.interview_category || 'private_enterprise';
  const catLabel = CAT_LABELS[cat] || '面试';
  const difficulty = DIFF_LABELS[data.difficulty || ''] || data.difficulty || '-';
  const dateStr = data.started_at
    ? new Date(data.started_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
    : '-';

  return (
    <div className="max-w-[210mm] mx-auto p-6 text-gray-900 print:p-0 print:max-w-none">
      {/* 页面顶部按钮 — 打印时隐藏 */}
      <div className="flex justify-between items-center mb-6 print:hidden">
        <h1 className="text-xl font-bold">打印预览</h1>
        <button
          onClick={() => window.print()}
          className="px-5 py-2 bg-brand-500 text-white rounded-xl text-sm font-medium"
        >
          打印 / 另存为 PDF
        </button>
      </div>

      {/* ── 报告内容 ── */}
      <div className="space-y-5 text-[13px] leading-relaxed">
        {/* 标题 */}
        <div className="text-center border-b pb-4">
          <h1 className="text-2xl font-bold text-brand-600">模拟面试报告</h1>
          <p className="text-gray-500 mt-1">生成日期：{new Date().toLocaleDateString('zh-CN')}</p>
        </div>

        {/* 概要 */}
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr className="border-b"><td className="py-1.5 pr-4 text-gray-500 w-24">面试类别</td><td className="py-1.5 font-medium">{catLabel}</td></tr>
            <tr className="border-b"><td className="py-1.5 pr-4 text-gray-500">难度级别</td><td className="py-1.5 font-medium">{difficulty}</td></tr>
            <tr className="border-b"><td className="py-1.5 pr-4 text-gray-500">面试日期</td><td className="py-1.5 font-medium">{dateStr}</td></tr>
            <tr className="border-b"><td className="py-1.5 pr-4 text-gray-500">题目数量</td><td className="py-1.5 font-medium">{data.questions.length} 题</td></tr>
          </tbody>
        </table>

        {/* 总分 */}
        {data.total_score != null && (
          <div className="text-center py-3 bg-brand-50 rounded-xl">
            <div className="text-4xl font-bold text-brand-600">{data.total_score}</div>
            <div className="text-xs text-gray-500 mt-0.5">总分 / 100</div>
          </div>
        )}

        {/* 维度分数 */}
        {data.score_detail && Object.keys(data.score_detail).length > 0 && (
          <div>
            <h2 className="text-base font-bold text-brand-600 mb-2">评分维度</h2>
            <div className="flex flex-wrap gap-3">
              {Object.entries(data.score_detail).map(([k, v]) => (
                <div key={k} className="bg-gray-50 rounded-lg px-3 py-2 text-center min-w-[80px]">
                  <div className="text-lg font-bold text-brand-600">{v}</div>
                  <div className="text-[11px] text-gray-500">{k}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 总评 */}
        {data.ai_evaluation && (
          <div>
            <h2 className="text-base font-bold text-brand-600 mb-2">综合总评</h2>
            <p className="text-gray-700 bg-gray-50 rounded-lg p-3">{data.ai_evaluation}</p>
          </div>
        )}

        {/* 逐题详情 */}
        <div>
          <h2 className="text-base font-bold text-brand-600 mb-3">逐题详情</h2>
          {data.questions.map((q, i) => (
            <div key={i} className="mb-4 border rounded-lg overflow-hidden print:break-inside-avoid">
              {/* 题头 */}
              <div className="bg-brand-500 text-white px-3 py-1.5 text-xs font-bold">
                第 {q.order_index} 题 · {TYPE_LABELS[q.question_type] || q.question_type}
                {q.ai_score != null && <span className="ml-3">得分：{q.ai_score} 分</span>}
              </div>
              <div className="p-3 space-y-2">
                {/* 题目 */}
                <div>
                  <div className="text-[11px] text-gray-400 mb-0.5">题目</div>
                  <p className="text-sm font-medium">{q.question_text}</p>
                </div>
                {/* 你的回答 */}
                {q.user_answer_transcript && (
                  <div>
                    <div className="text-[11px] text-gray-400 mb-0.5">你的回答</div>
                    <p className="text-gray-700">{q.user_answer_transcript}</p>
                  </div>
                )}
                {/* 维度分数 */}
                {q.score_detail && Object.keys(q.score_detail).length > 0 && (
                  <div className="flex gap-3 text-xs">
                    {Object.entries(q.score_detail).map(([k, v]) => (
                      <span key={k} className="bg-brand-50 text-brand-700 px-2 py-0.5 rounded">{k}: {v}</span>
                    ))}
                  </div>
                )}
                {/* AI 评价 */}
                {q.ai_evaluation && (
                  <div>
                    <div className="text-[11px] text-gray-400 mb-0.5">AI 评价</div>
                    <p className="text-gray-600 text-xs bg-blue-50 rounded p-2">{q.ai_evaluation}</p>
                  </div>
                )}
                {/* 参考答案 */}
                {q.reference_answer && (
                  <div>
                    <div className="text-[11px] text-gray-400 mb-0.5">参考答案</div>
                    <p className="text-gray-600 text-xs bg-green-50 rounded p-2">{q.reference_answer}</p>
                  </div>
                )}
                {/* 改进建议 */}
                {q.improvement_suggestion && (
                  <div>
                    <div className="text-[11px] text-gray-400 mb-0.5">改进建议</div>
                    <p className="text-gray-600 text-xs bg-amber-50 rounded p-2">{q.improvement_suggestion}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 页脚 */}
        <div className="text-center text-[11px] text-gray-400 pt-4 border-t">
          由 AI 模拟面试系统生成
        </div>
      </div>
    </div>
  );
}
