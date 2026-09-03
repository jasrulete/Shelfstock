'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import Button from '@/components/ui/Button';
import type { StockAdjustment } from '@/types';

const SOURCE_LABEL: Record<StockAdjustment['source'], string> = {
  'web-admin': 'from the admin',
  companion: 'from the companion app',
  order: 'from an order',
  cancel: 'from a cancellation',
};

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** "+5 from the companion app · 2 minutes ago" */
export function describeAdjustment(a: StockAdjustment, now = Date.now()): string {
  const signed = a.delta > 0 ? `+${a.delta}` : String(a.delta);
  return `${signed} ${SOURCE_LABEL[a.source]} · ${timeAgo(a.created_at, now)}`;
}

interface AdjustResponse {
  stock: number;
  adjustment: StockAdjustment;
}

interface Props {
  productId: number;
  productName: string;
  stock: number;
  /** Called with the new count - immediately on click, again with the server's answer. */
  onStockChange: (stock: number) => void;
}

/**
 * The stock cell of the admin table: the count, a −/+ stepper, and where the
 * number came from.
 *
 * Every press goes through POST /adjust-stock, never PUT with a computed
 * value. "Read 12, send 13" silently swallows any order that decremented the
 * same product in between; the server applies the delta under the row lock
 * and answers with its count, which replaces ours.
 *
 * Notes and emails from the ledger are rendered as text. React escapes them,
 * and nothing here uses dangerouslySetInnerHTML - keep it that way, a note is
 * admin-typed.
 */
export default function StockControl({ productId, productName, stock, onStockChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<StockAdjustment | null>(null);
  const [history, setHistory] = useState<StockAdjustment[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  async function adjust(delta: number) {
    const previous = stock;
    // Optimistic: the number moves on the click. The server's answer replaces
    // it, or the click is undone with the reason shown beside it.
    onStockChange(previous + delta);
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<AdjustResponse>(
        `/api/products/${productId}/adjust-stock`,
        { delta, source: 'web-admin' },
        { auth: true }
      );
      onStockChange(res.stock);
      setLast(res.adjustment);
      setHistory((h) => (h ? [res.adjustment, ...h].slice(0, 20) : h));
    } catch (err) {
      onStockChange(previous);
      setError(err instanceof ApiError ? err.message : 'Could not adjust stock');
    } finally {
      setBusy(false);
    }
  }

  async function toggleHistory() {
    const next = !showHistory;
    setShowHistory(next);
    if (!next || history !== null) return;
    try {
      const res = await api.get<{ adjustments: StockAdjustment[] }>(
        `/api/products/${productId}/stock-history`,
        { auth: true }
      );
      setHistory(res.adjustments);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load stock history');
      setShowHistory(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label={`Decrease stock of ${productName}`}
          disabled={busy || stock <= 0}
          onClick={() => adjust(-1)}
        >
          −
        </Button>
        <span
          className={`min-w-[3ch] text-center tabular-nums ${stock === 0 ? 'font-semibold text-red-700' : ''}`}
        >
          {stock}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label={`Increase stock of ${productName}`}
          disabled={busy}
          onClick={() => adjust(1)}
        >
          +
        </Button>
        <button
          type="button"
          onClick={toggleHistory}
          aria-expanded={showHistory}
          className="ml-1 text-xs text-gray-500 underline hover:text-gray-900"
        >
          History
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
      {last && !showHistory && <p className="text-xs text-gray-500">{describeAdjustment(last)}</p>}
      {showHistory &&
        (history === null ? (
          <p className="text-xs text-gray-500">Loading history…</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-gray-500">No changes recorded yet.</p>
        ) : (
          <ul className="space-y-0.5 text-xs text-gray-600">
            {history.map((a) => (
              <li key={a.id}>
                {describeAdjustment(a)}
                {a.note ? ` — ${a.note}` : ''}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
