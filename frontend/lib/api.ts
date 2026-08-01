import { auth as authStore } from '@/lib/auth';

/**
 * The API is served from this same deployment (pages/api/[...path].ts), so
 * requests are same-origin and relative. There is deliberately no
 * NEXT_PUBLIC_API_URL any more: baking an absolute backend host into the
 * bundle at build time is what left the storefront pointing at a dead server
 * when the old backend went away.
 */
const API_URL = '';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Thin fetch wrapper: builds the full URL, attaches the JWT if present,
 * parses JSON, and throws a typed ApiError on non-2xx so callers can
 * `catch` instead of manually checking res.ok everywhere.
 */
async function request<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const { auth = false, headers, ...rest } = options;

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  if (auth) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('shelfstock_token') : null;
    if (token) {
      finalHeaders.Authorization = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${API_URL}${path}`, { ...rest, headers: finalHeaders });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      // response wasn't JSON - keep statusText
    }
    // An authenticated request rejected with 401 means the stored token is
    // expired or invalid - clear it so the UI stops pretending we're
    // logged in and the next protected page redirects to /login.
    if (res.status === 401 && auth && typeof window !== 'undefined') {
      authStore.clearSession();
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, options?: RequestInit & { auth?: boolean }) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestInit & { auth?: boolean }) =>
    request<T>(path, { ...options, method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown, options?: RequestInit & { auth?: boolean }) =>
    request<T>(path, { ...options, method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown, options?: RequestInit & { auth?: boolean }) =>
    request<T>(path, { ...options, method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, options?: RequestInit & { auth?: boolean }) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

export { ApiError };
