'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { CurrencyCode } from '@/types';
import { useExchangeRates } from '@/hooks/useExchangeRates';

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
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const { convert: baseConvert, isFallback, loading } = useExchangeRates();

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
