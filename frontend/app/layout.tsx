import type { Metadata } from 'next';
import './globals.css';
import { CurrencyProvider } from '@/lib/currencyContext';
import { CartProvider } from '@/hooks/useCart';
import NavBar from '@/components/NavBar';

export const metadata: Metadata = {
  title: {
    default: 'ShelfStock',
    template: '%s | ShelfStock',
  },
  description: 'ShelfStock - an online store for electronics, books, apparel, and more.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CurrencyProvider>
          <CartProvider>
            <NavBar />
            <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
          </CartProvider>
        </CurrencyProvider>
      </body>
    </html>
  );
}
