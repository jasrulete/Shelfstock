import type { Metadata } from 'next';
import './globals.css';
import { CurrencyProvider } from '@/lib/currencyContext';
import NavBar from '@/components/NavBar';

export const metadata: Metadata = {
  title: 'ShelfStock',
  description: 'A small e-commerce storefront built as a portfolio project.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CurrencyProvider>
          <NavBar />
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        </CurrencyProvider>
      </body>
    </html>
  );
}
