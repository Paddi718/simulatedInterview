'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check, FileText, Upload, Loader2, Brain, Target, Zap,
  ChevronRight, ChevronLeft, AlertCircle, ClipboardList, Trash2,
  Landmark, Building2, Briefcase, Search, ChevronDown
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

type Category = 'private_enterprise' | 'civil_service' | 'institution';

const PROVINCES = [
  '北京市', '天津市', '上海市', '重庆市',
  '河北省', '山西省', '辽宁省', '吉林省', '黑龙江省',
  '江苏省', '浙江省', '安徽省', '福建省', '江西省', '山东省',
  '河南省', '湖北省', '湖南省', '广东省', '海南省',
  '四川省', '贵州省', '云南省', '陕西省', '甘肃省', '青海省', '台湾省',
  '内蒙古自治区', '广西壮族自治区', '西藏自治区', '宁夏回族自治区', '新疆维吾尔自治区',
];

const CATEGORIES: { id: Category; label: string; desc: string; icon: any }[] = [
  { id: 'private_enterprise', label: '私企面试', desc: '选择简历、岗位和难度，进行企业模拟面试', icon: Building2 },
  { id: 'civil_service', label: '公务员面试', desc: '选择省份、职位类别和层级，进行公务员面试模拟', icon: Landmark },
  { id: 'institution', label: '事业单位面试', desc: '选择省份、职位类别，可选简历和岗位难度', icon: Briefcase },
];

const CIVIL_POSITION_CATEGORIES = ['综合管理', '行政执法', '专业技术'];
const CIVIL_LEVELS = ['中央', '省', '市(地)', '县(区)'];
const INST_POSITION_CATEGORIES = ['综合管理', '专业技术', '工勤技能'];

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: '初级', icon: Brain, desc: '基础概念与常规问题，适合应届毕业生或1-3年经验' },
  { value: 'mid', label: '中级', icon: Target, desc: '深入原理与项目经验，适合3-5年工作经验' },
  { value: 'hard', label: '高级', icon: Zap, desc: '架构设计与高难度问题，适合5年以上资深岗位' },
];

const CATEGORY_STEP_LABELS: Record<Category, string[]> = {
  private_enterprise: ['简历', '岗位', '难度'],
  civil_service: ['省份', '职位类别', '层级', '岗位名称'],
  institution: ['省份', '职位类别', '简历', '岗位与难度'],
};

const QUESTION_COUNT_OPTIONS = [3, 4, 5];

