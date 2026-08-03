'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Card from './ui/Card';
import { Input, Select } from './ui/Field';

/**
 * Search, filters and sort for the storefront grid.
 *
 * These live in the URL rather than in component state, which is what lets the
 * grid render on the server: the page reads the same query string a shopper
 * can copy out of the address bar. A filtered view is now shareable,
 * bookmarkable, and reachable with the back button.
 *
 * The search box keeps a local copy of its value so typing stays instant, and
 * only writes to the URL once typing pauses. That debounce is the same reason
 * the old client-side hook had one - a navigation per keystroke would be as
 * wasteful as a request per keystroke - but the request racing it also had to
 * guard against is now the router's problem, not ours.
 */
const SEARCH_DEBOUNCE_MS = 400;

export default function StorefrontControls({ categories }: { categories: string[] }) {
  const router = useRouter();
  // Next 15 types both of these as possibly null (they are, while a route is
  // resolving), so narrow once here instead of guarding at every use - the
  // same treatment useParams() gets on the product page.
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlSearch = searchParams.get('search') ?? '';
  const [search, setSearch] = useState(urlSearch);

  // Re-sync when the URL changes from somewhere else - the back button, or the
  // "Clear filters" link - so the box never disagrees with the results.
  useEffect(() => {
    setSearch(urlSearch);
  }, [urlSearch]);

  function buildHref(patch: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // Any change to what is being filtered invalidates the page number: page 3
    // of the old result set is rarely page 3 of the new one, and is often past
    // the end of it.
    if (!('page' in patch)) next.delete('page');
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function apply(patch: Record<string, string>) {
    startTransition(() => {
      // push, not replace: a filter change is a place you can go back from.
      // The search box's debounce is what keeps this from writing a history
      // entry per keystroke - one per typing pause, which is what a shopper
      // would expect the back button to undo.
      router.push(buildHref(patch), { scroll: false });
    });
  }

  useEffect(() => {
    if (search === urlSearch) return;
    const id = setTimeout(() => apply({ search }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // apply/buildHref close over searchParams, which changes on every
    // navigation; depending on them here would restart the timer mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, urlSearch]);

  const sort = searchParams.get('sort') ?? 'created_at';
  const order = searchParams.get('order') ?? 'desc';

  return (
    <div
      className="space-y-4"
      // Dims the controls while the server is producing the next grid, so a
      // slow filter reads as "working" rather than "ignored my click".
      aria-busy={isPending}
      style={{ opacity: isPending ? 0.7 : 1, transition: 'opacity 150ms' }}
    >
      <Input
        label="Search products"
        hideLabel
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search products..."
      />

      <Card className="flex flex-wrap items-end gap-3 p-3">
        <Select
          label="Category"
          hideLabel
          value={searchParams.get('category') ?? ''}
          onChange={(e) => apply({ category: e.target.value })}
          wrapperClassName="w-44"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>

        <Input
          label="Minimum price"
          hideLabel
          type="number"
          min={0}
          placeholder="Min price"
          value={searchParams.get('minPrice') ?? ''}
          onChange={(e) => apply({ minPrice: e.target.value })}
          wrapperClassName="w-28"
        />
        <Input
          label="Maximum price"
          hideLabel
          type="number"
          min={0}
          placeholder="Max price"
          value={searchParams.get('maxPrice') ?? ''}
          onChange={(e) => apply({ maxPrice: e.target.value })}
          wrapperClassName="w-28"
        />

        <Select
          label="Sort by"
          hideLabel
          value={`${sort}:${order}`}
          onChange={(e) => {
            const [nextSort, nextOrder] = e.target.value.split(':');
            apply({ sort: nextSort, order: nextOrder });
          }}
          wrapperClassName="w-48"
        >
          <option value="created_at:desc">Newest first</option>
          <option value="price:asc">Price: low to high</option>
          <option value="price:desc">Price: high to low</option>
          <option value="name:asc">Name: A-Z</option>
        </Select>
      </Card>
    </div>
  );
}
