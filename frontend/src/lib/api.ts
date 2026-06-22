const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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

  // FormData 不能手动设 Content-Type，让浏览器自动设置 boundary
  // 无 body 时不设 Content-Type（避免不必要的 CORS preflight）
  const isFormData = options.body instanceof FormData;
  const hasBody = options.body != null;
  const headers: Record<string, string> = {
    ...(isFormData || !hasBody ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  // 204 No Content 无响应体
  if (res.status === 204) {
    return undefined as unknown as T;
  }

  const json = await res.json();

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    // 兼容 FastAPI 验证错误（detail 是数组）和普通错误
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

  // 兼容两种响应格式：统一格式 {code, data, message} 或直接返回数据
  if (json.code !== undefined) {
    if (json.code !== 0) {
      throw new ApiError(json.message || 'Request failed', json.code);
    }
    return json.data as T;
  }

  // 没有 code 字段时，整个响应体就是 data
  return json as T;
}

async function downloadBlob(endpoint: string): Promise<{ blob: Blob; filename: string }> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const res = await fetch(`${API_BASE}${endpoint}`, {
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
  const match = disposition.match(/filename="?(.+?)"?$/);
  const filename = match ? match[1] : 'download';
  const blob = await res.blob();
  return { blob, filename };
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, data?: any) => {
    // 如果 data 是 ArrayBuffer 或 Uint8Array，作为二进制发送
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