export default function PreparePage() {
  const router = useRouter();
  const [category, setCategory] = useState<Category | null>(null);
  const [step, setStep] = useState(1);

  // Province
  const [province, setProvince] = useState('');
  const [provinceSearch, setProvinceSearch] = useState('');
  const [provinceDropdownOpen, setProvinceDropdownOpen] = useState(false);
  const provinceRef = useRef<HTMLDivElement>(null);

  // Civil service
  const [positionCategory, setPositionCategory] = useState('');
  const [level, setLevel] = useState('');
  const [positionName, setPositionName] = useState('');
  const [questionCount, setQuestionCount] = useState(4);

  // Institution
  const [instDifficulty, setInstDifficulty] = useState('mid');

  // Shared / Private enterprise
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [jds, setJds] = useState<JD[]>([]);
  const [selectedResume, setSelectedResume] = useState('');
  const [selectedJd, setSelectedJd] = useState('');
  const [jdText, setJdText] = useState('');
  const [difficulty, setDifficulty] = useState('mid');

  // UI
  const [loading, setLoading] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [creatingJd, setCreatingJd] = useState(false);
  const [deletingJdId, setDeletingJdId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Click outside handler for province dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (provinceRef.current && !provinceRef.current.contains(e.target as Node)) {
        setProvinceDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const handleCategorySelect = (cat: Category) => {
    // Reset all selections when switching category
    setProvince('');
    setProvinceSearch('');
    setPositionCategory('');
    setLevel('');
    setPositionName('');
    setQuestionCount(4);
    setInstDifficulty('mid');
    setSelectedResume('');
    setSelectedJd('');
    setJdText('');
    setDifficulty('mid');
    setError('');
    setStep(1);
    setCategory(cat);
  };

  const getCurrentCategoryInfo = () => CATEGORIES.find(c => c.id === category);

  const handleStart = async () => {
    if (!category) return;

    setLoading(true);
    setError('');

    try {
      let jdId = selectedJd;
      if (!jdId && jdText.trim()) {
        const jd = await api.post<JD>('/api/jd/create', { raw_text: jdText });
        jdId = jd.id;
      }

      const body: Record<string, any> = { category };

      if (category === 'private_enterprise') {
        if (!selectedResume && !jdId) {
          setError('请选择简历和岗位介绍');
          setLoading(false);
          return;
        }
        body.resume_id = selectedResume;
        body.jd_id = jdId;
        body.difficulty = difficulty;
      } else if (category === 'civil_service') {
        if (!province || !positionCategory || !level) {
          setError('请完成所有必填项');
          setLoading(false);
          return;
        }
        body.category_config = {
          province,
          position_category: positionCategory,
          level,
          position_name: positionName || undefined,
        };
        body.question_count = questionCount;
      } else if (category === 'institution') {
        if (!province || !positionCategory) {
          setError('请完成所有必填项');
          setLoading(false);
          return;
        }
        if (selectedResume) body.resume_id = selectedResume;
        if (jdId) body.jd_id = jdId;
        body.difficulty = instDifficulty;
        body.category_config = {
          province,
          position_category: positionCategory,
        };
      }

      const result = await api.post<{ id: string }>('/api/interview/create', body);
      router.push(`/interview/session?id=${result.id}`);
    } catch (err: any) {
      const msg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err || '未知错误'));
      setError(msg);
      setLoading(false);
    }
  };

  /* ========== Render helpers ========== */

  const stepLabels = category ? CATEGORY_STEP_LABELS[category] : [];
  const totalSteps = stepLabels.length;

  const renderStepIndicator = () => {
    if (!category) return null;
    return (
      <div className="flex items-center justify-center gap-0 mb-10">
        {stepLabels.map((label, i) => {
          const s = i + 1;
          return (
            <div key={s} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                  s < step
                    ? 'bg-brand-500 text-white shadow-sm shadow-brand-200'
                    : s === step
                    ? 'bg-brand-500 text-white shadow-sm shadow-brand-200 ring-4 ring-brand-100 dark:ring-brand-900'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                }`}>
                  {s < step ? <Check className="w-4 h-4" /> : <span>{s}</span>}
                </div>
                <span className={`text-xs font-medium ${
                  s === step ? 'text-brand-500 dark:text-brand-400' : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {label}
                </span>
              </div>
              {i < totalSteps - 1 && (
                <div className={`w-12 sm:w-20 h-0.5 mx-2 sm:mx-3 mt-[-1.25rem] rounded-full ${
                  s < step ? 'bg-brand-500' : 'bg-gray-200 dark:bg-gray-700'
                }`} />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderProvinceSelect = () => {
    const filteredProvinces = PROVINCES.filter(p => p.includes(provinceSearch));
    return (
      <div ref={provinceRef} className="relative">
        <div
          onClick={() => setProvinceDropdownOpen(!provinceDropdownOpen)}
          className={`rounded-2xl border p-4 cursor-pointer transition-all duration-200 bg-white dark:bg-gray-900 ${
            province
              ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-950/30 dark:border-brand-500 shadow-sm shadow-brand-100 dark:shadow-brand-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-sm ${province ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
              {province || '请选择省份'}
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${provinceDropdownOpen ? 'rotate-180' : ''}`} />
          </div>
        </div>
        {provinceDropdownOpen && (
          <div className="absolute z-20 mt-2 w-full bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
            <div className="p-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input
                  type="text"
                  value={provinceSearch}
                  onChange={(e) => setProvinceSearch(e.target.value)}
                  placeholder="搜索省份..."
                  className="bg-transparent border-none outline-none text-sm text-gray-700 dark:text-gray-300 w-full placeholder:text-gray-400"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {filteredProvinces.length > 0 ? (
                filteredProvinces.map(p => (
                  <div
                    key={p}
                    onClick={() => { setProvince(p); setProvinceDropdownOpen(false); setProvinceSearch(''); }}
                    className={`px-4 py-2.5 text-sm cursor-pointer transition-colors ${
                      province === p
                        ? 'bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400 font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    {p}
                  </div>
                ))
              ) : (
                <p className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500 text-center">无匹配省份</p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCardGrid = (options: string[], selected: string, onSelect: (v: string) => void) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {options.map(opt => {
        const isActive = selected === opt;
        return (
          <div
            key={opt}
            onClick={() => onSelect(opt)}
            className={`rounded-2xl border p-5 text-center cursor-pointer transition-all duration-200 ${
              isActive
                ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-950/30 dark:border-brand-500 shadow-sm shadow-brand-100 dark:shadow-brand-900/20'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
            }`}
          >
            <p className={`font-medium text-sm ${isActive ? 'text-brand-600 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300'}`}>
              {opt}
            </p>
            {isActive && (
              <div className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center mx-auto mt-2">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderQuestionCountSelector = () => (
    <div className="flex gap-3">
      {QUESTION_COUNT_OPTIONS.map(n => (
        <div
          key={n}
          onClick={() => setQuestionCount(n)}
          className={`rounded-2xl border p-5 text-center cursor-pointer transition-all duration-200 flex-1 ${
            questionCount === n
              ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-950/30 dark:border-brand-500 shadow-sm shadow-brand-100 dark:shadow-brand-900/20'
              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
          }`}
        >
          <p className={`text-xl font-bold ${questionCount === n ? 'text-brand-600 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300'}`}>
            {n}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">道题</p>
          {questionCount === n && (
            <div className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center mx-auto mt-1">
              <Check className="w-3 h-3 text-white" />
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderResumeCards = (showOptionalLabel = false) => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">选择简历</h2>
        <p className={`text-sm mt-1 ${showOptionalLabel ? 'text-gray-500 dark:text-gray-400' : 'text-gray-500 dark:text-gray-400'}`}>
          {showOptionalLabel ? '可选，选择一份已有简历或上传新的简历文件' : '选择一份已有简历，或上传新的简历文件'}
        </p>
      </div>
      {resumes.length > 0 && (
        <div className="space-y-2.5">
          {resumes.map(r => (
            <div
              key={r.id}
              onClick={() => setSelectedResume(r.id)}
              className={`rounded-2xl border p-4 cursor-pointer transition-all duration-200 ${
                selectedResume === r.id
                  ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-950/30 dark:border-brand-500 shadow-sm shadow-brand-100 dark:shadow-brand-900/20'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  selectedResume === r.id
                    ? 'bg-brand-100 dark:bg-brand-900/50'
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}>
                  <FileText className={`w-5 h-5 ${
                    selectedResume === r.id ? 'text-brand-500 dark:text-brand-400' : 'text-gray-400 dark:text-gray-500'
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
                  <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className={`relative rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
        uploadingResume
          ? 'border-brand-300 bg-brand-50/50 dark:border-brand-600 dark:bg-brand-950/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-600 bg-white dark:bg-gray-900'
      }`}>
        {uploadingResume ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
            <p className="text-sm font-medium text-brand-500 dark:text-brand-400">上传解析中...</p>
          </div>
        ) : (
          <>
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={handleUploadResume}
              className="hidden"
              id={`resume-upload-${category || 'default'}`}
            />
            <label htmlFor={`resume-upload-${category || 'default'}`} className="cursor-pointer flex flex-col items-center gap-3">
              <Upload className="w-8 h-8 text-gray-300 dark:text-gray-600" />
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  点击或拖拽上传简历
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  支持 PDF、DOCX、TXT 格式
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-brand-500 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/40 rounded-xl hover:bg-brand-100 dark:hover:bg-brand-950/60 transition-colors">
                <Upload className="w-4 h-4" />
                选择文件
              </span>
            </label>
          </>
        )}
      </div>
    </div>
  );

  const renderJDSelection = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">选择岗位介绍</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">选择已有岗位介绍，或粘贴新的岗位描述</p>
      </div>
      {jds.length > 0 && (
        <div className="space-y-2.5">
          {jds.map(j => (
            <div
              key={j.id}
              onClick={() => { setSelectedJd(j.id); setJdText(''); }}
              className={`group rounded-2xl border p-4 cursor-pointer transition-all duration-200 ${
                selectedJd === j.id
                  ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-950/30 dark:border-brand-500 shadow-sm shadow-brand-100 dark:shadow-brand-900/20'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  selectedJd === j.id
                    ? 'bg-brand-100 dark:bg-brand-900/50'
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}>
                  <ClipboardList className={`w-5 h-5 ${
                    selectedJd === j.id ? 'text-brand-500 dark:text-brand-400' : 'text-gray-400 dark:text-gray-500'
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
                  <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center">
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
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden transition-all focus-within:border-brand-400 dark:focus-within:border-brand-500 focus-within:shadow-sm">
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
            className="text-xs font-medium text-brand-500 dark:text-brand-400 hover:text-brand-600 disabled:text-gray-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
          >
            {creatingJd ? '保存中...' : '保存为岗位模板'}
          </button>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {jdText.length} 字
          </span>
        </div>
      </div>
    </div>
  );

  const renderDifficultySelection = (
    value: string,
    onChange: (v: string) => void,
  ) => (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">选择难度</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">选择适合你经验水平的面试难度</p>
      <div className="grid gap-3 mt-5">
        {DIFFICULTY_OPTIONS.map(opt => {
          const Icon = opt.icon;
          const isActive = value === opt.value;
          return (
            <div
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`rounded-2xl border p-5 cursor-pointer transition-all duration-200 ${
                isActive
                  ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-950/30 dark:border-brand-500 shadow-sm shadow-brand-100 dark:shadow-brand-900/20'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                  isActive
                    ? 'bg-brand-100 dark:bg-brand-900/50'
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}>
                  <Icon className={`w-5 h-5 ${
                    isActive ? 'text-brand-500 dark:text-brand-400' : 'text-gray-400 dark:text-gray-500'
                  }`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{opt.label}</p>
                    {isActive && (
                      <div className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center">
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
    </div>
  );

  const renderNavButtons = (prevStep: number | null, nextStep: number | null, nextDisabled: boolean, nextLabel = '下一步') => (
    <div className="flex items-center justify-between pt-2">
      {prevStep !== null ? (
        <button
          onClick={() => setStep(prevStep)}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
          上一步
        </button>
      ) : (
        <div />
      )}
      {nextStep !== null ? (
        <button
          onClick={() => setStep(nextStep)}
          disabled={nextDisabled}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-500 text-white font-medium rounded-xl hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shadow-brand-200 dark:shadow-brand-900"
        >
          {nextLabel}
          <ChevronRight className="w-4 h-4" />
        </button>
      ) : null}
    </div>
  );

  /* ========== Main Render ========== */
  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
      <div className="max-w-2xl mx-auto px-4 py-12 sm:py-16">

        {/* Page Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            准备面试
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
            选择面试类型，开始 AI 模拟面试
          </p>
        </div>

        {/* ===================== Step 0: Category Selection ===================== */}
        {!category && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">选择面试类型</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">请选择你要准备的面试类型</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {CATEGORIES.map(cat => {
                const Icon = cat.icon;
                return (
                  <div
                    key={cat.id}
                    onClick={() => handleCategorySelect(cat.id)}
                    className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 cursor-pointer transition-all duration-200 hover:border-brand-300 dark:hover:border-brand-600 hover:shadow-sm group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 group-hover:bg-brand-50 dark:group-hover:bg-brand-950/30 transition-colors">
                      <Icon className="w-6 h-6 text-gray-400 dark:text-gray-500 group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors" />
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1.5">{cat.label}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{cat.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================== Category-Specific Steps ===================== */}
        {category && (
          <>
            {/* Category pill indicator */}
            <div className="flex items-center justify-center mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full text-sm">
                {(() => {
                  const info = getCurrentCategoryInfo();
                  if (!info) return null;
                  const Icon = info.icon;
                  return (
                    <>
                      <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <span className="text-gray-600 dark:text-gray-400 font-medium">{info.label}</span>
                      <button
                        onClick={() => { setCategory(null); setStep(1); setError(''); }}
                        className="ml-1 text-xs text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300 transition-colors"
                      >
                        更换
                      </button>
                    </>
                  );
                })()}
              </div>
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

            {/* ================== Private Enterprise Steps ================== */}
            {category === 'private_enterprise' && (
              <>
                {/* Step 1: Resume */}
                {step === 1 && (
                  <div className="space-y-6 animate-fade-in">
                    {renderResumeCards(false)}
                    {renderNavButtons(null, 2, !selectedResume)}
                  </div>
                )}

                {/* Step 2: JD */}
                {step === 2 && (
                  <div className="space-y-6 animate-fade-in">
                    {renderJDSelection()}
                    {renderNavButtons(1, 3, !selectedJd && !jdText.trim())}
                  </div>
                )}

                {/* Step 3: Difficulty */}
                {step === 3 && (
                  <div className="space-y-6 animate-fade-in">
                    {renderDifficultySelection(difficulty, setDifficulty)}
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
                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-500 text-white font-medium rounded-xl hover:bg-brand-600 disabled:opacity-50 transition-all shadow-sm shadow-brand-200 dark:shadow-brand-900"
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
              </>
            )}

            {/* ================== Civil Service Steps ================== */}
            {category === 'civil_service' && (
              <>
                {/* Step 1: Province */}
                {step === 1 && (
                  <div className="space-y-6 animate-fade-in">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">选择省份</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">选择报考的省份</p>
                    </div>
                    {renderProvinceSelect()}
                    {renderNavButtons(null, 2, !province)}
                  </div>
                )}

                {/* Step 2: Position Category */}
                {step === 2 && (
                  <div className="space-y-6 animate-fade-in">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">选择职位类别</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">选择报考的职位类别</p>
                    </div>
                    {renderCardGrid(CIVIL_POSITION_CATEGORIES, positionCategory, setPositionCategory)}
                    {renderNavButtons(1, 3, !positionCategory)}
                  </div>
                )}

                {/* Step 3: Level */}
                {step === 3 && (
                  <div className="space-y-6 animate-fade-in">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">选择层级</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">选择报考的层级</p>
                    </div>
                    {renderCardGrid(CIVIL_LEVELS, level, setLevel)}
                    {renderNavButtons(2, 4, !level)}
                  </div>
                )}

                {/* Step 4: Position Name + Question Count */}
                {step === 4 && (
                  <div className="space-y-6 animate-fade-in">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">岗位名称与题目数量</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">可选填写报考岗位名称，选择面试题目数量</p>
                    </div>

                    {/* Position Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        岗位名称 <span className="text-gray-400 dark:text-gray-500 font-normal">(可选)</span>
                      </label>
                      <input
                        type="text"
                        value={positionName}
                        onChange={(e) => setPositionName(e.target.value)}
                        placeholder="例如：国家税务总局办公厅一级主任科员"
                        className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-3 text-sm text-gray-700 dark:text-gray-300 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-brand-400 dark:focus:border-brand-500 focus:shadow-sm transition-all"
                      />
                    </div>

                    {/* Question Count */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        题目数量
                      </label>
                      {renderQuestionCountSelector()}
                    </div>

                    {/* Navigation */}
                    <div className="flex items-center justify-between pt-2">
                      <button
                        onClick={() => setStep(3)}
                        className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        上一步
                      </button>
                      <button
                        onClick={handleStart}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-500 text-white font-medium rounded-xl hover:bg-brand-600 disabled:opacity-50 transition-all shadow-sm shadow-brand-200 dark:shadow-brand-900"
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
              </>
            )}

            {/* ================== Institution Steps ================== */}
            {category === 'institution' && (
              <>
                {/* Step 1: Province */}
                {step === 1 && (
                  <div className="space-y-6 animate-fade-in">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">选择省份</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">选择报考的省份</p>
                    </div>
                    {renderProvinceSelect()}
                    {renderNavButtons(null, 2, !province)}
                  </div>
                )}

                {/* Step 2: Position Category */}
                {step === 2 && (
                  <div className="space-y-6 animate-fade-in">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">选择职位类别</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">选择报考的职位类别</p>
                    </div>
                    {renderCardGrid(INST_POSITION_CATEGORIES, positionCategory, setPositionCategory)}
                    {renderNavButtons(1, 3, !positionCategory)}
                  </div>
                )}

                {/* Step 3: Resume (optional) */}
                {step === 3 && (
                  <div className="space-y-6 animate-fade-in">
                    {renderResumeCards(true)}
                    {renderNavButtons(2, 4, false)}
                  </div>
                )}

                {/* Step 4: JD (optional) + Difficulty */}
                {step === 4 && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="border-b border-gray-100 dark:border-gray-800 pb-1">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">岗位介绍与面试难度</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">可选填写岗位介绍，选择面试难度</p>
                    </div>

                    {/* JD (optional) */}
                    <div className="opacity-80 hover:opacity-100 transition-opacity">
                      {renderJDSelection()}
                    </div>

                    {/* Divider */}
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-100 dark:border-gray-800" />
                      </div>
                      <div className="relative flex justify-center">
                        <span className="bg-gray-50/50 dark:bg-gray-950 px-3 text-xs text-gray-400 dark:text-gray-500">
                          以下为必填
                        </span>
                      </div>
                    </div>

                    {/* Difficulty */}
                    {renderDifficultySelection(instDifficulty, setInstDifficulty)}

                    {/* Navigation */}
                    <div className="flex items-center justify-between pt-2">
                      <button
                        onClick={() => setStep(3)}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-all"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        上一步
                      </button>
                      <button
                        onClick={handleStart}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-500 text-white font-medium rounded-xl hover:bg-brand-600 disabled:opacity-50 transition-all shadow-sm shadow-brand-200 dark:shadow-brand-900"
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
              </>
            )}
          </>
        )}

        {/* ===================== Loading Overlay ===================== */}
        {loading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 dark:bg-gray-950/80 backdrop-blur-md">
            <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-modal p-10 text-center max-w-sm mx-4 animate-fade-in border border-gray-100 dark:border-gray-800">
              <div className="w-16 h-16 mx-auto mb-5 relative">
                <div className="absolute inset-0 rounded-full bg-brand-100 dark:bg-brand-950 animate-ping opacity-30" />
                <div className="relative w-16 h-16 rounded-full bg-brand-500 flex items-center justify-center">
                  <Loader2 className="w-7 h-7 text-white animate-spin" />
                </div>
              </div>
              <p className="text-gray-900 dark:text-gray-100 font-semibold text-lg mb-1">正在创建面试</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm">正在根据选择生成面试题目...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
