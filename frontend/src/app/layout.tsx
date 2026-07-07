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
          {children}
          {/* ICP 备案号 */}
          <div className="text-center py-3 text-[11px] text-gray-300 dark:text-gray-600">
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400 dark:hover:text-gray-500 transition-colors">
              皖ICP备2026020023号
            </a>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
