import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/api', () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return { api: { get: vi.fn(), post: vi.fn() }, ApiError };
});
vi.mock('@/lib/auth', () => ({ auth: { isLoggedIn: () => false } }));
// next/link needs the App Router context; a plain anchor is the honest substitute.
vi.mock('next/link', async () => {
  const { createElement } = await import('react');
  return { default: ({ href, children, ...rest }: any) => createElement('a', { href, ...rest }, children) };
});

import { api } from '@/lib/api';
import ProductReviews from '@/components/ProductReviews';

const get = api.get as unknown as ReturnType<typeof vi.fn>;

function review(id: number) {
  return {
    id,
    rating: 4,
    body: `Review number ${id}`,
    verified_purchase: id % 2 === 0,
    created_at: '2026-01-01T00:00:00Z',
    reviewer: `Reader ${id}`,
  };
}

function page(ids: number[], pageNo: number, total: number) {
  return {
    reviews: ids.map(review),
    summary: { average: 4, total },
    pagination: { page: pageNo, limit: 10, total, totalPages: Math.ceil(total / 10) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * The API pages at 10 and the component used to ignore `pagination`, so an
 * eleventh review was averaged in and never shown. "Show more" appends the
 * next page below the ones already on screen.
 */
describe('ProductReviews paging', () => {
  it('shows the first page, says how many there are, and offers more only when there are more', async () => {
    get.mockResolvedValueOnce(page([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1, 12));
    render(<ProductReviews productId="6" />);

    expect(await screen.findByText('Review number 10')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByRole('status')).toHaveTextContent('Showing 10 of 12 reviews');
    expect(screen.getByRole('button', { name: 'Show more reviews' })).toBeInTheDocument();
  });

  it('appends the next page below the first rather than replacing it, then stops offering', async () => {
    get
      .mockResolvedValueOnce(page([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1, 12))
      .mockResolvedValueOnce(page([11, 12], 2, 12));
    render(<ProductReviews productId="6" />);
    await screen.findByText('Review number 10');

    fireEvent.click(screen.getByRole('button', { name: 'Show more reviews' }));

    expect(get).toHaveBeenLastCalledWith('/api/products/6/reviews?page=2');
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(12));
    // Order kept: the first page is still first.
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toContain('Review number 1');
    expect(items[11]).toContain('Review number 12');
    expect(screen.getByRole('status')).toHaveTextContent('Showing 12 of 12 reviews');
    expect(screen.queryByRole('button', { name: 'Show more reviews' })).toBeNull();
  });

  it('offers nothing more when the first page is all there is', async () => {
    get.mockResolvedValueOnce(page([1, 2, 3], 1, 3));
    render(<ProductReviews productId="6" />);

    await screen.findByText('Review number 3');
    expect(screen.getByRole('status')).toHaveTextContent('Showing 3 of 3 reviews');
    expect(screen.queryByRole('button', { name: 'Show more reviews' })).toBeNull();
  });

  it('keeps what is shown, and the button, when loading more fails', async () => {
    get
      .mockResolvedValueOnce(page([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1, 12))
      .mockRejectedValueOnce(new Error('network'));
    render(<ProductReviews productId="6" />);
    await screen.findByText('Review number 10');

    fireEvent.click(screen.getByRole('button', { name: 'Show more reviews' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Show more reviews' })).toBeEnabled()
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
  });
});
