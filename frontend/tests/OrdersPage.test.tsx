import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

/**
 * Customer self-cancel on /orders (roadmap Phase 3). The button is only
 * offered while an order is pending, asks first, and the card shows whatever
 * status the server answers with.
 */
const { get, post, router } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  // One stable object, like the real hook: the page's effect keys on it, and
  // a fresh object per render would refetch (and overwrite) after a cancel.
  router: { replace: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/auth', () => ({ auth: { isLoggedIn: () => true } }));
vi.mock('@/lib/api', () => ({
  api: { get, post },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

import OrdersPage from '@/app/orders/page';
import { ApiError } from '@/lib/api';

function order(id: number, status: string) {
  return {
    id,
    user_id: 2,
    total_amount: '10.00',
    currency: 'USD',
    status,
    payment_method: 'cod',
    shipping_name: null,
    shipping_phone: null,
    shipping_address: null,
    shipping_city: null,
    created_at: '2026-09-01T00:00:00.000Z',
    items: [
      { id: id * 10, product_id: 7, product_name: 'Mug', quantity: 1, price_at_purchase: '10.00' },
    ],
  };
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockResolvedValue([order(5, 'pending'), order(6, 'shipped')]);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('offers "Cancel order" only while an order is pending', async () => {
  render(<OrdersPage />);

  await screen.findByText('Order #5');
  expect(screen.getByRole('button', { name: 'Cancel order #5' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Cancel order #6' })).toBeNull();
});

it('asks first, posts the cancel, and shows the status the server answers with', async () => {
  vi.stubGlobal('confirm', vi.fn(() => true));
  post.mockResolvedValue({ ...order(5, 'cancelled'), allowed_transitions: [] });
  render(<OrdersPage />);

  fireEvent.click(await screen.findByRole('button', { name: 'Cancel order #5' }));

  expect(await screen.findByText('cancelled')).toBeTruthy();
  expect(post).toHaveBeenCalledWith('/api/orders/5/cancel', undefined, { auth: true });
  expect(screen.queryByText('pending')).toBeNull();
  expect(screen.queryByRole('button', { name: /Cancel/ })).toBeNull();
});

it('does nothing when the customer declines the confirmation', async () => {
  vi.stubGlobal('confirm', vi.fn(() => false));
  render(<OrdersPage />);

  fireEvent.click(await screen.findByRole('button', { name: 'Cancel order #5' }));

  expect(post).not.toHaveBeenCalled();
  expect(screen.getByText('pending')).toBeTruthy();
});

it("shows the server's refusal inline and leaves the order as it was", async () => {
  vi.stubGlobal('confirm', vi.fn(() => true));
  post.mockRejectedValue(
    new ApiError('Only a pending order can be cancelled; this one is shipped', 409)
  );
  render(<OrdersPage />);

  fireEvent.click(await screen.findByRole('button', { name: 'Cancel order #5' }));

  expect((await screen.findByRole('alert')).textContent).toMatch(/Only a pending order/);
  expect(screen.getByText('Order #5')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cancel order #5' })).toBeTruthy();
});
