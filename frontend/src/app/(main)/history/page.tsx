'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { ClipboardList, Trash2, ChevronRight, Clock, RotateCw, RefreshCw } from 'lucide-react';

interface InterviewRecord {
  id: string;
  status: string;
  difficulty: string;
  total_score: number | null;
  created_at: string;
  position?: string;
}

type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard';

const difficultyLabels: Record<string, string> = {
  easy: '初级',
  medium: '中级',
  hard: '高级',
};

const difficultyBadgeVariant: Record<string, 'green' | 'yellow' | 'red'> = {
  easy: 'green',
  medium: 'yellow',
  hard: 'red',
};

const difficultyBarColor: Record<string, string> = {
  easy: 'bg-green-500',
  medium: 'bg-yellow-500',
  hard: 'bg-red-500',
};

const difficultyFilters: { key: DifficultyFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'easy', label: '初级' },
  { key: 'medium', label: '中级' },
  { key: 'hard', label: '高级' },
];

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-900/80 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-1 h-12 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="flex-1 space-y-2.5">
          <div className="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded-md" />
          <div className="h-3 w-20 bg-gray-100 dark:bg-gray-800 rounded-md" />
          <div className="h-3 w-32 bg-gray-100 dark:bg-gray-800 rounded-md" />
        </div>
        <div className="h-8 w-14 bg-gray-200 dark:bg-gray-700 rounded-lg" />
      </div>
    </div>
  );
}

function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  deleting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  deleting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>此操作不可撤销，面试记录将被永久删除。</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-end gap-3 pt-4">
          <DialogClose asChild>
            <Button variant="secondary" size="sm">
              取消
            </Button>
          </DialogClose>
          <Button
            variant="danger"
            size="sm"
            loading={deleting}
            onClick={onConfirm}
          >
            删除
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const [records, setRecords] = useState<InterviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [filter, setFilter] = useState<DifficultyFilter>('all');

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const data = await api.get<InterviewRecord[]>('/api/interview/list');
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(deleteTarget);
    try {
      await api.del(`/api/interview/${deleteTarget}`);
      setRecords((prev) => prev.filter((r) => r.id !== deleteTarget));
      setDeleteTarget(null);
    } catch (err: any) {
      alert('删除失败：' + (err.message || '未知错误'));
    } finally {
      setDeleting(null);
    }
  };

  const handleRetry = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setRetrying(id);
    try {
      const res = await api.post<{ id: string }>(`/api/interview/${id}/retry`);
      router.push(`/interview/session?id=${res.id}`);
    } catch (err: any) {
      alert('重新模拟失败：' + (err.message || '未知错误'));
      setRetrying(null);
    }
  };

  const filteredRecords =
    filter === 'all'
      ? records
      : records.filter((r) => r.difficulty === filter);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
        <div className="max-w-3xl mx-auto px-4 py-12">
          <div className="mb-8 animate-pulse">
            <div className="h-8 w-28 bg-gray-200 dark:bg-gray-800 rounded-lg mb-2" />
            <div className="h-4 w-44 bg-gray-100 dark:bg-gray-800/50 rounded-md" />
          </div>
          <div className="flex gap-2 mb-6 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 w-16 bg-gray-200 dark:bg-gray-800 rounded-xl" />
            ))}
          </div>
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">
                面试历史
              </h1>
              <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                查看和管理你的所有面试记录
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
              返回
            </Link>
          </div>
        </div>

        {/* Difficulty Filter */}
        <div className="flex items-center gap-2 mb-6">
          {difficultyFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`
                px-4 py-1.5 rounded-xl text-sm font-medium transition-all duration-200
                ${
                  filter === f.key
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 shadow-sm'
                    : 'bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:bg-gray-900/60 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-800'
                }
              `}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Interview List or Empty State */}
        {filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-5">
              <ClipboardList className="h-8 w-8 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-1">
              还没有面试记录
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              开始你的第一次模拟面试，提升面试技巧
            </p>
            <Link href="/interview/prepare">
              <Button>开始第一次面试</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredRecords.map((r) => (
              <div key={r.id} className="group relative">
                <Link
                  href={`/interview/result/${r.id}`}
                  className="block bg-white dark:bg-gray-900/80 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-center gap-4 p-5">
                    {/* Colored difficulty indicator bar */}
                    <div
                      className={`w-1 h-12 shrink-0 rounded-full ${difficultyBarColor[r.difficulty] || 'bg-gray-300'}`}
                    />

                    {/* Center content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {r.position || '模拟面试'}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight ${
                            r.difficulty === 'easy'
                              ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : r.difficulty === 'hard'
                                ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                : 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          }`}
                        >
                          {difficultyLabels[r.difficulty] || '未知'}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                          <Clock className="h-3 w-3" />
                          {formatDate(r.created_at)}
                        </span>
                      </div>
                    </div>

                    {/* Right: score or status */}
                    <div className="flex items-center gap-2 shrink-0">
                      {r.total_score != null ? (
                        <span className="text-xl font-bold tracking-tight text-brand-500 dark:text-brand-400">
                          {r.total_score}
                          <span className="text-xs font-normal text-gray-400 dark:text-gray-500 ml-0.5">分</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                          <RotateCw className="h-3 w-3" />
                          {r.status === 'completed' ? '待评分' : '进行中'}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>

                {/* Hover action buttons — bottom right, below score */}
                <div className="absolute bottom-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
                  <button
                    onClick={(e) => handleRetry(e, r.id)}
                    disabled={retrying === r.id}
                    className="w-8 h-8 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-brand-500 hover:border-brand-200 dark:hover:border-brand-800 hover:bg-brand-50 dark:hover:bg-brand-900/20 flex items-center justify-center disabled:opacity-50 shadow-sm transition-colors"
                    title="重新模拟"
                  >
                    {retrying === r.id ? (
                      <div className="w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteTarget(r.id);
                    }}
                    disabled={deleting === r.id}
                    className="w-8 h-8 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-red-500 hover:border-red-200 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center disabled:opacity-50 shadow-sm transition-colors"
                    title="删除记录"
                  >
                    {deleting === r.id ? (
                      <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={handleDelete}
        deleting={deleting !== null}
      />
    </div>
  );
}
