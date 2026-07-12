'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { Product, ProductsResponse } from '@/types';
import Pagination from '@/components/Pagination';

interface ProductForm {
  name: string;
  description: string;
  price: string;
  category: string;
  stock: string;
  image_url: string;
}

const emptyForm: ProductForm = {
  name: '',
  description: '',
  price: '',
  category: '',
  stock: '0',
  image_url: '',
};

export default function AdminProductsPage() {
  const router = useRouter();
  const [data, setData] = useState<ProductsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const loadProducts = useCallback(() => {
    api
      .get<ProductsResponse>(`/api/products?page=${page}&limit=20&sort=created_at&order=desc`)
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

  function startEdit(product: Product) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      description: product.description ?? '',
      price: product.price,
      category: product.category,
      stock: String(product.stock),
      image_url: product.image_url ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: Number(form.price),
      category: form.category.trim(),
      stock: Number(form.stock),
      image_url: form.image_url.trim() || null,
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

  const inputClass = 'w-full rounded border border-gray-300 px-3 py-2 text-sm';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Manage Products</h1>

      <form onSubmit={handleSubmit} className="rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">
          {editingId !== null ? `Edit product #${editingId}` : 'Add a new product'}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            required
            maxLength={255}
            placeholder="Name"
            value={form.name}
            onChange={(e) => patchForm({ name: e.target.value })}
            className={inputClass}
          />
          <input
            required
            maxLength={100}
            placeholder="Category"
            value={form.category}
            onChange={(e) => patchForm({ category: e.target.value })}
            className={inputClass}
          />
          <input
            required
            type="number"
            min={0}
            step="0.01"
            placeholder="Price (USD)"
            value={form.price}
            onChange={(e) => patchForm({ price: e.target.value })}
            className={inputClass}
          />
          <input
            required
            type="number"
            min={0}
            step={1}
            placeholder="Stock"
            value={form.stock}
            onChange={(e) => patchForm({ stock: e.target.value })}
            className={inputClass}
          />
          <input
            type="url"
            placeholder="Image URL (https://...)"
            value={form.image_url}
            onChange={(e) => patchForm({ image_url: e.target.value })}
            className={`${inputClass} sm:col-span-2`}
          />
          <textarea
            placeholder="Description"
            value={form.description}
            onChange={(e) => patchForm({ description: e.target.value })}
            rows={2}
            className={`${inputClass} sm:col-span-2`}
          />
        </div>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-brand-500 px-4 py-2 text-sm text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {saving ? 'Saving...' : editingId !== null ? 'Save changes' : 'Add product'}
          </button>
          {editingId !== null && (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {!data ? (
        <p className="text-gray-500">Loading products...</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full rounded border border-gray-200 bg-white text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left">
                  <th className="p-2">Name</th>
                  <th className="p-2">Category</th>
                  <th className="p-2">Price</th>
                  <th className="p-2">Stock</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((product) => (
                  <tr key={product.id} className="border-b last:border-0">
                    <td className="p-2">{product.name}</td>
                    <td className="p-2">{product.category}</td>
                    <td className="p-2">${Number(product.price).toFixed(2)}</td>
                    <td className={`p-2 ${product.stock === 0 ? 'font-semibold text-red-600' : ''}`}>
                      {product.stock}
                    </td>
                    <td className="p-2 text-right">
                      <button
                        onClick={() => startEdit(product)}
                        className="mr-3 text-brand-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(product)}
                        className="text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={data.pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
