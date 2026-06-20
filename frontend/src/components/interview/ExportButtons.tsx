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
      await api.post(`/api/interview/${interviewId}/document/${fmt}`);
      window.open(`http://localhost:8000/api/interview/${interviewId}/document/${fmt}`, '_blank');
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
