import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The provider renders a "View cart" toast containing a next/link, which needs
// the App Router context. A plain anchor is enough for these tests, which are
// about cart state rather than navigation.
vi.mock('next/link', async () => {
  const { createElement } = await import('react');
  return {
    default: ({ href, children, ...rest }: any) =>
      createElement('a', { href, ...rest }, children),
  };
});

import { CartProvider, useCart } from '../hooks/useCart';
import type { Product } from '@/types';

const CART_KEY = 'shelfstock_cart';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    name: 'Mechanical Keyboard',
    description: 'Hot-swappable, brown switches.',
    price: '79.99',
    category: 'Electronics',
    stock: 3,
    image_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Product;
}

function setup() {
  return renderHook(() => useCart(), { wrapper: CartProvider });
}

beforeEach(() => {
  localStorage.clear();
});

describe('useCart', () => {
  it('starts from whatever the last visit left in localStorage', () => {
    localStorage.setItem(CART_KEY, JSON.stringify([{ product: product(), quantity: 2 }]));

    const { result } = setup();

    expect(result.current.items).toHaveLength(1);
    expect(result.current.itemCount).toBe(2);
  });

  it('survives a corrupted cart in localStorage instead of crashing', () => {
    localStorage.setItem(CART_KEY, 'not json');

    const { result } = setup();

    expect(result.current.items).toEqual([]);
  });

  // The backend re-checks stock at checkout under a row lock, so this is a UX
  // guard - but without it the cart happily asks for more than exists and the
  // shopper only finds out at the very last step.
  it('refuses to add more than the stock it last saw', () => {
    const { result } = setup();

    act(() => result.current.addItem(product({ stock: 3 }), 10));

    expect(result.current.items[0].quantity).toBe(3);
  });

  it('accumulates repeat adds of the same product, still capped at stock', () => {
    const { result } = setup();

    act(() => result.current.addItem(product({ stock: 3 }), 2));
    act(() => result.current.addItem(product({ stock: 3 }), 2));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(3);
  });

  it('caps updateQuantity at stock too, not just adds', () => {
    const { result } = setup();
    act(() => result.current.addItem(product({ stock: 3 }), 1));

    act(() => result.current.updateQuantity(1, 99));

    expect(result.current.items[0].quantity).toBe(3);
  });

  // Dropping to zero in the quantity box is how a shopper removes something;
  // leaving a zero-quantity row behind would put "0 x Keyboard" in the cart.
  it('removes the line when its quantity drops to zero', () => {
    const { result } = setup();
    act(() => result.current.addItem(product(), 2));

    act(() => result.current.updateQuantity(1, 0));

    expect(result.current.items).toEqual([]);
  });

  it('writes every change through to localStorage', () => {
    const { result } = setup();

    act(() => result.current.addItem(product({ stock: 10 }), 2));

    const stored = JSON.parse(localStorage.getItem(CART_KEY)!);
    expect(stored).toHaveLength(1);
    expect(stored[0].quantity).toBe(2);
  });

  it('picks up a cart change made in another tab', () => {
    const { result } = setup();
    expect(result.current.items).toEqual([]);

    // Another tab writes the cart, then the browser notifies this one.
    localStorage.setItem(CART_KEY, JSON.stringify([{ product: product(), quantity: 2 }]));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: CART_KEY }));
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.itemCount).toBe(2);
  });

  it('ignores storage events for unrelated keys', () => {
    const { result } = setup();
    localStorage.setItem(CART_KEY, JSON.stringify([{ product: product(), quantity: 2 }]));

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'something_else' }));
    });

    expect(result.current.items).toEqual([]);
  });

  it('totals the cart in the currency orders are placed in', () => {
    const { result } = setup();

    act(() => result.current.addItem(product({ id: 1, price: '79.99', stock: 10 }), 2));
    act(() => result.current.addItem(product({ id: 2, price: '10.00', stock: 10 }), 1));

    expect(result.current.subtotal).toBeCloseTo(169.98, 2);
    expect(result.current.itemCount).toBe(3);
  });

  it('clearCart empties both the state and the stored copy', () => {
    const { result } = setup();
    act(() => result.current.addItem(product(), 1));

    act(() => result.current.clearCart());

    expect(result.current.items).toEqual([]);
    expect(JSON.parse(localStorage.getItem(CART_KEY)!)).toEqual([]);
  });
});
