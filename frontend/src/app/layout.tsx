import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

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
    <html lang="zh-CN">
      <body className={inter.className}>
        <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
          {children}
        </main>
      </body>
    </html>
  )
}
