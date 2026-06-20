'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Resume {
  id: string;
  original_filename: string;
  created_at: string;
}

interface JD {
  id: string;
  raw_text: string;
  created_at: string;
}

export default function PreparePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [jds, setJds] = useState<JD[]>([]);
  const [selectedResume, setSelectedResume] = useState('');
  const [selectedJd, setSelectedJd] = useState('');
  const [jdText, setJdText] = useState('');
  const [difficulty, setDifficulty] = useState('mid');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [resumeData, jdData] = await Promise.all([
        api.get<{ resumes: Resume[] }>('/api/resume/list'),
        api.get<{ items: JD[] }>('/api/jd/list'),
      ]);
      setResumes(resumeData.resumes || []);
      setJds(jdData.items || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUploadResume = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.upload('/api/resume/upload', formData);
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateJd = async () => {
    if (!jdText.trim()) return;
    setLoading(true);
    try {
      await api.post('/api/jd/create', { raw_text: jdText });
      setJdText('');
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleStart = async () => {
    if (!selectedResume && !selectedJd) {
      setError('请选择简历和岗位介绍');
      return;
    }
    setLoading(true);
    try {
      // 如果没有选择已有JD，先创建
      let jdId = selectedJd;
      if (!jdId && jdText.trim()) {
        const jd = await api.post<JD>('/api/jd/create', { raw_text: jdText });
        jdId = jd.id;
      }
      const result = await api.post<{ id: string }>('/api/interview/create', {
        resume_id: selectedResume,
        jd_id: jdId,
        difficulty,
      });
      router.push(`/interview/session?id=${result.id}`);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">准备面试</h1>

      {/* Step Indicator */}
      <div className="flex mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex-1 flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${s <= step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {s}
            </div>
            {s < 3 && <div className={`flex-1 h-1 mx-2 ${s < step ? 'bg-blue-600' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>
      )}

      {/* Step 1: Select Resume */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">步骤 1：选择简历</h2>
          <div className="space-y-2">
            {resumes.map((r) => (
              <label key={r.id} className={`block p-3 border rounded-lg cursor-pointer ${selectedResume === r.id ? 'border-blue-500 bg-blue-50' : ''}`}>
                <input type="radio" name="resume" value={r.id} checked={selectedResume === r.id} onChange={() => setSelectedResume(r.id)} className="mr-2" />
                {r.original_filename}
              </label>
            ))}
          </div>
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <input type="file" accept=".pdf,.docx,.txt" onChange={handleUploadResume} className="hidden" id="resume-upload" />
            <label htmlFor="resume-upload" className="cursor-pointer text-blue-600 hover:underline">
              + 上传新简历
            </label>
          </div>
          <button onClick={() => setStep(2)} disabled={!selectedResume} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            下一步
          </button>
        </div>
      )}

      {/* Step 2: Select/Enter JD */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">步骤 2：选择岗位介绍</h2>
          {jds.length > 0 && (
            <div className="space-y-2">
              {jds.map((j) => (
                <label key={j.id} className={`block p-3 border rounded-lg cursor-pointer ${selectedJd === j.id ? 'border-blue-500 bg-blue-50' : ''}`}>
                  <input type="radio" name="jd" value={j.id} checked={selectedJd === j.id} onChange={() => setSelectedJd(j.id)} className="mr-2" />
                  {j.raw_text.slice(0, 80)}...
                </label>
              ))}
            </div>
          )}
          <textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder="或粘贴新的岗位介绍..."
            className="w-full h-32 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="px-6 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">上一步</button>
            <button onClick={() => setStep(3)} disabled={!selectedJd && !jdText.trim()} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              下一步
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Start */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">步骤 3：开始面试</h2>
          <div>
            <label className="block text-sm font-medium mb-1">难度选择</label>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
              <option value="easy">初级</option>
              <option value="mid">中级</option>
              <option value="hard">高级</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="px-6 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">上一步</button>
            <button onClick={handleStart} disabled={loading} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              {loading ? '创建中...' : '开始面试'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
