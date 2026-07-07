import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/layout/ThemeProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AI 模拟面试',
  description: '智能模拟面试平台 - 语音交互 + AI 评分',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <div className="min-h-screen flex flex-col">
            <div className="flex-1">
              {children}
            </div>
            {/* ICP 备案号 — 始终钉在页面底部 */}
            <div className="text-center py-2.5 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">
              <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                皖ICP备2026020023号
              </a>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
