'use client';

import { useEffect, useState, useRef } from 'react';
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
import {
  FileText,
  Upload,
  Trash2,
  ChevronRight,
  Loader2,
} from 'lucide-react';

interface Resume {
  id: string;
  original_filename: string;
  file_type: string;
  created_at: string;
}

const fileIconColors: Record<string, string> = {
  pdf: 'text-red-500 dark:text-red-400',
  docx: 'text-brand-500 dark:text-brand-400',
  doc: 'text-brand-500 dark:text-brand-400',
  txt: 'text-gray-500 dark:text-gray-400',
};

const fileTypeLabels: Record<string, string> = {
  pdf: 'PDF',
  docx: 'DOCX',
  doc: 'DOC',
  txt: 'TXT',
};

function getFileType(raw: string): string {
  return raw.replace(/^\./, '').toLowerCase();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-900/80 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700" />
        <div className="flex-1 space-y-2.5">
          <div className="h-4 w-44 bg-gray-200 dark:bg-gray-700 rounded-md" />
          <div className="h-3 w-28 bg-gray-100 dark:bg-gray-800 rounded-md" />
        </div>
        <div className="h-8 w-8 rounded-xl bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  );
}

function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  deleting,
  fileName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  deleting: boolean;
  fileName: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>
            确定要删除 <span className="font-medium text-gray-700 dark:text-gray-300">{fileName}</span> 吗？此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-end gap-3 pt-4">
          <DialogClose asChild>
            <Button variant="secondary" size="sm">
              取消
            </Button>
          </DialogClose>
          <Button
            variant="danger"
            size="sm"
            loading={deleting}
            onClick={onConfirm}
          >
            删除
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ResumePage() {
  const router = useRouter();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Resume | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }
    loadResumes();
  }, []);

  const loadResumes = async () => {
    try {
      const data = await api.get<{ resumes: Resume[]; total: number }>('/api/resume/list');
      setResumes(data.resumes || []);
    } catch (err) {
      console.error('Failed to load resumes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.del(`/api/resume/${deleteTarget.id}`);
      setResumes((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      alert('删除失败：' + (err.message || '未知错误'));
    } finally {
      setDeleting(false);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);

    // Simulate progress for better UX
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 300);

    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.upload('/api/resume/upload', formData);
      clearInterval(progressInterval);
      setUploadProgress(100);
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
        loadResumes();
      }, 500);
    } catch (err: any) {
      clearInterval(progressInterval);
      setUploading(false);
      setUploadProgress(0);
      alert('上传失败：' + (err.message || '未知错误'));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleUpload(file);
    // Reset input so same file can be re-uploaded
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
        <div className="max-w-3xl mx-auto px-4 py-12">
          <div className="mb-8 animate-pulse">
            <div className="h-8 w-28 bg-gray-200 dark:bg-gray-800 rounded-lg mb-2" />
            <div className="h-4 w-44 bg-gray-100 dark:bg-gray-800/50 rounded-md" />
          </div>
          <div className="mb-6 animate-pulse">
            <div className="h-40 rounded-2xl bg-gray-100 dark:bg-gray-900/60 border-2 border-dashed border-gray-200 dark:border-gray-800" />
          </div>
          <div className="space-y-2.5">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">
                简历管理
              </h1>
              <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                上传和管理你的简历文件
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

        {/* Upload Area */}
        {uploading ? (
          <div className="mb-6 bg-white dark:bg-gray-900/80 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-brand-500 dark:text-brand-400 animate-spin" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  正在解析简历...
                </p>
                <div className="mt-2 w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-500 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
              <span className="text-xs font-medium text-gray-400 dark:text-gray-500 shrink-0">
                {uploadProgress}%
              </span>
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              mb-6 h-40 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer
              transition-all duration-200
              ${
                dragOver
                  ? 'border-brand-400 bg-brand-50/50 dark:border-brand-500 dark:bg-brand-900/20'
                  : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-900/80'
              }
            `}
          >
            <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
              <Upload className="h-6 w-6 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              点击选择文件或拖拽上传
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              支持 PDF、DOCX、TXT 格式
            </p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={handleFileChange}
          className="hidden"
          id="resume-upload"
        />

        {/* Resume List or Empty State */}
        {resumes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-5">
              <FileText className="h-8 w-8 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-1">
              暂无简历
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              上传你的第一份简历，开始模拟面试之旅
            </p>
            <Button onClick={() => fileInputRef.current?.click()}>
              上传第一份简历
            </Button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {resumes.map((r) => {
              const ext = getFileType(r.file_type);
              const colorClass = fileIconColors[ext] || 'text-gray-500 dark:text-gray-400';
              const typeLabel = fileTypeLabels[ext] || r.file_type.toUpperCase();

              return (
                <div
                  key={r.id}
                  className="group flex items-center gap-4 bg-white dark:bg-gray-900/80 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 hover:border-gray-200 dark:hover:border-gray-700 hover:shadow-md transition-all duration-200"
                >
                  {/* File icon */}
                  <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                    <FileText className={`h-5 w-5 ${colorClass}`} />
                  </div>

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {r.original_filename}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {typeLabel} · {formatDate(r.created_at)}
                    </p>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={() => setDeleteTarget(r)}
                    className="w-8 h-8 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-red-500 hover:border-red-200 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-sm"
                    title="删除简历"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={handleDelete}
        deleting={deleting}
        fileName={deleteTarget?.original_filename || ''}
      />
    </div>
  );
}
