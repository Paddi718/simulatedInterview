'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  Briefcase,
  TrendingUp,
  Clock,
  PlayCircle,
  History,
  FileText,
  Settings,
  LogOut,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Interview {
  id: string;
  created_at: string;
  difficulty?: string;
  total_score?: number;
  status?: string;
  position?: string;
  company?: string;
}

interface User {
  id: string;
  username: string;
  email?: string;
}

function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString('zh-CN');
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const userData = await api.get<User>('/api/auth/me');
        if (cancelled) return;
        setUser(userData);

        try {
          const interviewData = await api.get<Interview[]>('/api/interview/list');
          if (!cancelled) {
            setInterviews(Array.isArray(interviewData) ? interviewData : []);
          }
        } catch {
          // interview list may not be available yet
          if (!cancelled) setInterviews([]);
        }
      } catch {
        localStorage.removeItem('access_token');
        if (!cancelled) router.push('/login');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    router.push('/login');
  };

  // Stats
  const totalInterviews = interviews.length;
  const averageScore =
    totalInterviews > 0
      ? Math.round(
          interviews.reduce((sum, i) => sum + (i.total_score || 0), 0) / totalInterviews
        )
      : null;
  const lastInterview = interviews.length > 0 ? interviews[0] : null;

  // Today date for welcome
  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Navbar */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
                <Briefcase className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                AI 模拟面试
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {user.username}
              </span>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                退出
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            你好，{user.username}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{today}</p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 transition-all duration-200 hover:shadow-md">
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center mb-4">
              <Briefcase className="w-5 h-5 text-brand-500 dark:text-brand-400" />
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {totalInterviews}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">面试总数</p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 transition-all duration-200 hover:shadow-md">
            <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-900/30 flex items-center justify-center mb-4">
              <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {averageScore !== null ? averageScore : '--'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">平均分</p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 transition-all duration-200 hover:shadow-md">
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center mb-4">
              <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {lastInterview ? getRelativeTime(lastInterview.created_at) : '暂无'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">最近面试</p>
          </div>
        </div>

        {/* Quick Action - Prominent CTA */}
        <div className="bg-gradient-to-br from-brand-500 via-brand-600 to-indigo-800 rounded-2xl p-8 shadow-sm mb-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
          <div className="relative z-10">
            <h2 className="text-xl font-bold text-white mb-2">准备好开始面试了吗？</h2>
            <p className="text-brand-100/80 mb-6 max-w-lg">
              选择岗位类型和面试难度，AI 将为你生成真实的面试场景，帮助你快速提升面试技巧。
            </p>
            <Link
              href="/interview/prepare"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-brand-600 rounded-xl font-medium hover:bg-brand-50 transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              <PlayCircle className="w-5 h-5" />
              开始新面试
            </Link>
          </div>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Link
            href="/history"
            className="group bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200">
              <History className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">历史记录</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              查看过往面试记录和报告
            </p>
          </Link>

          <Link
            href="/resume"
            className="group bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-900/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200">
              <FileText className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">简历管理</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              上传和管理简历文件
            </p>
          </Link>

          <Link
            href="/settings"
            className="group bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200">
              <Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">设置</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              语音偏好与个人信息
            </p>
          </Link>
        </div>

        {/* Recent Interviews */}
        {interviews.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">最近面试</h3>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {interviews.slice(0, 3).map((interview) => (
                <Link
                  key={interview.id}
                  href={interview.status === 'completed' ? `/interview/result/${interview.id}` : `/interview/session?id=${interview.id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${interview.status === 'completed' ? 'bg-green-400' : 'bg-amber-400'}`} />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {interview.position || (interview.difficulty
                          ? `${interview.difficulty === 'easy' ? '初级' : interview.difficulty === 'hard' ? '高级' : '中级'} 面试`
                          : '模拟面试')}
                        {interview.company && <span className="text-gray-400 font-normal ml-1.5">@{interview.company}</span>}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {formatDate(interview.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {interview.total_score !== undefined && interview.total_score !== null && (
                      <span
                        className={cn(
                          'text-sm font-semibold',
                          interview.total_score >= 80
                            ? 'text-green-600 dark:text-green-400'
                            : interview.total_score >= 60
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-red-600 dark:text-red-400'
                        )}
                      >
                        {interview.total_score} 分
                      </span>
                    )}
                    <span className="text-gray-300 dark:text-gray-600">&rarr;</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
