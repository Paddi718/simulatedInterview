'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Star, Target, Brain, Zap, FileText, Sparkles,
  BookOpen, Lightbulb, Loader2, ChevronLeft, Trash2,
  ChevronDown, Inbox, FolderOpen, Building2, Briefcase
} from 'lucide-react';
import { api } from '@/lib/api';

interface FavItem {
  id: string;
  source_interview_id?: string | null;
  question_text: string;
  question_type: string;
  reference_answer?: string | null;
  improvement_suggestion?: string | null;
  created_at: string;
}

interface FavCategory {
  category_key: string;
  position: string;
  company: string;
  count: number;
  items: FavItem[];
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
  introduction: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800',
  behavioral: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800',
  technical: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800',
  situational: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  career: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
};

export default function FavoritesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<FavCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem('access_token')) {
      router.push('/login');
      return;
    }
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    try {
      const data = await api.get<FavCategory[]>('/api/interview/favorites/list');
      const cats = data || [];
      setCategories(cats);
      if (cats.length > 0) setExpandedCat(cats[0].category_key);
    } catch (err: any) {
      console.error('Failed to load favorites:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRemovingId(id);
    try {
      await api.del(`/api/interview/favorites/${id}`);
      // 刷新整个列表以更新分组
      const data = await api.get<FavCategory[]>('/api/interview/favorites/list');
      setCategories(data || []);
      if (expandedItem === id) setExpandedItem(null);
    } catch {
      // 失败时保持原状
    } finally {
      setRemovingId(null);
    }
  };

  const totalCount = categories.reduce((sum, c) => sum + c.count, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-8 sm:mb-10">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
              收藏题目
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
              共 <span className="font-medium text-gray-700 dark:text-gray-300">{totalCount}</span> 道收藏题目
              {categories.length > 0 && (
                <span className="text-gray-400 dark:text-gray-500"> · {categories.length} 个分类</span>
              )}
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-all duration-200"
          >
            <ChevronLeft className="w-4 h-4" />
            返回首页
          </Link>
        </div>

        {/* ── Empty state ── */}
        {categories.length === 0 && (
          <div className="text-center py-24">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/30 dark:to-amber-900/20 flex items-center justify-center ring-1 ring-amber-200/50 dark:ring-amber-800/50">
              <Inbox className="w-10 h-10 text-amber-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1.5">暂无收藏题目</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-8 max-w-xs mx-auto leading-relaxed">
              在模拟面试中点击星标按钮收藏优质题目，方便随时复习回顾
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-xl shadow-sm shadow-brand-200 dark:shadow-none hover:bg-brand-600 hover:shadow-md hover:shadow-brand-200 dark:hover:shadow-none transition-all duration-200"
            >
              开始模拟面试
            </Link>
          </div>
        )}

        {/* ── Categories ── */}
        <div className="space-y-4">
          {categories.map((cat) => {
            const isCatExpanded = expandedCat === cat.category_key;

            return (
              <div
                key={cat.category_key}
                className="rounded-2xl border border-gray-200/70 dark:border-gray-700/50 bg-white dark:bg-gray-900 shadow-sm overflow-hidden transition-all duration-200"
              >
                {/* ── Category header ── */}
                <div
                  className="flex items-center justify-between px-5 py-4 sm:px-6 sm:py-4 cursor-pointer select-none hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors duration-150"
                  onClick={() => setExpandedCat(isCatExpanded ? null : cat.category_key)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-950/30 flex items-center justify-center flex-shrink-0">
                      {cat.category_key === '__uncategorized__' ? (
                        <FolderOpen className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      ) : (
                        <Briefcase className="w-4 h-4 text-brand-500 dark:text-brand-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                          {cat.position}
                        </span>
                        {cat.company && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md flex-shrink-0">
                            <Building2 className="w-3 h-3" />
                            {cat.company}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                    <span className="text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full tabular-nums">
                      {cat.count}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                        isCatExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </div>

                {/* ── Category items ── */}
                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    isCatExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                    {cat.items.map((q) => {
                      const TypeIcon = TYPE_ICONS[q.question_type] || Star;
                      const isItemExpanded = expandedItem === q.id;
                      const hasContent = q.reference_answer || q.improvement_suggestion;

                      return (
                        <div key={q.id} className="group">
                          {/* Item header */}
                          <div
                            className="flex items-center justify-between px-5 py-3.5 sm:px-6 cursor-pointer select-none hover:bg-gray-50/30 dark:hover:bg-gray-800/20 transition-colors duration-150"
                            onClick={() => setExpandedItem(isItemExpanded ? null : q.id)}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border flex-shrink-0 shadow-sm ${TYPE_COLORS[q.question_type] || ''}`}>
                                <TypeIcon className="w-3.5 h-3.5" />
                                {TYPE_LABELS[q.question_type] || q.question_type}
                              </span>
                              <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                                {q.question_text}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                              <ChevronDown
                                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                                  isItemExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            </div>
                          </div>

                          {/* Item content */}
                          <div
                            className={`overflow-hidden transition-all duration-300 ease-in-out ${
                              isItemExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                            }`}
                          >
                            <div className="px-5 sm:px-6 pb-5 space-y-4 bg-gray-50/30 dark:bg-gray-800/20 border-t border-gray-100 dark:border-gray-800 pt-4">
                              {/* Question text */}
                              <div>
                                <h4 className="font-semibold text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">题目内容</h4>
                                <p className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
                                  {q.question_text}
                                </p>
                              </div>

                              {/* Reference Answer */}
                              {q.reference_answer && (
                                <div>
                                  <h4 className="font-semibold text-xs text-emerald-600 dark:text-emerald-400 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                                    <BookOpen className="w-3.5 h-3.5" />
                                    参考答案
                                  </h4>
                                  <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50 rounded-xl p-4 pl-4 border-l-2 border-l-emerald-400 dark:border-l-emerald-600">
                                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{q.reference_answer}</p>
                                  </div>
                                </div>
                              )}

                              {/* Improvement Suggestion */}
                              {q.improvement_suggestion && (
                                <div>
                                  <h4 className="font-semibold text-xs text-amber-600 dark:text-amber-400 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                                    <Lightbulb className="w-3.5 h-3.5" />
                                    改进建议
                                  </h4>
                                  <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/50 rounded-xl p-4 pl-4 border-l-2 border-l-amber-400 dark:border-l-amber-600">
                                    <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed">{q.improvement_suggestion}</p>
                                  </div>
                                </div>
                              )}

                              {/* No content hint */}
                              {!hasContent && (
                                <div className="text-center py-4 text-sm text-gray-400 dark:text-gray-500 italic">
                                  参考答案和改进建议将在面试评分完成后自动同步
                                </div>
                              )}

                              {/* Remove button */}
                              <div className="flex gap-2 pt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                                <button
                                  onClick={(e) => handleRemove(q.id, e)}
                                  disabled={removingId === q.id}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  {removingId === q.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3 h-3" />
                                  )}
                                  取消收藏
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
