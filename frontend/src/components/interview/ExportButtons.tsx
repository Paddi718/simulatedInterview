'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, FileDown, Globe, FileCode, Loader2, Printer } from 'lucide-react';
import { api } from '@/lib/api';

interface ExportButtonsProps {
  interviewId: string;
}

const FORMATS: Record<string, { label: string; icon: typeof FileText }> = {
  docx: { label: '导出 Word', icon: FileText },
  html: { label: '导出 HTML', icon: Globe },
  md: { label: '导出 Markdown', icon: FileCode },
};

export default function ExportButtons({ interviewId }: ExportButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const router = useRouter();

  // PDF：先确保文件已生成，然后新标签页打开预览
  const handlePdfPreview = async () => {
    setPdfLoading(true);
    try {
      await api.post<{ filepath: string; format: string }>(`/api/interview/${interviewId}/document/pdf`);
      const token = localStorage.getItem('access_token');
      const url = `/api/interview/${interviewId}/document/pdf?token=${token}`;
      window.open(url, '_blank');
    } catch (err: any) {
      alert('PDF 预览失败：' + (err.message || '未知错误'));
    } finally { setPdfLoading(false); }
  };

  // Word / HTML / Markdown：保持原下载逻辑
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

  // 跳转到打印专用页面（题目全展开、无UI干扰、自动弹打印对话框）
  const handlePrint = () => {
    router.push(`/interview/print/${interviewId}`);
  };

  return (
    <div className="flex gap-3 flex-wrap justify-center">
      {/* PDF 预览 */}
      <button
        onClick={handlePdfPreview}
        disabled={pdfLoading}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-medium text-sm rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm min-w-[140px] justify-center"
      >
        {pdfLoading ? (
          <><Loader2 className="w-4 h-4 animate-spin" />生成中...</>
        ) : (
          <><FileDown className="w-4 h-4" /> 预览 PDF</>
        )}
      </button>

      {/* 打印 / 另存为 PDF */}
      <button
        onClick={handlePrint}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 font-medium text-sm rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-all shadow-sm min-w-[140px] justify-center"
      >
        <Printer className="w-4 h-4" /> 打印保存
      </button>

      {/* 其他格式 */}
      {Object.entries(FORMATS).map(([key, { label, icon: Icon }]) => (
        <button
          key={key}
          onClick={() => handleExport(key)}
          disabled={loading !== null}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 font-medium text-sm rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm min-w-[140px] justify-center"
        >
          {loading === key ? (
            <><Loader2 className="w-4 h-4 animate-spin" />生成中...</>
          ) : (
            <><Icon className="w-4 h-4" /> {label}</>
          )}
        </button>
      ))}
    </div>
  );
}
