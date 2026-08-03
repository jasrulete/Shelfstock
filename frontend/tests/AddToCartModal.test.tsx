import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// next/image needs Next's image config and loader; a plain img carries the
// same alt text, which is all these tests look at.
vi.mock('next/image', async () => {
  const { createElement } = await import('react');
  return {
    default: ({ src, alt, ...rest }: any) =>
      createElement('img', { src: typeof src === 'string' ? src : '', alt, ...rest }),
  };
});

// The real provider pulls live exchange rates over the network. Pin it to USD
// and keep the real formatMoney, so the rendered prices are still asserted
// against genuine formatting logic.
vi.mock('@/lib/currencyContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/currencyContext')>();
  return {
    ...actual,
    useCurrency: () => ({
      currency: 'USD' as const,
      setCurrency: vi.fn(),
      convert: (n: number) => n,
      isFallback: false,
      loading: false,
    }),
  };
});

const addItem = vi.fn();
vi.mock('@/hooks/useCart', () => ({
  useCart: () => ({
    items: [],
    addItem,
    updateQuantity: vi.fn(),
    removeItem: vi.fn(),
    clearCart: vi.fn(),
    subtotal: 0,
    itemCount: 0,
  }),
}));

import AddToCartModal from '../components/AddToCartModal';
import type { Product } from '@/types';

const product = (overrides: Partial<Product> = {}): Product =>
  ({
    id: 1,
    name: 'Mechanical Keyboard',
    description: 'Hot-swappable, brown switches.',
    price: '79.99',
    category: 'Electronics',
    stock: 3,
    image_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as Product;

beforeEach(() => {
  addItem.mockClear();
  document.body.style.overflow = '';
});

describe('AddToCartModal', () => {
  it('moves focus into the dialog when it opens', () => {
    render(<AddToCartModal product={product()} onClose={vi.fn()} />);

    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<AddToCartModal product={product()} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Without this, closing the modal drops focus to the top of the page and a
  // keyboard user has to tab all the way back to the product they were on.
  it('returns focus to whatever opened it', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = render(<AddToCartModal product={product()} onClose={vi.fn()} />);
    unmount();

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  // A role="dialog" that lets Tab walk out into the page behind it is the
  // failure this trap exists to prevent.
  it('wraps Tab from the last control back to the first', () => {
    render(<AddToCartModal product={product()} onClose={vi.fn()} />);

    const close = screen.getByRole('button', { name: 'Close' });
    const addButton = screen.getByRole('button', { name: /Add 1 to cart/ });

    addButton.focus();
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(document.activeElement).toBe(close);
  });

  it('wraps Shift+Tab from the first control back to the last', () => {
    render(<AddToCartModal product={product()} onClose={vi.fn()} />);

    const close = screen.getByRole('button', { name: 'Close' });
    const addButton = screen.getByRole('button', { name: /Add 1 to cart/ });

    close.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    expect(document.activeElement).toBe(addButton);
  });

  it('locks the page behind it and restores scrolling on close', () => {
    const { unmount } = render(<AddToCartModal product={product()} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('will not let the quantity climb past the stock on hand', () => {
    render(<AddToCartModal product={product({ stock: 2 })} onClose={vi.fn()} />);
    const increase = screen.getByRole('button', { name: 'Increase quantity' });

    fireEvent.click(increase); // 1 -> 2, which is all the stock there is

    expect(screen.getByRole('button', { name: /Add 2 to cart/ })).toBeInTheDocument();
    expect(increase).toBeDisabled();
  });

  it('cannot go below one', () => {
    render(<AddToCartModal product={product()} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Decrease quantity' })).toBeDisabled();
  });

  it('adds the chosen quantity and then closes', () => {
    const onClose = vi.fn();
    render(<AddToCartModal product={product({ stock: 5 })} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    fireEvent.click(screen.getByRole('button', { name: /Add 2 to cart/ }));

    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the running total for the chosen quantity', () => {
    render(<AddToCartModal product={product({ price: '79.99', stock: 5 })} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));

    expect(screen.getByRole('button', { name: /\$159\.98/ })).toBeInTheDocument();
  });

  it('closes when the backdrop is clicked but not the dialog itself', () => {
    const onClose = vi.fn();
    render(<AddToCartModal product={product()} onClose={onClose} />);

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
