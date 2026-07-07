import Sidebar from '@/components/layout/Sidebar'
import IcpBadge from '@/components/layout/IcpBadge'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 md:ml-60 min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
        <div className="flex-1">{children}</div>
        <IcpBadge />
      </main>
    </div>
  )
}
