'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import AdminPagination from '@/components/admin/AdminPagination';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogClose,
} from '@/components/ui/Dialog';
import type { AdminInterviewItem, PaginatedResponse } from '@/types/admin';
import { FileText, Trash2, Loader2, AlertTriangle, Clock } from 'lucide-react';

const PAGE_SIZE = 20;
const CATEGORY_LABELS: Record<string, string> = {
  private_enterprise: '私企', civil_service: '公务员', institution: '事业单位',
};
const CATEGORY_COLORS: Record<string, string> = {
  private_enterprise: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
  civil_service: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  institution: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
};
const DIFFICULTY_LABELS: Record<string, string> = {
  easy: '初级', mid: '中级', medium: '中级', hard: '高级',
};
const categoryFilters = [
  { key: '', label: '全部' },
  { key: 'private_enterprise', label: '私企' },
  { key: 'civil_service', label: '公务员' },
  { key: 'institution', label: '事业单位' },
];

function AdminInterviewsContent() {
  const { toast } = useToast();
  const [interviews, setInterviews] = useState<AdminInterviewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminInterviewItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const loadInterviews = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
      if (category) params.set('category', category);
      const data = await api.get<PaginatedResponse<AdminInterviewItem>>(`/api/admin/interviews?${params}`);
      setInterviews(data.items); setTotal(data.total); setTotalPages(data.total_pages);
    } catch { toast({ title: '加载失败', description: '无法获取面试记录', variant: 'error' }); }
    finally { setLoading(false); }
  }, [page, category, toast]);

  useEffect(() => { loadInterviews(); }, [loadInterviews]);

  const handleCategoryChange = (c: string) => { setCategory(c); setPage(1); };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    try {
      await api.del(`/api/admin/interviews/${deleteTarget.id}`);
      toast({ title: '面试记录已删除', variant: 'success' });
      setDeleteOpen(false); setDeleteTarget(null); loadInterviews();
    } catch (err: any) { toast({ title: '删除失败', description: err.message, variant: 'error' }); }
    finally { setDeletingId(null); }
  };

  const formatDate = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) +
      ' ' + dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">面试管理</h1>
        <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">共 {total} 条面试记录</p>
      </div>

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {categoryFilters.map((f) => (
          <button key={f.key} onClick={() => handleCategoryChange(f.key)}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              category === f.key
                ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 shadow-sm'
                : 'bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:bg-gray-900/60 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-800'
            }`}>{f.label}</button>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-900/80 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-brand-500" /></div>
        ) : interviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileText className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-400 dark:text-gray-500">暂无面试记录</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-5 font-medium text-gray-500 dark:text-gray-400 text-xs">用户</th>
                  <th className="text-left py-3 px-5 font-medium text-gray-500 dark:text-gray-400 text-xs">类别</th>
                  <th className="text-left py-3 px-5 font-medium text-gray-500 dark:text-gray-400 text-xs">岗位/难度</th>
                  <th className="text-left py-3 px-5 font-medium text-gray-500 dark:text-gray-400 text-xs">题目数</th>
                  <th className="text-left py-3 px-5 font-medium text-gray-500 dark:text-gray-400 text-xs">评分</th>
                  <th className="text-left py-3 px-5 font-medium text-gray-500 dark:text-gray-400 text-xs">状态</th>
                  <th className="text-left py-3 px-5 font-medium text-gray-500 dark:text-gray-400 text-xs">时间</th>
                  <th className="text-right py-3 px-5 font-medium text-gray-500 dark:text-gray-400 text-xs">操作</th>
                </tr>
              </thead>
              <tbody>
                {interviews.map((iv) => (
                  <tr key={iv.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="py-3 px-5"><span className="text-sm font-medium text-gray-900 dark:text-gray-100">{iv.username}</span></td>
                    <td className="py-3 px-5"><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEGORY_COLORS[iv.interview_category] || ''}`}>{CATEGORY_LABELS[iv.interview_category] || iv.interview_category}</span></td>
                    <td className="py-3 px-5 text-sm text-gray-500 dark:text-gray-400 max-w-[150px] truncate">{iv.position || DIFFICULTY_LABELS[iv.difficulty] || iv.difficulty || '-'}</td>
                    <td className="py-3 px-5 text-sm text-gray-500 dark:text-gray-400">{iv.question_count ?? '-'}</td>
                    <td className="py-3 px-5">{iv.total_score != null ? <span className="text-sm font-semibold text-brand-500 dark:text-brand-400">{iv.total_score}分</span> : <span className="text-xs text-gray-400">-</span>}</td>
                    <td className="py-3 px-5">
                      {iv.status === 'completed' ? <span className="inline-flex items-center rounded-full bg-green-50 dark:bg-green-950/30 px-2 py-0.5 text-[11px] font-medium text-green-600 dark:text-green-400">已完成</span>
                        : iv.status === 'preparing' ? <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">待开始</span>
                        : <span className="inline-flex items-center rounded-full bg-yellow-50 dark:bg-yellow-950/30 px-2 py-0.5 text-[11px] font-medium text-yellow-600 dark:text-yellow-400">进行中</span>}
                    </td>
                    <td className="py-3 px-5 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap"><span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(iv.created_at)}</span></td>
                    <td className="py-3 px-5">
                      <div className="flex items-center justify-end">
                        <button onClick={() => { setDeleteTarget(iv); setDeleteOpen(true); }} className="w-8 h-8 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center transition-colors" title="删除记录"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AdminPagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-500 shrink-0" /><DialogTitle>确认删除</DialogTitle></div>
            <DialogDescription className="mt-3">即将删除用户 <span className="font-medium text-gray-700 dark:text-gray-300 mx-1">{deleteTarget?.username}</span> 的面试记录，此操作不可撤销。</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-3 pt-4">
            <DialogClose asChild><Button variant="secondary" size="sm">取消</Button></DialogClose>
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={deletingId !== null}>{deletingId !== null ? '删除中...' : '确认删除'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminInterviewsPage() {
  return <ToastProvider><AdminInterviewsContent /></ToastProvider>;
}
