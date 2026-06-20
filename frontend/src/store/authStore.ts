import { create } from 'zustand';
import { api } from '@/lib/api';

interface User {
  id: string;
  username: string;
  email?: string;
  created_at: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
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
    set({ user: data.user, isAuthenticated: true });
  },

  register: async (username, password) => {
    const data = await api.post<{ access_token: string; user: User }>(
      '/api/auth/register',
      { username, password }
    );
    localStorage.setItem('access_token', data.access_token);
    set({ user: data.user, isAuthenticated: true });
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
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem('access_token');
      set({ isLoading: false });
    }
  },
}));
