import { User } from '@/types';

const TOKEN_KEY = 'shelfstock_token';
const USER_KEY = 'shelfstock_user';

// Fired whenever the session changes so components that render auth state
// (e.g. the NavBar) can update without a full page reload.
export const AUTH_CHANGED_EVENT = 'shelfstock-auth-changed';

function notifyAuthChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  }
}

// Simple localStorage-backed auth. Good enough for a portfolio project;
// a production app would likely move the token into an httpOnly cookie
// to reduce XSS exposure.
export const auth = {
  saveSession(token: string, user: User) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    notifyAuthChanged();
  },
  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  },
  getUser(): User | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(USER_KEY);
    try {
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  },
  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    notifyAuthChanged();
  },
  isLoggedIn(): boolean {
    return this.getToken() !== null;
  },
};
