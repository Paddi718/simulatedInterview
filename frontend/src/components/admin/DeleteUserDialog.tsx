'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, ChevronLeft, Trash2, Archive } from 'lucide-react';

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSoftDelete: () => void;
  onHardDelete: () => void;
  username: string;
  loading?: boolean;
}

type Step = 'choose' | 'confirm_soft' | 'confirm_hard';

export default function DeleteUserDialog({
  open,
  onOpenChange,
  onSoftDelete,
  onHardDelete,
  username,
  loading,
}: DeleteUserDialogProps) {
  const [step, setStep] = useState<Step>('choose');

  const reset = () => {
    setStep('choose');
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleConfirm = () => {
    if (step === 'confirm_soft') onSoftDelete();
    else if (step === 'confirm_hard') onHardDelete();
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        {step === 'choose' ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                <DialogTitle>选择删除方式</DialogTitle>
              </div>
              <DialogDescription className="mt-3">
                用户 <span className="font-medium text-gray-700 dark:text-gray-300">{username}</span> 的删除操作：
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <button
                onClick={() => setStep('confirm_soft')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-amber-300 dark:hover:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-all text-left"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-600 shrink-0">
                  <Archive className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">软删除</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    数据保留，账号立即失效，后续可恢复
                  </p>
                </div>
              </button>
              <button
                onClick={() => setStep('confirm_hard')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all text-left"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 shrink-0">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">硬删除</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    永久删除用户及所有关联数据，不可恢复
                  </p>
                </div>
              </button>
            </div>
            <div className="flex justify-end pt-2">
              <DialogClose asChild>
                <Button variant="secondary" size="sm">取消</Button>
              </DialogClose>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                <DialogTitle>
                  {step === 'confirm_soft' ? '确认软删除' : '确认硬删除'}
                </DialogTitle>
              </div>
              <DialogDescription className="mt-3">
                {step === 'confirm_soft' ? (
                  <>
                    用户 <span className="font-medium text-gray-700 dark:text-gray-300">{username}</span> 将被注销，
                    数据保留在数据库中，后续可通过「恢复」操作恢复。
                  </>
                ) : (
                  <>
                    用户 <span className="font-medium text-gray-700 dark:text-gray-300">{username}</span>{' '}
                    及其所有关联数据（面试记录、简历、JD等）将<span className="text-red-500 font-medium">永久删除</span>，
                    此操作<span className="text-red-500 font-medium">不可撤销</span>。
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => setStep('choose')}
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                返回选择
              </button>
              <div className="flex gap-3">
                <DialogClose asChild>
                  <Button variant="secondary" size="sm">取消</Button>
                </DialogClose>
                <Button variant="danger" size="sm" onClick={handleConfirm} disabled={loading}>
                  {loading ? '处理中...' : step === 'confirm_soft' ? '确认软删除' : '确认永久删除'}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
