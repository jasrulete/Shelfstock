import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/lib/api', () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return { api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, ApiError };
});

import { api, ApiError } from '@/lib/api';
import StockControl, { timeAgo } from '@/components/admin/StockControl';
import type { StockAdjustment } from '@/types';

const post = api.post as unknown as ReturnType<typeof vi.fn>;
const get = api.get as unknown as ReturnType<typeof vi.fn>;

const adjustment = (over: Partial<StockAdjustment> = {}): StockAdjustment => ({
  id: 1,
  delta: 1,
  new_stock: 13,
  source: 'web-admin',
  note: null,
  created_at: new Date().toISOString(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * The web stepper has the same contract as the companion's: move by delta
 * through /adjust-stock, show the number moving immediately, and be honest
 * when the server refuses.
 */
describe('StockControl', () => {
  it('bumps the parent on the click, posts a web-admin +1, and shows where the number came from', async () => {
    let resolve!: (value: unknown) => void;
    post.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      })
    );
    const onStockChange = vi.fn();
    render(<StockControl productId={1} productName="Mug" stock={12} onStockChange={onStockChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Increase stock of Mug' }));

    // Before the server has answered.
    expect(onStockChange).toHaveBeenCalledWith(13);
    expect(post).toHaveBeenCalledWith(
      '/api/products/1/adjust-stock',
      { delta: 1, source: 'web-admin' },
      { auth: true }
    );

    resolve({ stock: 13, adjustment: adjustment() });
    expect(await screen.findByText('+1 from the admin · just now')).toBeInTheDocument();
    expect(onStockChange).toHaveBeenLastCalledWith(13);
  });

  it("puts the number back and shows the server's reason when refused", async () => {
    post.mockRejectedValueOnce(new ApiError('Only 1 in stock; cannot remove 2', 409));
    const onStockChange = vi.fn();
    render(<StockControl productId={1} productName="Mug" stock={1} onStockChange={onStockChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Decrease stock of Mug' }));
    expect(onStockChange).toHaveBeenCalledWith(0);

    expect(await screen.findByRole('alert')).toHaveTextContent('Only 1 in stock; cannot remove 2');
    expect(onStockChange).toHaveBeenLastCalledWith(1);
  });

  it('disables decrease at zero and leaves increase available', () => {
    render(<StockControl productId={1} productName="Mug" stock={0} onStockChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Decrease stock of Mug' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Increase stock of Mug' })).toBeEnabled();
  });

  it('loads the ledger once when History is opened, and renders notes as text', async () => {
    get.mockResolvedValueOnce({
      adjustments: [
        adjustment({
          id: 5,
          delta: -2,
          source: 'order',
          note: 'Order #40 <b>x</b>',
          created_at: new Date(Date.now() - 120_000).toISOString(),
        }),
      ],
    });
    render(<StockControl productId={1} productName="Mug" stock={3} onStockChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(get).toHaveBeenCalledWith('/api/products/1/stock-history', { auth: true });

    const row = await screen.findByText('-2 from an order · 2 minutes ago — Order #40 <b>x</b>');
    // Admin-typed note, rendered as text: no element was created from it.
    expect(row.querySelector('b')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('timeAgo', () => {
  const now = Date.parse('2026-09-03T12:00:00Z');

  it.each([
    ['2026-09-03T11:59:50Z', 'just now'],
    ['2026-09-03T11:59:00Z', '1 minute ago'],
    ['2026-09-03T11:58:00Z', '2 minutes ago'],
    ['2026-09-03T09:00:00Z', '3 hours ago'],
    ['2026-09-01T12:00:00Z', '2 days ago'],
  ])('%s -> %s', (iso, expected) => {
    expect(timeAgo(iso, now)).toBe(expected);
  });

  it('is empty for an unparseable timestamp rather than "NaN days ago"', () => {
    expect(timeAgo('not a date', now)).toBe('');
  });
});
