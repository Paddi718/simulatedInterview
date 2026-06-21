'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Resume {
  id: string;
  original_filename: string;
  file_type: string;
  created_at: string;
}

export default function ResumePage() {
  const router = useRouter();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);

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

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这份简历？')) return;
    try {
      await api.del(`/api/resume/${id}`);
      loadResumes();
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.upload('/api/resume/upload', formData);
      loadResumes();
    } catch (err: any) {
      alert('上传失败：' + err.message);
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
        <h1 className="text-2xl font-bold">简历管理</h1>
        <Link href="/dashboard" className="text-blue-600 hover:underline">← 返回</Link>
      </div>

      <div className="mb-6">
        <input type="file" accept=".pdf,.docx,.txt" onChange={handleUpload} className="hidden" id="resume-upload" />
        <label htmlFor="resume-upload" className="inline-flex px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">
          + 上传简历
        </label>
      </div>

      {resumes.length === 0 ? (
        <div className="text-center py-12 text-gray-500">暂无简历</div>
      ) : (
        <div className="space-y-2">
          {resumes.map((r) => (
            <div key={r.id} className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm">
              <div>
                <p className="font-medium">{r.original_filename}</p>
                <p className="text-sm text-gray-500">{r.file_type.toUpperCase()} · {new Date(r.created_at).toLocaleDateString('zh-CN')}</p>
              </div>
              <button onClick={() => handleDelete(r.id)} className="text-red-500 hover:underline text-sm">
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
