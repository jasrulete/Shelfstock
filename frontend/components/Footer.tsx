'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { auth, AUTH_CHANGED_EVENT } from '@/lib/auth';
import { User } from '@/types';

// Sitemap-style footer so every feature of the store is reachable (and
// testable) from any page. The Admin column only renders for admins - the
// backend enforces this anyway; hiding it here is just less noise for
// customers.
export default function Footer() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setUser(auth.getUser());
    const sync = () => setUser(auth.getUser());
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, sync);
  }, []);

  const linkClass = 'text-gray-500 hover:text-brand-600 hover:underline';

  return (
    <footer className="mt-12 border-t bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 text-sm sm:grid-cols-3">
        <div>
          <h3 className="mb-2 font-semibold text-gray-900">Shop</h3>
          <ul className="space-y-1.5">
            <li>
              <Link href="/" className={linkClass}>
                Browse products
              </Link>
            </li>
            <li>
              <Link href="/cart" className={linkClass}>
                Your cart
              </Link>
            </li>
            <li>
              <Link href="/checkout" className={linkClass}>
                Checkout
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-2 font-semibold text-gray-900">Account</h3>
          <ul className="space-y-1.5">
            {user ? (
              <li>
                <Link href="/orders" className={linkClass}>
                  Order history
                </Link>
              </li>
            ) : (
              <>
                <li>
                  <Link href="/login" className={linkClass}>
                    Log in
                  </Link>
                </li>
                <li>
                  <Link href="/register" className={linkClass}>
                    Create an account
                  </Link>
                </li>
              </>
            )}
          </ul>
        </div>

        {user?.role === 'admin' && (
          <div>
            <h3 className="mb-2 font-semibold text-gray-900">Admin</h3>
            <ul className="space-y-1.5">
              <li>
                <Link href="/admin/dashboard" className={linkClass}>
                  Sales dashboard
                </Link>
              </li>
              <li>
                <Link href="/admin/products" className={linkClass}>
                  Manage products
                </Link>
              </li>
              <li>
                <Link href="/admin/orders" className={linkClass}>
                  Manage orders
                </Link>
              </li>
            </ul>
          </div>
        )}
      </div>
      <div className="border-t py-4 text-center text-xs text-gray-400">
        ShelfStock — cash on delivery, shipped to your door.
      </div>
    </footer>
  );
}
