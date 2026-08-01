'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { Product, ProductsResponse } from '@/types';
import Pagination from '@/components/Pagination';
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
                label="Image URL"
                type="url"
                placeholder="https://..."
                value={form.image_url}
                onChange={(e) => patchForm({ image_url: e.target.value })}
              />
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
                    <td className="p-2">{product.name}</td>
                    <td className="p-2">{product.category}</td>
                    <td className="p-2">${Number(product.price).toFixed(2)}</td>
                    <td className={`p-2 ${product.stock === 0 ? 'font-semibold text-red-700' : ''}`}>
                      {product.stock}
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
