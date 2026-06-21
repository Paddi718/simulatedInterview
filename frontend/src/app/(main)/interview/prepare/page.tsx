'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check, FileText, Upload, Loader2, Brain, Target, Zap,
  ChevronRight, ChevronLeft, AlertCircle, ClipboardList, Trash2
} from 'lucide-react';
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

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: '初级', icon: Brain, desc: '基础概念与常规问题，适合应届毕业生或1-3年经验' },
  { value: 'mid', label: '中级', icon: Target, desc: '深入原理与项目经验，适合3-5年工作经验' },
  { value: 'hard', label: '高级', icon: Zap, desc: '架构设计与高难度问题，适合5年以上资深岗位' },
];

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
  const [uploadingResume, setUploadingResume] = useState(false);
  const [creatingJd, setCreatingJd] = useState(false);
  const [deletingJdId, setDeletingJdId] = useState<string | null>(null);
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
    setUploadingResume(true);
    try {
      await api.upload('/api/resume/upload', formData);
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploadingResume(false);
    }
  };

  const handleCreateJd = async () => {
    if (!jdText.trim()) return;
    setCreatingJd(true);
    try {
      await api.post('/api/jd/create', { raw_text: jdText });
      setJdText('');
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreatingJd(false);
    }
  };

  const handleDeleteJd = async (e: React.MouseEvent, jdId: string) => {
    e.stopPropagation();
    setDeletingJdId(jdId);
    try {
      await api.del(`/api/jd/${jdId}`);
      if (selectedJd === jdId) setSelectedJd('');
      setJds(prev => prev.filter(j => j.id !== jdId));
    } catch (err: any) {
      setError(err.message || '删除失败');
    } finally {
      setDeletingJdId(null);
    }
  };

  const handleStart = async () => {
    if (!selectedResume && !selectedJd) {
      setError('请选择简历和岗位介绍');
      return;
    }
    setLoading(true);
    setError('');
    try {
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
      setLoading(false);
    }
  };

  const renderStepIndicator = () => {
    const labels = ['简历', '岗位', '难度'];
    return (
      <div className="flex items-center justify-center gap-0 mb-10">
        {[1, 2, 3].map((s, i) => (
          <div key={s} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                s < step
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                  : s === step
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-200 ring-4 ring-blue-100 dark:ring-blue-900'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
              }`}>
                {s < step ? <Check className="w-4 h-4" /> : <span>{s}</span>}
              </div>
              <span className={`text-xs font-medium ${
                s === step ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
              }`}>
                {labels[i]}
              </span>
            </div>
            {i < 2 && (
              <div className={`w-12 sm:w-20 h-0.5 mx-2 sm:mx-3 mt-[-1.25rem] rounded-full ${
                s < step ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'
              }`} />
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
      <div className="max-w-2xl mx-auto px-4 py-12 sm:py-16">

        {/* Page Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            准备面试
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
            选择简历、岗位和难度，开始 AI 模拟面试
          </p>
        </div>

        {/* Step Indicator */}
        {renderStepIndicator()}

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2.5 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 px-4 py-3 rounded-2xl mb-6 text-sm border border-red-100 dark:border-red-900">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ===================== Step 1: Resume ===================== */}
        {step === 1 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">选择简历</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">选择一份已有简历，或上传新的简历文件</p>
            </div>

            {/* Resume Cards */}
            {resumes.length > 0 && (
              <div className="space-y-2.5">
                {resumes.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => setSelectedResume(r.id)}
                    className={`rounded-2xl border p-4 cursor-pointer transition-all duration-200 ${
                      selectedResume === r.id
                        ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30 dark:border-blue-600 shadow-sm shadow-blue-100 dark:shadow-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        selectedResume === r.id
                          ? 'bg-blue-100 dark:bg-blue-900/50'
                          : 'bg-gray-100 dark:bg-gray-800'
                      }`}>
                        <FileText className={`w-5 h-5 ${
                          selectedResume === r.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">
                          {r.original_filename}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {r.created_at ? new Date(r.created_at).toLocaleDateString('zh-CN') : ''}
                        </p>
                      </div>
                      {selectedResume === r.id && (
                        <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Area */}
            <div className={`relative rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
              uploadingResume
                ? 'border-blue-300 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-950/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 bg-white dark:bg-gray-900'
            }`}>
              {uploadingResume ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                  <p className="text-sm font-medium text-blue-600 dark:text-blue-400">上传解析中...</p>
                </div>
              ) : (
                <>
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={handleUploadResume}
                    className="hidden"
                    id="resume-upload"
                  />
                  <label htmlFor="resume-upload" className="cursor-pointer flex flex-col items-center gap-3">
                    <Upload className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        点击或拖拽上传简历
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        支持 PDF、DOCX、TXT 格式
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-950/60 transition-colors">
                      <Upload className="w-4 h-4" />
                      选择文件
                    </span>
                  </label>
                </>
              )}
            </div>

            {/* Navigation */}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setStep(2)}
                disabled={!selectedResume}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shadow-blue-200 dark:shadow-blue-900"
              >
                下一步
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ===================== Step 2: JD ===================== */}
        {step === 2 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">选择岗位介绍</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">选择已有岗位介绍，或粘贴新的岗位描述</p>
            </div>

            {/* JD Cards */}
            {jds.length > 0 && (
              <div className="space-y-2.5">
                {jds.map((j) => (
                  <div
                    key={j.id}
                    onClick={() => { setSelectedJd(j.id); setJdText(''); }}
                    className={`group rounded-2xl border p-4 cursor-pointer transition-all duration-200 ${
                      selectedJd === j.id
                        ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30 dark:border-blue-600 shadow-sm shadow-blue-100 dark:shadow-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        selectedJd === j.id
                          ? 'bg-blue-100 dark:bg-blue-900/50'
                          : 'bg-gray-100 dark:bg-gray-800'
                      }`}>
                        <ClipboardList className={`w-5 h-5 ${
                          selectedJd === j.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                          {j.raw_text.slice(0, 80)}...
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {j.created_at ? new Date(j.created_at).toLocaleDateString('zh-CN') : ''}
                        </p>
                      </div>
                      {selectedJd === j.id && (
                        <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                      <button
                        onClick={(e) => handleDeleteJd(e, j.id)}
                        disabled={deletingJdId === j.id}
                        className="ml-2 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                        title="删除岗位"
                      >
                        {deletingJdId === j.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* JD Textarea */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden transition-all focus-within:border-blue-400 dark:focus-within:border-blue-600 focus-within:shadow-sm">
              <textarea
                value={jdText}
                onChange={(e) => { setJdText(e.target.value); if (e.target.value) setSelectedJd(''); }}
                placeholder="粘贴岗位描述..."
                className="w-full h-32 px-5 py-4 text-sm text-gray-700 dark:text-gray-300 bg-transparent border-none resize-none focus:outline-none placeholder:text-gray-400 dark:placeholder:text-gray-600"
              />
              <div className="flex items-center justify-between px-5 py-2.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900">
                <button
                  onClick={handleCreateJd}
                  disabled={!jdText.trim() || creatingJd}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 disabled:text-gray-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
                >
                  {creatingJd ? '保存中...' : '保存为岗位模板'}
                </button>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {jdText.length} 字
                </span>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
                上一步
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!selectedJd && !jdText.trim()}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shadow-blue-200 dark:shadow-blue-900"
              >
                下一步
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ===================== Step 3: Difficulty ===================== */}
        {step === 3 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">选择难度</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">选择适合你经验水平的面试难度</p>
            </div>

            {/* Difficulty Cards */}
            <div className="grid gap-3">
              {DIFFICULTY_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = difficulty === opt.value;
                return (
                  <div
                    key={opt.value}
                    onClick={() => !loading && setDifficulty(opt.value)}
                    className={`rounded-2xl border p-5 cursor-pointer transition-all duration-200 ${
                      isActive
                        ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30 dark:border-blue-600 shadow-sm shadow-blue-100 dark:shadow-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                        isActive
                          ? 'bg-blue-100 dark:bg-blue-900/50'
                          : 'bg-gray-100 dark:bg-gray-800'
                      }`}>
                        <Icon className={`w-5 h-5 ${
                          isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900 dark:text-gray-100">{opt.label}</p>
                          {isActive && (
                            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{opt.desc}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setStep(2)}
                disabled={loading}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
                上一步
              </button>
              <button
                onClick={handleStart}
                disabled={loading}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm shadow-blue-200 dark:shadow-blue-900"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    正在生成面试题目...
                  </>
                ) : (
                  <>
                    开始面试
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ===================== Loading Overlay ===================== */}
        {loading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 dark:bg-gray-950/80 backdrop-blur-md">
            <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-modal p-10 text-center max-w-sm mx-4 animate-fade-in border border-gray-100 dark:border-gray-800">
              <div className="w-16 h-16 mx-auto mb-5 relative">
                <div className="absolute inset-0 rounded-full bg-blue-100 dark:bg-blue-950 animate-ping opacity-30" />
                <div className="relative w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center">
                  <Loader2 className="w-7 h-7 text-white animate-spin" />
                </div>
              </div>
              <p className="text-gray-900 dark:text-gray-100 font-semibold text-lg mb-1">正在创建面试</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm">正在根据简历和岗位要求生成面试题目...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
