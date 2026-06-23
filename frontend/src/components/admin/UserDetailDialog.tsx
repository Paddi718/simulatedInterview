'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Loader2, Mail, Shield, UserCheck, UserX, Calendar, BarChart3 } from 'lucide-react';
import type { AdminUserDetail } from '@/types/admin';

interface UserDetailDialogProps {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  private_enterprise: '私企',
  civil_service: '公务员',
  institution: '事业单位',
};

export default function UserDetailDialog({ userId, open, onOpenChange }: UserDetailDialogProps) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId || !open) return;
    setLoading(true);
    api.get<AdminUserDetail>(`/api/admin/users/${userId}`)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>用户详情</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
          </div>
        ) : detail ? (
          <div className="space-y-5">
            {/* Basic Info */}
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400 text-lg font-bold shrink-0">
                {detail.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {detail.username}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {detail.is_admin && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 dark:bg-purple-950/30 px-2 py-0.5 text-[11px] font-medium text-purple-600 dark:text-purple-400">
                      <Shield className="h-3 w-3" /> 管理员
                    </span>
                  )}
                  {detail.is_active ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-950/30 px-2 py-0.5 text-[11px] font-medium text-green-600 dark:text-green-400">
                      <UserCheck className="h-3 w-3" /> 正常
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-950/30 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                      <UserX className="h-3 w-3" /> 已禁用
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Detail Items */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <Mail className="h-4 w-4" />
                {detail.email || '未绑定邮箱'}
              </div>
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <Shield className="h-4 w-4" />
                {detail.is_verified ? '已验证' : '未验证'}
              </div>
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <Calendar className="h-4 w-4" />
                {new Date(detail.created_at).toLocaleDateString('zh-CN')}
              </div>
            </div>

            {/* Interview Stats */}
            <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">面试统计</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 dark:text-gray-500 text-xs">总面试数</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{detail.stats.total_interviews}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 dark:text-gray-500 text-xs">平均分</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {detail.stats.avg_score != null ? detail.stats.avg_score : '-'}
                  </p>
                </div>
              </div>
              {Object.keys(detail.stats.by_category).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Object.entries(detail.stats.by_category).map(([cat, cnt]) => (
                    <span key={cat} className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:text-gray-400">
                      {CATEGORY_LABELS[cat] || cat}：{cnt} 次
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 py-8 text-center">加载失败</p>
        )}
        <div className="flex justify-end pt-2">
          <DialogClose asChild>
            <Button variant="secondary" size="sm">关闭</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
