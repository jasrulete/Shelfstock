const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
  delete: <T>(path: string, options?: RequestInit & { auth?: boolean }) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

export { ApiError };
