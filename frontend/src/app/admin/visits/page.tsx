'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import AdminPagination from '@/components/admin/AdminPagination';
import { Globe, Monitor, Loader2 } from 'lucide-react';

interface VisitItem {
  ip: string; country: string; city: string; path: string; time: string;
}

export default function AdminVisitsPage() {
  const [items, setItems] = useState<VisitItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get<{ items: VisitItem[]; total: number; total_pages: number }>(`/api/admin/stats/visits?page=${page}&size=30`)
      .then(d => { setItems(d.items); setTotal(d.total); setTotalPages(d.total_pages); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">访问记录</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">最近访客 IP、位置与访问页面（共 {total} 条）</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
      ) : items.length === 0 ? (
        <p className="text-center text-gray-400 py-20 text-sm">暂无数据，浏览页面后将自动记录</p>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                <th className="text-left py-3 px-5 text-xs font-medium text-gray-500">IP 地址</th>
                <th className="text-left py-3 px-5 text-xs font-medium text-gray-500">位置</th>
                <th className="text-left py-3 px-5 text-xs font-medium text-gray-500">页面</th>
                <th className="text-right py-3 px-5 text-xs font-medium text-gray-500">时间</th>
              </tr>
            </thead>
            <tbody>
              {items.map((v, i) => (
                <tr key={i} className="border-b border-gray-50 dark:border-gray-800/50">
                  <td className="py-2.5 px-5 font-mono text-xs text-gray-600 dark:text-gray-400">
                    <Monitor className="h-3 w-3 inline mr-1.5 text-gray-400" />
                    {v.ip}
                  </td>
                  <td className="py-2.5 px-5 text-xs text-gray-600 dark:text-gray-400">
                    <Globe className="h-3 w-3 inline mr-1.5 text-gray-400" />
                    {v.country !== '-' ? `${v.country} ${v.city}` : '-'}
                  </td>
                  <td className="py-2.5 px-5 text-xs text-gray-500 dark:text-gray-500 max-w-[300px] truncate">{v.path}</td>
                  <td className="py-2.5 px-5 text-right text-xs text-gray-400">{v.time.slice(5, 16).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6"><AdminPagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
      )}
    </div>
  );
}
