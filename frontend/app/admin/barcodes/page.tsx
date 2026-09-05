'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { Product, ProductsResponse } from '@/types';
import Barcode from '@/components/admin/Barcode';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

/**
 * A printable sheet of every product's barcode, so the companion's scanner
 * can be demonstrated - and used - without physical stock in hand.
 * Roadmap 3.4.
 *
 * Codes are the store's own EAN-13s (GS1 prefix 200, the internal-use range)
 * derived from each product's id by POST /assign-barcode. "Assign" here calls
 * that for any product still without one; it never overwrites a code that
 * came from real packaging.
 */
export default function AdminBarcodesPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    // auth: true is what makes barcode appear on the list at all (INV-8).
    api
      .get<ProductsResponse>('/api/products?limit=100&sort=name&order=asc', { auth: true })
      .then((res) => setProducts(res.products))
      .catch((err: ApiError) => setError(err.message));
  }, []);

  useEffect(() => {
    const user = auth.getUser();
    if (!user) {
      router.replace('/login?next=/admin/barcodes');
      return;
    }
    if (user.role !== 'admin') {
      router.replace('/');
      return;
    }
    load();
  }, [router, load]);

  async function assign(targets: Product[]) {
    setBusy(true);
    setError(null);
    try {
      for (const product of targets) {
        const updated = await api.post<Product>(`/api/products/${product.id}/assign-barcode`, undefined, {
          auth: true,
        });
        setProducts(
          (prev) => prev && prev.map((p) => (p.id === product.id ? { ...p, barcode: updated.barcode } : p))
        );
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not assign a barcode');
    } finally {
      setBusy(false);
    }
  }

  const withCode = products?.filter((p) => p.barcode) ?? [];
  const unassigned = products?.filter((p) => !p.barcode) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Barcode sheet</h1>
          <p className="mt-1 max-w-prose text-sm text-gray-500">
            Print this page and scan any card with the companion app. The codes are the store&apos;s
            own — GS1&apos;s internal-use prefix, so they can never collide with a real product&apos;s.
          </p>
        </div>
        <div className="flex gap-2">
          {unassigned.length > 0 && (
            <Button variant="secondary" disabled={busy} onClick={() => assign(unassigned)}>
              Assign {unassigned.length} missing
            </Button>
          )}
          <Button disabled={withCode.length === 0} onClick={() => window.print()}>
            Print sheet
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700 print:hidden">
          {error}
        </p>
      )}

      {!products ? (
        <p className="text-gray-500">Loading products…</p>
      ) : (
        <>
          {unassigned.length > 0 && (
            <Card className="p-4 print:hidden">
              <h2 className="mb-2 font-semibold">Without a barcode</h2>
              <ul className="divide-y divide-gray-200">
                {unassigned.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-1.5">
                    <span>{p.name}</span>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => assign([p])}>
                      Assign
                      <span className="sr-only"> a barcode to {p.name}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {withCode.length === 0 ? (
            <p className="text-gray-500">No product has a barcode yet.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 print:gap-6">
              {withCode.map((p) => (
                <Card key={p.id} className="flex break-inside-avoid flex-col items-center gap-2 p-4">
                  <p className="text-center text-sm font-medium">{p.name}</p>
                  <Barcode code={p.barcode!} />
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
