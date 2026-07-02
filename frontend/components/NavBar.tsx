'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { auth } from '@/lib/auth';
import { User } from '@/types';
import CurrencySelector from './CurrencySelector';
import { useCart } from '@/hooks/useCart';

export default function NavBar() {
  const [user, setUser] = useState<User | null>(null);
  const { itemCount } = useCart();

  useEffect(() => {
    setUser(auth.getUser());
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

        <nav className="flex items-center gap-4 text-sm">
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
              {user.role === 'admin' && <Link href="/admin/dashboard">Dashboard</Link>}
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
