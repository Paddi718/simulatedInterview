'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import StatCard from '@/components/admin/StatCard';
import type { AdminStats, AdminUserItem, AdminInterviewItem } from '@/types/admin';
import {
  Users,
  PlayCircle,
  FileText,
  Activity,
  ArrowRight,
  Clock,
} from 'lucide-react';

const CATEGORY_LABELS: Record<string, string> = {
  private_enterprise: '私企',
  civil_service: '公务员',
  institution: '事业单位',
};

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: '初级', mid: '中级', medium: '中级', hard: '高级',
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) +
    ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentUsers, setRecentUsers] = useState<AdminUserItem[]>([]);
  const [recentInterviews, setRecentInterviews] = useState<AdminInterviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, u, i] = await Promise.all([
          api.get<AdminStats>('/api/admin/stats'),
          api.get<{ items: AdminUserItem[] }>('/api/admin/users?page=1&size=5'),
          api.get<{ items: AdminInterviewItem[] }>('/api/admin/interviews?page=1&size=5'),
        ]);
        setStats(s);
        setRecentUsers(u.items);
        setRecentInterviews(i.items);
      } catch (err) {
        console.error('Failed to load admin dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">
          管理仪表盘
        </h1>
        <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
          系统运行概况与数据统计
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="总用户数" value={stats?.total_users ?? '-'} icon={Users} variant="blue" loading={loading} />
        <StatCard title="今日面试数" value={stats?.today_interviews ?? '-'} icon={PlayCircle} variant="green" loading={loading} />
        <StatCard title="总面试数" value={stats?.total_interviews ?? '-'} icon={FileText} variant="purple" loading={loading} />
        <StatCard title="7日活跃用户" value={stats?.active_users_7d ?? '-'} icon={Activity} variant="yellow" loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">最近注册用户</CardTitle>
            <Link href="/admin/users" className="inline-flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600 font-medium transition-colors">
              查看全部 <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pb-4">
            {recentUsers.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">暂无用户</p>
            ) : (
              <div className="space-y-3">
                {recentUsers.map((u) => (
                  <div key={u.id} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400 text-sm font-medium shrink-0">
                      {u.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {u.username}
                        {u.is_admin && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-purple-50 dark:bg-purple-950/30 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400">
                            管理员
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{u.email || '未绑定邮箱'}</p>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{formatDate(u.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">最近面试</CardTitle>
            <Link href="/admin/interviews" className="inline-flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600 font-medium transition-colors">
              查看全部 <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pb-4">
            {recentInterviews.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">暂无面试记录</p>
            ) : (
              <div className="space-y-3">
                {recentInterviews.map((iv) => (
                  <div key={iv.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {iv.username}
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400">
                          {CATEGORY_LABELS[iv.interview_category] || iv.interview_category}
                        </span>
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                        {iv.position || DIFFICULTY_LABELS[iv.difficulty] || iv.difficulty}
                      </p>
                    </div>
                    {iv.total_score != null && (
                      <span className="text-sm font-semibold text-brand-500 dark:text-brand-400 shrink-0">
                        {iv.total_score}分
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 shrink-0">
                      <Clock className="h-3 w-3" />
                      {formatDate(iv.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
