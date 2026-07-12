'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { auth, AUTH_CHANGED_EVENT } from '@/lib/auth';
import { User } from '@/types';
import CurrencySelector from './CurrencySelector';
import { useCart } from '@/hooks/useCart';

export default function NavBar() {
  const [user, setUser] = useState<User | null>(null);
  const { itemCount } = useCart();

  useEffect(() => {
    setUser(auth.getUser());
    // Re-read the session whenever login/logout happens, so the nav
    // updates immediately instead of waiting for a full page reload.
    const sync = () => setUser(auth.getUser());
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, sync);
  }, []);

  function handleLogout() {
    auth.clearSession();
    setUser(null);
    window.location.href = '/';
  }

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold text-brand-700">
          ShelfStock
        </Link>

        <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm">
          <CurrencySelector />
          <Link href="/cart" className="relative">
            Cart
            {itemCount > 0 && (
              <span className="ml-1 rounded-full bg-brand-500 px-1.5 py-0.5 text-xs text-white">
                {itemCount}
              </span>
            )}
          </Link>

          {user ? (
            <>
              <Link href="/orders">Orders</Link>
              {user.role === 'admin' && (
                <>
                  <Link href="/admin/dashboard">Dashboard</Link>
                  <Link href="/admin/products">Products</Link>
                  <Link href="/admin/orders">Manage Orders</Link>
                  <Link href="/admin/customers">Customers</Link>
                </>
              )}
              <button onClick={handleLogout} className="text-gray-500 hover:text-gray-800">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login">Login</Link>
              <Link
                href="/register"
                className="rounded bg-brand-500 px-3 py-1.5 text-white hover:bg-brand-600"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
