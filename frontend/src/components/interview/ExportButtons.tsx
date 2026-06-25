'use client';

import { useState } from 'react';
import { FileDown, FileCode, Mail, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

interface ExportButtonsProps {
  interviewId: string;
}

export default function ExportButtons({ interviewId }: ExportButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleExport = async (fmt: string) => {
    setLoading(fmt);
    try {
      const genResult = await api.post<{ filepath: string; format: string }>(`/api/interview/${interviewId}/document/${fmt}`);
      if (!genResult?.filepath) throw new Error('生成失败');
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

  const handleSendEmail = async () => {
    setLoading('email');
    try {
      await api.post(`/api/interview/${interviewId}/document/pdf?generate_only=true`);
      const result = await api.post<{ message: string }>(`/api/interview/${interviewId}/document/email`);
      alert(result.message || '已发送');
    } catch (err: any) {
      alert('发送失败：' + (err.message || '未知错误'));
    } finally { setLoading(null); }
  };

  return (
    <div className="flex gap-3 flex-wrap justify-center">
      {/* PDF 导出 */}
      <button
        onClick={() => handleExport('pdf')}
        disabled={loading !== null}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-medium text-sm rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm min-w-[140px] justify-center"
      >
        {loading === 'pdf' ? <><Loader2 className="w-4 h-4 animate-spin" />生成中...</> : <><FileDown className="w-4 h-4" /> 导出 PDF</>}
      </button>

      {/* Markdown 导出 */}
      <button
        onClick={() => handleExport('md')}
        disabled={loading !== null}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 font-medium text-sm rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm min-w-[140px] justify-center"
      >
        {loading === 'md' ? <><Loader2 className="w-4 h-4 animate-spin" />生成中...</> : <><FileCode className="w-4 h-4" /> 导出 Markdown</>}
      </button>

      {/* 发送到邮箱 */}
      <button
        onClick={handleSendEmail}
        disabled={loading !== null}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 font-medium text-sm rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm min-w-[140px] justify-center"
      >
        {loading === 'email' ? <><Loader2 className="w-4 h-4 animate-spin" />发送中...</> : <><Mail className="w-4 h-4" /> 发送到邮箱</>}
      </button>
    </div>
  );
}
