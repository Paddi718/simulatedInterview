'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import AdminPagination from '@/components/admin/AdminPagination';
import UserDetailDialog from '@/components/admin/UserDetailDialog';
import DeleteUserDialog from '@/components/admin/DeleteUserDialog';
import type { AdminUserItem, PaginatedResponse } from '@/types/admin';
import {
  Search,
  Shield,
  UserCheck,
  UserX,
  Eye,
  RefreshCw,
  Trash2,
  Loader2,
  Users,
} from 'lucide-react';

const PAGE_SIZE = 20;

function AdminUsersContent() {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      const data = await api.get<PaginatedResponse<AdminUserItem>>(`/api/admin/users?${params}`);
      setUsers(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
    } catch {
      toast({ title: '加载失败', description: '无法获取用户列表', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, search, toast]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleSearch = () => { setSearch(searchInput); setPage(1); };

  const handleToggleAdmin = async (user: AdminUserItem) => {
    setActingId(user.id);
    try {
      await api.put(`/api/admin/users/${user.id}`, { is_admin: !user.is_admin });
      toast({ title: user.is_admin ? '已取消管理员' : '已设为管理员', variant: 'success' });
      loadUsers();
    } catch (err: any) { toast({ title: '操作失败', description: err.message, variant: 'error' }); }
    finally { setActingId(null); }
  };

  const handleToggleActive = async (user: AdminUserItem) => {
    setActingId(user.id);
    try {
      await api.put(`/api/admin/users/${user.id}`, { is_active: !user.is_active });
      toast({ title: user.is_active ? '用户已禁用' : '用户已启用', variant: 'success' });
      loadUsers();
    } catch (err: any) { toast({ title: '操作失败', description: err.message, variant: 'error' }); }
    finally { setActingId(null); }
  };

  const handleRestore = async (user: AdminUserItem) => {
    setActingId(user.id);
    try {
      await api.post(`/api/admin/users/${user.id}/restore`);
      toast({ title: '用户已恢复', variant: 'success' });
      loadUsers();
    } catch (err: any) { toast({ title: '操作失败', description: err.message, variant: 'error' }); }
    finally { setActingId(null); }
  };

  const handleSoftDelete = async () => {
    if (!deleteTarget) return;
    setActingId(deleteTarget.id);
    try {
      await api.del(`/api/admin/users/${deleteTarget.id}/soft`);
      toast({ title: '用户已注销（软删除）', variant: 'success' });
      setDeleteOpen(false); setDeleteTarget(null); loadUsers();
    } catch (err: any) { toast({ title: '操作失败', description: err.message, variant: 'error' }); }
    finally { setActingId(null); }
  };

  const handleHardDelete = async () => {
    if (!deleteTarget) return;
    setActingId(deleteTarget.id);
    try {
      await api.del(`/api/admin/users/${deleteTarget.id}/hard`);
      toast({ title: '用户已永久删除', variant: 'success' });
      setDeleteOpen(false); setDeleteTarget(null); loadUsers();
    } catch (err: any) { toast({ title: '操作失败', description: err.message, variant: 'error' }); }
    finally { setActingId(null); }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">用户管理</h1>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">共 {total} 位用户</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="搜索用户名或邮箱..." className="pl-9" />
        </div>
        <Button variant="secondary" size="sm" onClick={handleSearch}>搜索</Button>
      </div>

      <div className="bg-white dark:bg-gray-900/80 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-brand-500" /></div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Users className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-400 dark:text-gray-500">暂无匹配用户</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-5 font-medium text-gray-500 dark:text-gray-400 text-xs">用户名</th>
                  <th className="text-left py-3 px-5 font-medium text-gray-500 dark:text-gray-400 text-xs">邮箱</th>
                  <th className="text-left py-3 px-5 font-medium text-gray-500 dark:text-gray-400 text-xs">状态</th>
                  <th className="text-left py-3 px-5 font-medium text-gray-500 dark:text-gray-400 text-xs">面试数</th>
                  <th className="text-left py-3 px-5 font-medium text-gray-500 dark:text-gray-400 text-xs">注册时间</th>
                  <th className="text-right py-3 px-5 font-medium text-gray-500 dark:text-gray-400 text-xs">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{u.username}</span>
                        {u.is_admin && <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-50 dark:bg-purple-950/30 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400"><Shield className="h-2.5 w-2.5" /></span>}
                      </div>
                    </td>
                    <td className="py-3 px-5 text-sm text-gray-500 dark:text-gray-400 max-w-[200px] truncate">{u.email || '-'}</td>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-1.5">
                        {u.is_active
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-950/30 px-2 py-0.5 text-[11px] font-medium text-green-600 dark:text-green-400"><UserCheck className="h-3 w-3" /> 正常</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-950/30 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400"><UserX className="h-3 w-3" /> 已禁用</span>}
                        {!u.is_verified && <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">未验证</span>}
                      </div>
                    </td>
                    <td className="py-3 px-5 text-sm text-gray-500 dark:text-gray-400">{u.interview_count}</td>
                    <td className="py-3 px-5 text-sm text-gray-400 dark:text-gray-500">{formatDate(u.created_at)}</td>
                    <td className="py-3 px-5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setDetailUserId(u.id); setDetailOpen(true); }} className="w-8 h-8 rounded-lg text-gray-300 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 flex items-center justify-center transition-colors" title="查看详情"><Eye className="h-4 w-4" /></button>
                        <button onClick={() => handleToggleAdmin(u)} disabled={actingId === u.id} className="w-8 h-8 rounded-lg text-gray-300 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 flex items-center justify-center disabled:opacity-50 transition-colors" title={u.is_admin ? '取消管理员' : '设为管理员'}>
                          {actingId === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                        </button>
                        <button onClick={() => u.is_active ? handleToggleActive(u) : handleRestore(u)} disabled={actingId === u.id} className="w-8 h-8 rounded-lg text-gray-300 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center justify-center disabled:opacity-50 transition-colors" title={u.is_active ? '禁用' : '恢复'}>
                          {actingId === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : u.is_active ? <UserX className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                        </button>
                        <button onClick={() => { setDeleteTarget(u); setDeleteOpen(true); }} className="w-8 h-8 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center transition-colors" title="删除"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AdminPagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      <UserDetailDialog userId={detailUserId} open={detailOpen} onOpenChange={setDetailOpen} />
      <DeleteUserDialog open={deleteOpen} onOpenChange={setDeleteOpen} onSoftDelete={handleSoftDelete} onHardDelete={handleHardDelete} username={deleteTarget?.username || ''} loading={actingId !== null} />
    </div>
  );
}

export default function AdminUsersPage() {
  return <ToastProvider><AdminUsersContent /></ToastProvider>;
}
