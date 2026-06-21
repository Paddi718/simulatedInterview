'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface InterviewRecord {
  id: string;
  status: string;
  difficulty: string;
  total_score: number | null;
  created_at: string;
}

export default function HistoryPage() {
  const router = useRouter();
  const [records, setRecords] = useState<InterviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

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

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('确定删除这条面试记录吗？此操作不可撤销。')) return;
    setDeleting(id);
    try {
      await api.del(`/api/interview/${id}`);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      alert('删除失败：' + (err.message || '未知错误'));
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">历史记录</h1>
        <Link href="/dashboard" className="text-blue-600 hover:underline">← 返回</Link>
      </div>

      {records.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">暂无面试记录</p>
          <Link href="/interview/prepare" className="text-blue-600 hover:underline">开始第一次面试</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((r) => (
            <div key={r.id} className="relative group">
              <Link
                href={`/interview/result/${r.id}`}
                className="block bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      难度：{r.difficulty === 'easy' ? '初级' : r.difficulty === 'hard' ? '高级' : '中级'}
                    </p>
                    <p className="text-sm text-gray-500">{new Date(r.created_at).toLocaleDateString('zh-CN')}</p>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    {r.total_score != null ? (
                      <span className="text-lg font-bold text-blue-600">{r.total_score} 分</span>
                    ) : (
                      <span className="text-sm text-gray-400">
                        {r.status === 'completed' ? '已评分' : '进行中'}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
              {/* Delete button */}
              <button
                onClick={(e) => handleDelete(r.id, e)}
                disabled={deleting === r.id}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 disabled:opacity-50"
                title="删除记录"
              >
                {deleting === r.id ? (
                  <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
