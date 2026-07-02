'use client';

import { useEffect, useState } from 'react';
import { CurrencyCode } from '@/types';

const RATES_CACHE_KEY = 'shelfstock_rates_cache';
const TTL_MS = 30 * 60 * 1000; // 30 minutes

const API_URL =
  process.env.NEXT_PUBLIC_EXCHANGE_RATE_API ?? 'https://api.frankfurter.app/latest?from=USD';

interface RatesCache {
  fetchedAt: number;
  rates: Record<CurrencyCode, number>;
}

const FALLBACK_RATES: Record<CurrencyCode, number> = { USD: 1, PHP: 58, EUR: 0.92 };

/**
 * Fetches USD-based exchange rates once, then caches them in localStorage
 * for TTL_MS. Free exchange rate APIs (like frankfurter.app) rate-limit or
 * throttle aggressively, and rates don't meaningfully change minute to
 * minute, so re-fetching on every page load/render would be wasteful and
 * fragile. If the fetch fails for any reason, we fall back to a fixed
 * base-currency rate table so prices still render (with a stale-data
 * warning) instead of breaking the page.
 */
export function useExchangeRates() {
  const [rates, setRates] = useState<Record<CurrencyCode, number>>(FALLBACK_RATES);
  const [isFallback, setIsFallback] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cachedRaw = localStorage.getItem(RATES_CACHE_KEY);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as RatesCache;
        if (Date.now() - cached.fetchedAt < TTL_MS) {
          setRates(cached.rates);
          setLoading(false);
          return;
        }
      } catch {
        // ignore malformed cache and re-fetch below
      }
    }

    fetch(API_URL)
      .then((res) => {
        if (!res.ok) throw new Error('Exchange rate API request failed');
        return res.json();
      })
      .then((json: { rates: Record<string, number> }) => {
        const nextRates: Record<CurrencyCode, number> = {
          USD: 1,
          PHP: json.rates.PHP ?? FALLBACK_RATES.PHP,
          EUR: json.rates.EUR ?? FALLBACK_RATES.EUR,
        };
        setRates(nextRates);
        setIsFallback(false);
        localStorage.setItem(
          RATES_CACHE_KEY,
          JSON.stringify({ fetchedAt: Date.now(), rates: nextRates })
        );
      })
      .catch(() => {
        // Graceful degradation: keep the app usable with approximate rates
        // rather than blocking the page on a third-party API being down.
        setRates(FALLBACK_RATES);
        setIsFallback(true);
      })
      .finally(() => setLoading(false));
  }, []);

  function convert(amountUsd: number, currency: CurrencyCode): number {
    return amountUsd * (rates[currency] ?? 1);
  }

  return { rates, convert, loading, isFallback };
}
