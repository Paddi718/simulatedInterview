import { create } from 'zustand';
import { api } from '@/lib/api';

interface User {
  id: string;
  username: string;
  email?: string;
  is_admin?: boolean;
  created_at: string;
  tts_preference?: { voice?: string; speed?: number; auto_read?: boolean } | null;
}

// 后端 tts_preference 是跨设备同步的权威源。
// 同步进 localStorage，让面试页（只读 localStorage）拿到正确值——
// 否则登录后直接进面试页会用旧的 localStorage 值，必须进设置点保存才生效。
function syncTtsToStorage(user: User | undefined | null) {
  if (!user?.tts_preference) return;
  const p = user.tts_preference;
  if (p.voice !== undefined && p.voice) localStorage.setItem('tts_voice', p.voice);
  if (p.speed !== undefined && p.speed) localStorage.setItem('tts_speed', String(p.speed));
  if (p.auto_read !== undefined) localStorage.setItem('tts_auto_read', String(p.auto_read));
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, email?: string) => Promise<boolean>;
  verifyEmail: (username: string, code: string) => Promise<void>;
  resendCode: (username: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (username, password) => {
    const data = await api.post<{ access_token: string; user: User }>(
      '/api/auth/login',
      { username, password }
    );
    localStorage.setItem('access_token', data.access_token);
    syncTtsToStorage(data.user);
    set({ user: data.user, isAuthenticated: true });
  },

  register: async (username, password, email?) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || '注册失败');

    if (data.data?.need_verify) {
      return true; // need verification
    }

    // 无邮箱直接登录
    localStorage.setItem('access_token', data.data.access_token);
    syncTtsToStorage(data.data.user);
    set({ user: data.data.user, isAuthenticated: true });
    return false;
  },

  verifyEmail: async (username, code) => {
    const res = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || '验证失败');

    localStorage.setItem('access_token', data.data.access_token);
    syncTtsToStorage(data.data.user);
    set({ user: data.data.user, isAuthenticated: true });
  },

  resendCode: async (username) => {
    const res = await fetch('/api/auth/resend-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.detail || '重发失败');
    }
  },

  logout: () => {
    localStorage.removeItem('access_token');
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        set({ isLoading: false });
        return;
      }
      const user = await api.get<User>('/api/auth/me');
      syncTtsToStorage(user);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem('access_token');
      set({ isLoading: false });
    }
  },
}));
