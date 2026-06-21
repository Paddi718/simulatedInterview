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
      // 1. POST 触发生成文档（服务端验证权限 + 生成文件）
      await api.post(`/api/interview/${interviewId}/document/${fmt}`);
      // 2. GET 下载文件（携带 auth token，通过 api.downloadBlob）
      const { blob, filename } = await api.downloadBlob(`/api/interview/${interviewId}/document/${fmt}`);
      // 3. 触发浏览器下载
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('导出失败：' + err.message);
    } finally {
      setLoading(null);
    }
  };

  const formats = [
    { key: 'pdf', label: '导出 PDF', icon: '📄' },
    { key: 'html', label: '导出 HTML', icon: '🌐' },
    { key: 'md', label: '导出 Markdown', icon: '📝' },
  ];

  return (
    <div className="flex gap-2">
      {formats.map(({ key, label, icon }) => (
        <button
          key={key}
          onClick={() => handleExport(key)}
          disabled={loading === key}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {icon} {loading === key ? '导出中...' : label}
        </button>
      ))}
    </div>
  );
}
