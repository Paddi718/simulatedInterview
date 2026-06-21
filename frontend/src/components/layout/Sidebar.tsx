'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  PlayCircle,
  History,
  FileText,
  Settings,
  LogOut,
  Briefcase,
  Moon,
  Sun,
  ChevronLeft,
  Menu,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from './ThemeProvider'
import { useState } from 'react'

const navItems = [
  { label: '仪表盘', href: '/dashboard', icon: LayoutDashboard },
  { label: '开始面试', href: '/interview/prepare', icon: PlayCircle },
  { label: '历史记录', href: '/history', icon: History },
  { label: '简历管理', href: '/resume', icon: FileText },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-white">
          <Briefcase className="h-3.5 w-3.5" strokeWidth={1.5} />
        </div>
        <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 tracking-tight">
          AI 模拟面试
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-50 text-brand-500 dark:bg-brand-950 dark:text-brand-400'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-gray-100 dark:border-gray-800 px-3 py-3 space-y-1">
        {/* Settings */}
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <Settings className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          <span>设置</span>
        </Link>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          ) : (
            <Moon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          )}
          <span>{theme === 'dark' ? '浅色模式' : '深色模式'}</span>
        </button>

        {/* Logout */}
        <button
          onClick={() => {
            localStorage.removeItem('access_token');
            window.location.href = '/login';
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-500 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-red-400"
        >
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          <span>退出登录</span>
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm border border-gray-200 text-gray-600 md:hidden dark:bg-gray-900 dark:border-gray-700 dark:text-gray-400"
        aria-label="打开菜单"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-60 bg-white border-r border-gray-200 shadow-lg transition-transform duration-300 ease-in-out md:hidden dark:bg-gray-900 dark:border-gray-800',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
        {/* Close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          aria-label="关闭菜单"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </aside>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-gray-200 bg-white md:flex dark:border-gray-800 dark:bg-gray-900">
        {sidebarContent}
      </aside>
    </>
  )
}
