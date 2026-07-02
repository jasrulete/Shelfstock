import { User } from '@/types';

const TOKEN_KEY = 'shelfstock_token';
const USER_KEY = 'shelfstock_user';

// Simple localStorage-backed auth. Good enough for a portfolio project;
// a production app would likely move the token into an httpOnly cookie
// to reduce XSS exposure.
export const auth = {
  saveSession(token: string, user: User) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  },
  getUser(): User | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  },
  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  isLoggedIn(): boolean {
    return this.getToken() !== null;
  },
};
