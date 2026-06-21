'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface ExportButtonsProps {
  interviewId: string;
}

export default function ExportButtons({ interviewId }: ExportButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleExport = async (fmt: string) => {
    setLoading(fmt);
    try {
      // 1. POST 触发生成文档
      const genResult = await api.post<{ filepath: string; format: string }>(`/api/interview/${interviewId}/document/${fmt}`);
      if (!genResult?.filepath) throw new Error('生成失败');
      // 2. 通过 a 标签直接下载（浏览器会带上已登录的 cookie 或我们用 api 下载）
      const { blob, filename } = await api.downloadBlob(`/api/interview/${interviewId}/document/${fmt}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('导出失败：' + (err.message || '未知错误'));
    } finally { setLoading(null); }
  };

  const formatLabels: Record<string, { label: string; icon: string }> = {
    pdf: { label: '导出 PDF', icon: '📄' },
    html: { label: '导出 HTML', icon: '🌐' },
    md: { label: '导出 Markdown', icon: '📝' },
  };

  return (
    <div className="flex gap-2 flex-wrap justify-center">
      {Object.entries(formatLabels).map(([key, { label, icon }]) => (
        <button
          key={key}
          onClick={() => handleExport(key)}
          disabled={loading !== null}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 min-w-[140px] justify-center"
        >
          {loading === key ? (
            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />生成中...</>
          ) : (
            <>{icon} {label}</>
          )}
        </button>
      ))}
    </div>
  );
}
