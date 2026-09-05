'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { Product, ProductsResponse } from '@/types';
import Pagination from '@/components/Pagination';
import StockControl from '@/components/admin/StockControl';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Field';

interface ProductForm {
  name: string;
  description: string;
  price: string;
  category: string;
  stock: string;
  image_url: string;
  /** Extra gallery images, one URL per line. */
  images: string;
}

const emptyForm: ProductForm = {
  name: '',
  description: '',
  price: '',
  category: '',
  stock: '0',
  image_url: '',
  images: '',
};

export default function AdminProductsPage() {
  const router = useRouter();
  const [data, setData] = useState<ProductsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  /**
   * Whether the gallery for the product being edited has actually arrived.
   *
   * The form seeds `images: ''` and fills it from a later fetch, while the
   * submit payload sends `images: []` for a blank field - and the API
   * documents `[]` as "clear the gallery". So saving before the fetch landed,
   * or after it failed, silently deleted every gallery row. False here means
   * the key is omitted from the payload entirely, which leaves the gallery
   * untouched.
   */
  const [galleryLoaded, setGalleryLoaded] = useState(false);
  const [galleryError, setGalleryError] = useState(false);

  const loadProducts = useCallback(() => {
    api
      // auth: true so the admin projection - which includes barcode - comes back.
      .get<ProductsResponse>(`/api/products?page=${page}&limit=20&sort=created_at&order=desc`, {
        auth: true,
      })
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }, [page]);

  useEffect(() => {
    const user = auth.getUser();
    // Client-side gate for a snappy redirect - the adminOnly middleware on
    // the backend is what actually protects the data.
    if (!user) {
      router.replace('/login?next=/admin/products');
      return;
    }
    if (user.role !== 'admin') {
      router.replace('/');
      return;
    }
    loadProducts();
  }, [router, loadProducts]);

  function patchForm(patch: Partial<ProductForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  /**
   * A stepper press changed this product's count. Reflect it in the table,
   * and in the edit form if that product is open there - otherwise saving the
   * form would PUT the stale number back and quietly undo the press.
   */
  function patchProductStock(id: number, stock: number) {
    setData(
      (prev) =>
        prev && { ...prev, products: prev.products.map((p) => (p.id === id ? { ...p, stock } : p)) }
    );
    if (editingId === id) {
      setForm((prev) => ({ ...prev, stock: String(stock) }));
    }
  }

  /** Gives a product the store's own EAN-13 (see /admin/barcodes). Never overwrites. */
  async function assignBarcode(product: Product) {
    setError(null);
    try {
      const updated = await api.post<Product>(`/api/products/${product.id}/assign-barcode`, undefined, {
        auth: true,
      });
      setData(
        (prev) =>
          prev && {
            ...prev,
            products: prev.products.map((p) => (p.id === product.id ? { ...p, barcode: updated.barcode } : p)),
          }
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to assign a barcode');
    }
  }

  function loadGallery(productId: number) {
    setGalleryLoaded(false);
    setGalleryError(false);

    // Only the detail endpoint returns the gallery. Fetched after the form is
    // populated so editing stays instant, and dropped if the admin has already
    // moved on to a different product by the time it lands - otherwise a slow
    // response could overwrite whatever they are editing now.
    api
      .get<Product>(`/api/products/${productId}`)
      .then((full) => {
        const extras = (full.images ?? []).filter((url) => url !== full.image_url);
        setEditingId((current) => {
          if (current === productId) {
            setForm((prev) => ({ ...prev, images: extras.join('\n') }));
            setGalleryLoaded(true);
          }
          return current;
        });
      })
      .catch(() => {
        // Surfaced rather than swallowed: the admin needs to know the gallery
        // field is not showing the truth, because saving over it would have
        // wiped the gallery before this guard existed.
        setEditingId((current) => {
          if (current === productId) setGalleryError(true);
          return current;
        });
      });
  }

  function startEdit(product: Product) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      description: product.description ?? '',
      price: product.price,
      category: product.category,
      stock: String(product.stock),
      image_url: product.image_url ?? '',
      // The listing payload has no gallery; it is loaded per product on edit.
      images: '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });

    loadGallery(product.id);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setGalleryLoaded(false);
    setGalleryError(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const isEditing = editingId !== null;

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: Number(form.price),
      category: form.category.trim(),
      stock: Number(form.stock),
      image_url: form.image_url.trim() || null,
      // One URL per line. Sent as [] when blank, which clears the gallery;
      // omitting the key entirely instead leaves it untouched - which is what
      // an edit whose gallery never loaded must do, or saving the form wipes
      // every gallery row. A new product has no gallery to protect, so it
      // always sends the key.
      ...(!isEditing || galleryLoaded
        ? {
            images: form.images
              .split(/\r?\n/)
              .map((u) => u.trim())
              .filter(Boolean),
          }
        : {}),
    };

    try {
      if (editingId !== null) {
        await api.put(`/api/products/${editingId}`, payload, { auth: true });
      } else {
        await api.post('/api/products', payload, { auth: true });
      }
      cancelEdit();
      loadProducts();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save product');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(product: Product) {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await api.delete(`/api/products/${product.id}`, { auth: true });
      loadProducts();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete product');
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Manage Products</h1>

      <Card className="p-4">
        <form onSubmit={handleSubmit}>
          <h2 className="mb-3 font-semibold">
            {editingId !== null ? `Edit product #${editingId}` : 'Add a new product'}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Name"
              required
              maxLength={255}
              value={form.name}
              onChange={(e) => patchForm({ name: e.target.value })}
            />
            <Input
              label="Category"
              required
              maxLength={100}
              hint="New categories appear in the storefront filter automatically."
              value={form.category}
              onChange={(e) => patchForm({ category: e.target.value })}
            />
            <Input
              label="Price (USD)"
              type="number"
              required
              min={0}
              step="0.01"
              value={form.price}
              onChange={(e) => patchForm({ price: e.target.value })}
            />
            <Input
              label="Stock"
              type="number"
              required
              min={0}
              step={1}
              value={form.stock}
              onChange={(e) => patchForm({ stock: e.target.value })}
            />
            <div className="sm:col-span-2">
              <Input
                label="Cover image URL"
                type="url"
                placeholder="https://..."
                hint="Shown on cards, in the cart and as the first gallery image."
                value={form.image_url}
                onChange={(e) => patchForm({ image_url: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Textarea
                label="More images"
                rows={2}
                placeholder={'https://...\nhttps://...'}
                hint="One URL per line, up to 8. These appear as extra angles on the product page. Hosts must be allowlisted in next.config.js."
                value={form.images}
                onChange={(e) => patchForm({ images: e.target.value })}
                disabled={editingId !== null && !galleryLoaded}
              />
              {editingId !== null && !galleryLoaded && (
                <p className="mt-1 text-sm text-gray-500" role="status">
                  {galleryError ? (
                    <>
                      Couldn&apos;t load this product&apos;s gallery, so it won&apos;t be changed
                      when you save.{' '}
                      <button
                        type="button"
                        onClick={() => loadGallery(editingId)}
                        className="underline hover:no-underline"
                      >
                        Try again
                      </button>
                    </>
                  ) : (
                    'Loading the current gallery…'
                  )}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <Textarea
                label="Description"
                rows={2}
                value={form.description}
                onChange={(e) => patchForm({ description: e.target.value })}
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : editingId !== null ? 'Save changes' : 'Add product'}
            </Button>
            {editingId !== null && (
              <Button type="button" variant="secondary" onClick={cancelEdit}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      {!data ? (
        <p className="text-gray-500">Loading products...</p>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  <th className="p-2 font-medium text-gray-600">Name</th>
                  <th className="p-2 font-medium text-gray-600">Category</th>
                  <th className="p-2 font-medium text-gray-600">Price</th>
                  <th className="p-2 font-medium text-gray-600">Stock</th>
                  <th className="p-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((product) => (
                  <tr key={product.id} className="border-b border-gray-200 last:border-0">
                    <td className="p-2">
                      <div>{product.name}</div>
                      {product.barcode ? (
                        <div className="font-mono text-xs text-gray-500">{product.barcode}</div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => assignBarcode(product)}
                          className="text-xs text-gray-500 underline hover:text-gray-900"
                        >
                          Assign barcode
                          <span className="sr-only"> to {product.name}</span>
                        </button>
                      )}
                    </td>
                    <td className="p-2">{product.category}</td>
                    <td className="p-2">${Number(product.price).toFixed(2)}</td>
                    <td className="p-2">
                      <StockControl
                        productId={product.id}
                        productName={product.name}
                        stock={product.stock}
                        onStockChange={(stock) => patchProductStock(product.id, stock)}
                      />
                    </td>
                    <td className="p-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(product)}>
                          Edit
                          <span className="sr-only"> {product.name}</span>
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => handleDelete(product)}>
                          Delete
                          <span className="sr-only"> {product.name}</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>
          <Pagination pagination={data.pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
