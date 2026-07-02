'use client';

import { useCallback, useEffect, useState } from 'react';
import { CartItem, Product } from '@/types';

const CART_KEY = 'shelfstock_cart';

function loadCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

// Cart lives in localStorage rather than the DB - it's ephemeral, per
// device, and doesn't need to survive a server restart or be queried.
// It only becomes a real `orders` row at checkout time.
export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(loadCart());
  }, []);

  const persist = useCallback((next: CartItem[]) => {
    setItems(next);
    saveCart(next);
  }, []);

  const addItem = useCallback(
    (product: Product, quantity = 1) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.product.id === product.id);
        const next = existing
          ? prev.map((i) =>
              i.product.id === product.id ? { ...i, quantity: i.quantity + quantity } : i
            )
          : [...prev, { product, quantity }];
        saveCart(next);
        return next;
      });
    },
    []
  );

  const updateQuantity = useCallback(
    (productId: number, quantity: number) => {
      setItems((prev) => {
        const next =
          quantity <= 0
            ? prev.filter((i) => i.product.id !== productId)
            : prev.map((i) => (i.product.id === productId ? { ...i, quantity } : i));
        saveCart(next);
        return next;
      });
    },
    []
  );

  const removeItem = useCallback((productId: number) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.product.id !== productId);
      saveCart(next);
      return next;
    });
  }, []);

  const clearCart = useCallback(() => persist([]), [persist]);

  const subtotal = items.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return { items, addItem, updateQuantity, removeItem, clearCart, subtotal, itemCount };
}
