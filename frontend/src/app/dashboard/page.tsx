'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }
    api.get('/api/auth/me').then(setUser).catch(() => {
      localStorage.removeItem('access_token');
      router.push('/login');
    });
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    router.push('/login');
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Navbar */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">AI 模拟面试</h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-600">{user.username}</span>
          <button onClick={handleLogout} className="text-red-500 hover:underline">
            退出
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm mb-8">
        <h2 className="text-lg font-semibold mb-4">快速开始</h2>
        <Link
          href="/interview/prepare"
          className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          开始新面试
        </Link>
      </div>

      {/* Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/history"
          className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <h3 className="font-semibold">📋 历史记录</h3>
          <p className="text-sm text-gray-500 mt-2">查看过往面试记录和报告</p>
        </Link>
        <Link
          href="/resume"
          className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <h3 className="font-semibold">📄 简历管理</h3>
          <p className="text-sm text-gray-500 mt-2">上传和管理简历文件</p>
        </Link>
        <Link
          href="/settings"
          className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <h3 className="font-semibold">⚙️ 设置</h3>
          <p className="text-sm text-gray-500 mt-2">语音偏好与个人信息</p>
        </Link>
      </div>
    </div>
  );
}
