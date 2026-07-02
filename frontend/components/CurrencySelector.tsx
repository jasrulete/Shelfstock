'use client';

import { useCurrency } from '@/lib/currencyContext';
import { CurrencyCode } from '@/types';

const CURRENCIES: CurrencyCode[] = ['USD', 'PHP', 'EUR'];

export default function CurrencySelector() {
  const { currency, setCurrency, isFallback } = useCurrency();

  return (
    <div className="flex items-center gap-1">
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
        className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
        aria-label="Select currency"
      >
        {CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {isFallback && (
        <span title="Live rates unavailable - showing approximate rates" className="text-amber-500">
          ⚠
        </span>
      )}
    </div>
  );
}
