'use client';

import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  variant?: 'blue' | 'green' | 'purple' | 'yellow';
  loading?: boolean;
}

const variantStyles: Record<string, string> = {
  blue: 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400',
  green: 'bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400',
  purple: 'bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400',
  yellow: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
};

export default function StatCard({ title, value, icon: Icon, variant = 'blue', loading }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-5">
        <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl shrink-0', variantStyles[variant])}>
          <Icon className="h-6 w-6" strokeWidth={1.5} />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{title}</p>
          {loading ? (
            <div className="mt-1 h-7 w-16 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
          ) : (
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
