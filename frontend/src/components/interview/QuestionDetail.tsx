'use client';

import { useState, useRef } from 'react';
import {
  ChevronDown, ChevronUp, Clock, Brain, MessageSquare,
  Star, Target, Zap, FileText, Lightbulb, BookOpen,
  Sparkles, Play, Square, Loader2
} from 'lucide-react';

interface QuestionDetailProps {
  question: {
    order_index: number;
    question_text: string;
    question_type: string;
    user_answer_transcript?: string;
    duration_seconds?: number;
    thinking_duration_seconds?: number;
    ai_score?: number;
    score_detail?: Record<string, number>;
    ai_evaluation?: string;
    reference_answer?: string;
    improvement_suggestion?: string;
  };
  interviewId?: string;
}

function fmtTime(s: number | undefined | null): string {
  if (!s) return '-';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${sec}秒`;
}

const TYPE_LABELS: Record<string, string> = {
  introduction: '自我介绍',
  behavioral: '行为面试',
  technical: '专业技能',
  situational: '情景题',
  career: '职业规划',
};

const TYPE_ICONS: Record<string, typeof Star> = {
  introduction: Sparkles,
  behavioral: Target,
  technical: Brain,
  situational: Zap,
  career: FileText,
};

const TYPE_COLORS: Record<string, string> = {
  introduction: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  behavioral: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400',
  technical: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400',
  situational: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  career: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
};

export default function QuestionDetail({ question, interviewId }: QuestionDetailProps) {
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const handlePlay = async () => {
    if (playing || loadingAudio || !interviewId) return;
    setLoadingAudio(true);
    try {
      const token = localStorage.getItem('access_token');
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const url = `${apiBase}/api/interview/${interviewId}/recording/${question.order_index}`;
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) { setLoadingAudio(false); return; }
      const buf = await res.arrayBuffer();
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const audio = await ctx.decodeAudioData(buf);
      const source = ctx.createBufferSource();
      source.buffer = audio;
      source.connect(ctx.destination);
      setLoadingAudio(false);
      setPlaying(true);
      source.onended = () => { setPlaying(false); ctx.close(); audioCtxRef.current = null; };
      source.start();
    } catch { setLoadingAudio(false); }
  };

  const handleStop = () => {
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    setPlaying(false);
    setLoadingAudio(false);
  };

  const TypeIcon = TYPE_ICONS[question.question_type] || Star;
  const hasTranscript = question.user_answer_transcript && question.user_answer_transcript.trim();

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
      <div
        className="flex items-center justify-between p-4 sm:p-5 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500 flex-shrink-0 w-6">
            #{question.order_index}
          </span>
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-medium flex-shrink-0 ${TYPE_COLORS[question.question_type] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'}`}>
            <TypeIcon className="w-3 h-3" />
            {TYPE_LABELS[question.question_type] || question.question_type}
          </span>
          <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
            {question.question_text}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          {question.ai_score != null && (
            <span className="text-lg font-bold text-brand-500 dark:text-brand-400 tabular-nums">
              {question.ai_score}
            </span>
          )}
          <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 sm:px-5 pb-5 space-y-4 border-t border-gray-100 dark:border-gray-800 pt-4">

          {/* Duration info */}
          {(question.thinking_duration_seconds != null || question.duration_seconds != null) && (
            <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
              {question.thinking_duration_seconds != null && (
                <span className="inline-flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5" />
                  思考 {fmtTime(question.thinking_duration_seconds)}
                </span>
              )}
              {question.duration_seconds != null && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  回答 {fmtTime(question.duration_seconds)}
                </span>
              )}
            </div>
          )}

          {/* User answer */}
          <div>
            <h4 className="font-medium text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              你的回答
              {hasTranscript && interviewId && (
                <button
                  onClick={(e) => { e.stopPropagation(); playing ? handleStop() : handlePlay(); }}
                  disabled={loadingAudio}
                  className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium transition-colors
                    bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400
                    hover:bg-brand-100 hover:text-brand-600 dark:hover:bg-brand-900/30 dark:hover:text-brand-400
                    disabled:opacity-50"
                  title="回放录音"
                >
                  {loadingAudio ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : playing ? (
                    <Square className="w-3 h-3" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                  {playing ? '播放中' : loadingAudio ? '加载中' : '回放'}
                </button>
              )}
            </h4>
            {hasTranscript ? (
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3.5 border border-gray-100 dark:border-gray-800">
                {question.user_answer_transcript}
              </p>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3.5 border border-gray-100 dark:border-gray-800">
                （未作答）
              </p>
            )}
          </div>

          {/* Score detail */}
          {question.score_detail && Object.keys(question.score_detail).length > 0 && (
            <div>
              <h4 className="font-medium text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5" />
                评分详情
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(question.score_detail).map(([key, val]) => {
                  const labels: Record<string, string> = {
                    content_completeness: '内容完整性',
                    professionalism: '专业度',
                    expression: '表达能力',
                    star_method: 'STAR法则',
                  };
                  return (
                    <div key={key} className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-800/50 px-3.5 py-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">{labels[key] || key}</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{val}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI Evaluation */}
          {question.ai_evaluation && (
            <div>
              <h4 className="font-medium text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                AI 评语
              </h4>
              <div className="pl-3 border-l-2 border-brand-400 dark:border-brand-500">
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  {question.ai_evaluation}
                </p>
              </div>
            </div>
          )}

          {/* Reference Answer */}
          <div>
            <h4 className="font-medium text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              参考答案
            </h4>
            {question.reference_answer ? (
              <div className="pl-3 border-l-2 border-emerald-400 dark:border-emerald-600">
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{question.reference_answer}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">（评分完成后生成）</p>
            )}
          </div>

          {/* Improvement Suggestion */}
          {question.improvement_suggestion && (
            <div>
              <h4 className="font-medium text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5" />
                改进建议
              </h4>
              <div className="pl-3 border-l-2 border-amber-400 dark:border-amber-600">
                <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed">{question.improvement_suggestion}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
