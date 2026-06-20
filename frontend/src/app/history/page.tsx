'use client';

import { useEffect, useState } from 'react';
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
      // Get user's interviews via the interview API
      const data = await api.get<InterviewRecord[]>('/api/interview/list');
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
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
            <Link
              key={r.id}
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
                <div className="text-right">
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
          ))}
        </div>
      )}
    </div>
  );
}
