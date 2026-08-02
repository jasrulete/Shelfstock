import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';
import { CurrencyProvider } from '@/lib/currencyContext';
import { CartProvider } from '@/hooks/useCart';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';

// Both are variable fonts, so no weight list is needed - next/font self-hosts
// them and exposes each as a CSS variable that tailwind.config.ts reads.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'ShelfStock',
    template: '%s | ShelfStock',
  },
  description: 'ShelfStock - an online store for electronics, books, apparel, and more.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body>
        <CurrencyProvider>
          <CartProvider>
            <div className="flex min-h-screen flex-col">
              <NavBar />
              <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
              <Footer />
            </div>
          </CartProvider>
        </CurrencyProvider>
      </body>
    </html>
  );
}
