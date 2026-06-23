import AdminGuard from '@/components/admin/AdminGuard';
import AdminSidebar from '@/components/admin/AdminSidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <div className="flex min-h-screen">
        <AdminSidebar />
        <main className="flex-1 md:ml-60 min-h-screen bg-gray-50 dark:bg-gray-950">
          {children}
        </main>
      </div>
    </AdminGuard>
  );
}
