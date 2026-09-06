import { beforeEach, describe, expect, it, vi } from 'vitest';

// node_modules/react is 18.3, which has no cache(). The app's server
// components run on the React 19 that Next vendors, where it does. What
// cache() does for one server render is memoise per argument, so that is what
// the stand-in does - per "request", which the tests bump between cases.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: <A, R>(fn: (arg: A) => R) => {
      const memo = new Map<string, R>();
      return (arg: A) => {
        const key = `${(globalThis as { __request?: number }).__request}:${String(arg)}`;
        if (!memo.has(key)) memo.set(key, fn(arg));
        return memo.get(key)!;
      };
    },
  };
});

vi.mock('@/server/queries/products', () => ({
  getProductById: vi.fn(async (id: number) => ({ id, name: 'Mug', price: '9.99' })),
  parseProductId: (raw: string) => (/^\d+$/.test(raw) ? Number(raw) : null),
}));

import { getProductById } from '@/server/queries/products';
import { loadProduct } from '@/app/products/[id]/loadProduct';

const get = getProductById as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  const g = globalThis as { __request?: number };
  g.__request = (g.__request ?? 0) + 1;
});

/**
 * generateMetadata and the page body both call this for the same id. Each
 * underlying read is two queries, so without the cache a product view was
 * four round trips to Neon; with it, two. This is the count the README quotes.
 */
describe('loadProduct', () => {
  it('reads a product once per request, however many times the page asks', async () => {
    const [fromMetadata, fromPage] = await Promise.all([loadProduct('6'), loadProduct('6')]);

    expect(fromMetadata).toEqual(fromPage);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('still reads different products separately', async () => {
    await loadProduct('6');
    await loadProduct('7');

    expect(get).toHaveBeenCalledTimes(2);
  });

  it('returns null for a malformed id without querying at all', async () => {
    expect(await loadProduct('abc')).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});
