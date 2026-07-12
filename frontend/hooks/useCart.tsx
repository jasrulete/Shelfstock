'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
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

// A quantity can never exceed the stock we last saw for the product. The
// backend re-checks stock at checkout (with row locking), so this is a UX
// guard, not the enforcement layer.
function clampToStock(quantity: number, product: Product): number {
  return Math.min(quantity, product.stock);
}

interface CartContextValue {
  items: CartItem[];
  addItem: (product: Product, quantity?: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  removeItem: (productId: number) => void;
  clearCart: () => void;
  subtotal: number;
  itemCount: number;
}

const CartContext = createContext<CartContextValue | null>(null);

// Cart lives in localStorage rather than the DB - it's ephemeral, per
// device, and doesn't need to survive a server restart or be queried.
// It only becomes a real `orders` row at checkout time.
//
// State is held in a single Provider (not per-useCart-call) so every
// consumer - the NavBar badge, the cart page, product cards - sees the
// same cart and re-renders together when it changes.
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(loadCart());

    // Keep the cart in sync across browser tabs.
    function onStorage(e: StorageEvent) {
      if (e.key === CART_KEY) setItems(loadCart());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addItem = useCallback((product: Product, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      const next = existing
        ? prev.map((i) =>
            i.product.id === product.id
              ? { ...i, product, quantity: clampToStock(i.quantity + quantity, product) }
              : i
          )
        : [...prev, { product, quantity: clampToStock(quantity, product) }];
      saveCart(next);
      return next;
    });
  }, []);

  const updateQuantity = useCallback((productId: number, quantity: number) => {
    setItems((prev) => {
      const next =
        quantity <= 0
          ? prev.filter((i) => i.product.id !== productId)
          : prev.map((i) =>
              i.product.id === productId
                ? { ...i, quantity: clampToStock(quantity, i.product) }
                : i
            );
      saveCart(next);
      return next;
    });
  }, []);

  const removeItem = useCallback((productId: number) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.product.id !== productId);
      saveCart(next);
      return next;
    });
  }, []);

  const clearCart = useCallback(() => {
    saveCart([]);
    setItems([]);
  }, []);

  const subtotal = items.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, updateQuantity, removeItem, clearCart, subtotal, itemCount }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
