/**
 * API 客户端 — 全部使用相对路径，由 Next.js rewrite 代理到后端。
 * 生产环境下后端地址永不暴露到浏览器。
 */

// WebSocket URL 从浏览器地址派生（生产同源，本地开发可设环境变量）
export function getWsUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:8000';
  const envWs = process.env.NEXT_PUBLIC_WS_URL;
  if (envWs) return envWs;                            // 本地开发：直连后端
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;       // 生产：同源
}

class ApiError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

  const isFormData = options.body instanceof FormData;
  const hasBody = options.body != null;
  const headers: Record<string, string> = {
    ...(isFormData || !hasBody ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // 相对路径 → Next.js rewrite 代理到后端（生产安全）
  const res = await fetch(endpoint, { ...options, headers });

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  const json = await res.json();

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    const errMsg = (() => {
      if (json.message) return json.message;
      if (typeof json.detail === 'string') return json.detail;
      if (Array.isArray(json.detail)) {
        return json.detail.map((d: any) => d.msg || d.message || '').filter(Boolean).join('; ');
      }
      return 'Request failed';
    })();
    throw new ApiError(errMsg, res.status);
  }

  if (json.code !== undefined) {
    if (json.code !== 0) {
      throw new ApiError(json.message || 'Request failed', json.code);
    }
    return json.data as T;
  }

  return json as T;
}

async function downloadBlob(endpoint: string): Promise<{ blob: Blob; filename: string }> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const res = await fetch(endpoint, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    throw new ApiError('Download failed', res.status);
  }
  const disposition = res.headers.get('Content-Disposition') || '';
  // 优先取 RFC 5987 filename*=UTF-8''xxx（中文名），其次取普通 filename=
  const starMatch = disposition.match(/filename\*=UTF-8''([^;]+)/);
  let filename = 'download';
  if (starMatch) {
    filename = decodeURIComponent(starMatch[1]);
  } else {
    const match = disposition.match(/filename="?(.+?)"?$/);
    if (match) filename = match[1];
  }
  const blob = await res.blob();
  return { blob, filename };
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, data?: any) => {
    if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
      const body: ArrayBuffer = data instanceof Uint8Array ? (data.buffer as ArrayBuffer) : data;
      return request<T>(endpoint, {
        method: 'POST',
        body: body as unknown as BodyInit,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
    }
    return request<T>(endpoint, { method: 'POST', body: JSON.stringify(data) });
  },
  put: <T>(endpoint: string, data?: any) =>
    request<T>(endpoint, { method: 'PUT', body: JSON.stringify(data) }),
  del: <T>(endpoint: string) =>
    request<T>(endpoint, { method: 'DELETE' }),
  upload: <T>(endpoint: string, formData: FormData) => {
    const token = localStorage.getItem('access_token');
    return request<T>(endpoint, {
      method: 'POST',
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
  downloadBlob,
};

export { ApiError };
