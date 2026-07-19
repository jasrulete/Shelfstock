'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { CurrencyCode } from '@/types';
import { useExchangeRates } from '@/hooks/useExchangeRates';

const STORAGE_KEY = 'shelfstock_currency';
const CURRENCIES: CurrencyCode[] = ['USD', 'PHP', 'EUR'];

interface CurrencyContextValue {
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  convert: (amountUsd: number) => number;
  isFallback: boolean;
  loading: boolean;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const SYMBOLS: Record<CurrencyCode, string> = { USD: '$', PHP: '₱', EUR: '€' };

export function CurrencyProvider({ children }: { children: ReactNode }) {
  // Start at USD so the server-rendered markup matches the first client render
  // (no hydration mismatch); restore the saved choice right after mount.
  const [currency, setCurrencyState] = useState<CurrencyCode>('USD');
  const { convert: baseConvert, isFallback, loading } = useExchangeRates();

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as CurrencyCode | null;
    if (saved && CURRENCIES.includes(saved)) setCurrencyState(saved);
  }, []);

  const setCurrency = (c: CurrencyCode) => {
    setCurrencyState(c);
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {
      /* storage unavailable (private mode) — currency just won't persist */
    }
  };

  const convert = (amountUsd: number) => baseConvert(amountUsd, currency);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, convert, isFallback, loading }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}

export function formatMoney(amount: number, currency: CurrencyCode): string {
  return `${SYMBOLS[currency]}${amount.toFixed(2)}`;
}
