'use client';

import { useEffect, useState, useCallback } from 'react';
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
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import {
  ClipboardList,
  Trash2,
  ChevronRight,
  Clock,
  RefreshCw,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

interface InterviewRecord {
  id: string;
  status: string;
  difficulty: string;
  total_score: number | null;
  created_at: string;
  position?: string;
  company?: string;
  category?: string;
  category_config?: Record<string, any>;
}

const CATEGORY_LABELS: Record<string, string> = {
  private_enterprise: '私企',
  civil_service: '公务员',
  institution: '事业单位',
};

const CATEGORY_COLORS: Record<string, string> = {
  private_enterprise: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
  civil_service: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  institution: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
};

type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard';

const difficultyLabels: Record<string, string> = {
  easy: '初级',
  mid: '中级',
  medium: '中级',
  hard: '高级',
};

const difficultyBarColor: Record<string, string> = {
  easy: 'bg-green-500',
  mid: 'bg-yellow-500',
  medium: 'bg-yellow-500',
  hard: 'bg-red-500',
};

const categoryBarColor: Record<string, string> = {
  civil_service: 'bg-red-500',
  institution: 'bg-emerald-500',
};

const difficultyFilters: { key: DifficultyFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'easy', label: '初级' },
  { key: 'medium', label: '中级' },
  { key: 'hard', label: '高级' },
];

// ── Skeleton loading state ────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-900/80 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-1 h-12 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
        <div className="flex-1 space-y-2.5">
          <div className="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded-md" />
          <div className="h-3 w-20 bg-gray-100 dark:bg-gray-800 rounded-md" />
          <div className="h-3 w-32 bg-gray-100 dark:bg-gray-800 rounded-md" />
        </div>
        <div className="h-8 w-14 bg-gray-200 dark:bg-gray-700 rounded-lg shrink-0" />
      </div>
    </div>
  );
}

// ── Delete confirmation dialog ────────────────────────────────

function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  recordTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  recordTitle: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <DialogTitle>确认删除</DialogTitle>
          </div>
          <DialogDescription className="mt-3">
            即将删除面试记录：
            <span className="font-medium text-gray-700 dark:text-gray-300 ml-1">
              {recordTitle}
            </span>
          </DialogDescription>
          <DialogDescription className="text-xs text-gray-400 mt-1">
            此操作不可撤销，记录将被永久删除。
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-end gap-3 pt-4">
          <DialogClose asChild>
            <Button variant="secondary" size="sm">
              取消
            </Button>
          </DialogClose>
          <Button variant="danger" size="sm" onClick={onConfirm}>
            确认删除
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Inner page content (needs ToastProvider context) ──────────

function HistoryPageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const [records, setRecords] = useState<InterviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
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
      toast({
        title: '加载失败',
        description: '无法获取面试记录列表',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Optimistic delete ──────────────────────────────────────

  const handleDelete = useCallback(
    async (id: string) => {
      if (!id) return;
      const targetId = id;

      setDeleteTarget(null);

      // Capture removed item for potential rollback
      let removed: InterviewRecord | undefined;
      setRecords((prev) => {
        removed = prev.find((r) => r.id === targetId);
        return prev.filter((r) => r.id !== targetId);
      });

      try {
        await api.del(`/api/interview/${targetId}`);
        toast({ title: '删除成功', variant: 'success' });
      } catch (err: any) {
        toast({
          title: '删除失败',
          description: err.message || '未知错误',
          variant: 'error',
        });
        // Rollback: restore the removed item in sorted position
        if (removed) {
          setRecords((prev) => {
            if (prev.some((r) => r.id === removed!.id)) return prev;
            return [...prev, removed!].sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            );
          });
        }
      }
    },
    [toast]
  );

  // ── Retry interview ────────────────────────────────────────

  const handleRetry = useCallback(
    async (id: string) => {
      setRetrying(id);
      try {
        const res = await api.post<{ id: string }>(
          `/api/interview/${id}/retry`
        );
        router.push(`/interview/session?id=${res.id}`);
      } catch (err: any) {
        toast({
          title: '重新模拟失败',
          description: err.message || '未知错误',
          variant: 'error',
        });
        setRetrying(null);
      }
    },
    [router, toast]
  );

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  // ── Helpers ────────────────────────────────────────────────

  const filteredRecords =
    filter === 'all'
      ? records
      : records.filter((r) => r.difficulty === filter);

  const deleteTargetRecord = deleteTarget
    ? records.find((r) => r.id === deleteTarget) ?? null
    : null;

  // ── Loading state ──────────────────────────────────────────

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
              <div
                key={i}
                className="h-8 w-16 bg-gray-200 dark:bg-gray-800 rounded-xl"
              />
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

  // ── Page content ───────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* ── Page Header ────────────────────────────────── */}
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

        {/* ── Difficulty Filter ──────────────────────────── */}
        <div className="flex items-center gap-2 mb-6">
          {difficultyFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'px-4 py-1.5 rounded-xl text-sm font-medium transition-all duration-200',
                filter === f.key
                  ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 shadow-sm'
                  : 'bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:bg-gray-900/60 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-800'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Interview List or Empty State ──────────────── */}
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
              <div
                key={r.id}
                className="flex bg-white dark:bg-gray-900/80 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 hover:shadow-md transition-all duration-200 overflow-hidden"
              >
                <Link
                  href={
                    r.status === 'completed'
                      ? `/interview/result/${r.id}`
                      : `/interview/session?id=${r.id}`
                  }
                  className="flex items-center gap-4 p-5 flex-1 min-w-0"
                >
                  {/* Colored indicator bar — category-specific for civil service/institution */}
                  <div
                    className={cn(
                      'w-1 h-12 shrink-0 rounded-full',
                      (r.category && categoryBarColor[r.category]) || difficultyBarColor[r.difficulty] || 'bg-gray-300'
                    )}
                  />

                  {/* Center content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {r.position
                          ? r.position
                          : r.category === 'civil_service'
                            ? `${r.category_config?.province || ''}公务员面试`
                            : r.category === 'institution'
                              ? `${r.category_config?.province || ''}事业单位面试`
                              : '模拟面试'}
                        {r.company && (
                          <span className="text-gray-400 dark:text-gray-500 font-normal ml-1.5">
                            @{r.company}
                          </span>
                        )}
                      </p>
                      {r.category && (
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${CATEGORY_COLORS[r.category] || ''}`}>
                          {CATEGORY_LABELS[r.category] || r.category}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      {/* 公务员/事业单位：显示层级和岗位类别；私企：显示难度 */}
                      {(r.category === 'civil_service' || r.category === 'institution') ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight ${CATEGORY_COLORS[r.category] || ''}`}>
                          {r.category_config?.level || ''}{r.category_config?.level && r.category_config?.position_category ? '·' : ''}{r.category_config?.position_category || ''}
                        </span>
                      ) : (
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight',
                            r.difficulty === 'easy'
                              ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : r.difficulty === 'hard'
                                ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                : 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          )}
                        >
                          {difficultyLabels[r.difficulty] || '未知'}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                        <Clock className="h-3 w-3" />
                        {formatDate(r.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Score or status badge */}
                  <div className="shrink-0">
                    {r.total_score != null ? (
                      <span className="text-xl font-bold tracking-tight text-brand-500 dark:text-brand-400">
                        {r.total_score}
                        <span className="text-xs font-normal text-gray-400 dark:text-gray-500 ml-0.5">
                          分
                        </span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                        <RefreshCw className="h-3 w-3" />
                        {r.status === 'completed' ? '待评分' : '进行中'}
                      </span>
                    )}
                  </div>
                </Link>

                {/* ── Action buttons ────────────────────────
                     Always visible, subtle by default, colored on hover. */}
                <div className="flex items-center gap-1 pr-4">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleRetry(r.id);
                    }}
                    disabled={retrying === r.id}
                    className="w-8 h-8 rounded-lg text-gray-300 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 flex items-center justify-center disabled:opacity-50 transition-colors"
                    title="重新模拟"
                  >
                    {retrying === r.id && !r.total_score ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setDeleteTarget(r.id);
                    }}
                    className="w-8 h-8 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center transition-colors"
                    title="删除记录"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Delete Confirmation Dialog ───────────────────── */}
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={() => handleDelete(deleteTarget!)}
        recordTitle={
          deleteTargetRecord
            ? deleteTargetRecord.position ||
              deleteTargetRecord.company ||
              '模拟面试'
            : ''
        }
      />
    </div>
  );
}

// ── Page entry point (wraps content in ToastProvider) ────────

export default function HistoryPage() {
  return (
    <ToastProvider>
      <HistoryPageContent />
    </ToastProvider>
  );
}
