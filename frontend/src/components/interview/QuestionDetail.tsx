'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface QuestionDetailProps {
  question: {
    order_index: number;
    question_text: string;
    question_type: string;
    user_answer_transcript?: string;
    ai_score?: number;
    score_detail?: Record<string, number>;
    ai_evaluation?: string;
    reference_answer?: string;
    improvement_suggestion?: string;
  };
}

const TYPE_LABELS: Record<string, string> = {
  introduction: '自我介绍',
  behavioral: '行为面试',
  technical: '专业技能',
  situational: '情景题',
  career: '职业规划',
};

export default function QuestionDetail({ question }: QuestionDetailProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-lg p-4 bg-white dark:bg-gray-900">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-500">
            #{question.order_index}
          </span>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
            {TYPE_LABELS[question.question_type] || question.question_type}
          </span>
          <span className="font-medium">{question.question_text}</span>
        </div>
        <div className="flex items-center gap-3">
          {question.ai_score != null && (
            <span className="text-lg font-bold text-blue-600">{question.ai_score}</span>
          )}
          {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t pt-4">
          {/* 你的回答 — 始终显示 */}
          <div>
            <h4 className="font-medium text-sm text-gray-500 mb-1">你的回答</h4>
            {question.user_answer_transcript ? (
              <p className="text-sm">{question.user_answer_transcript}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">（未作答）</p>
            )}
          </div>

          {question.score_detail && Object.keys(question.score_detail).length > 0 && (
            <div>
              <h4 className="font-medium text-sm text-gray-500 mb-2">评分详情</h4>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(question.score_detail).map(([key, val]) => (
                  <div key={key} className="flex justify-between text-sm bg-gray-50 p-2 rounded">
                    <span>{key==='content_completeness'?'内容完整性':key==='professionalism'?'专业度':key==='expression'?'表达能力':key==='star_method'?'STAR法则':key}</span>
                    <span className="font-medium">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {question.ai_evaluation && (
            <div>
              <h4 className="font-medium text-sm text-gray-500 mb-1">AI 评语</h4>
              <p className="text-sm">{question.ai_evaluation}</p>
            </div>
          )}

          {/* 参考答案 — 始终显示（即使没回答） */}
          <div>
            <h4 className="font-medium text-sm text-gray-500 mb-1">参考答案</h4>
            {question.reference_answer ? (
              <p className="text-sm text-gray-700">{question.reference_answer}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">（评分完成后生成）</p>
            )}
          </div>

          {question.improvement_suggestion && (
            <div>
              <h4 className="font-medium text-sm text-gray-500 mb-1">改进建议</h4>
              <p className="text-sm text-orange-600">{question.improvement_suggestion}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
