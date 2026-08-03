import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// next/link needs the App Router context to be mounted. These tests are about
// the hrefs this component builds, not about Next's navigation, so a plain
// anchor is the honest substitute.
//
// createElement rather than JSX, and react imported inside the factory:
// Vitest hoists vi.mock above the imports, so JSX here would run before the
// JSX runtime helper exists.
vi.mock('next/link', async () => {
  const { createElement } = await import('react');
  return {
    default: ({ href, children, ...rest }: any) =>
      createElement('a', { href, ...rest }, children),
  };
});

import StorefrontPagination from '../components/StorefrontPagination';

const pagination = (page: number, totalPages: number) => ({
  page,
  limit: 12,
  total: totalPages * 12,
  totalPages,
});

describe('StorefrontPagination', () => {
  it('renders nothing when there is only one page', () => {
    const { container } = render(
      <StorefrontPagination pagination={pagination(1, 1)} searchParams={{}} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  // Page 1 is "/" not "/?page=1": the clean URL and the numbered one would
  // otherwise be two addresses for identical content.
  it('omits the page param when linking back to the first page', () => {
    render(<StorefrontPagination pagination={pagination(2, 3)} searchParams={{ page: '2' }} />);

    expect(screen.getByRole('link', { name: 'Prev' })).toHaveAttribute('href', '/');
  });

  it('carries every other filter into the page link', () => {
    render(
      <StorefrontPagination
        pagination={pagination(1, 3)}
        searchParams={{ category: 'Books', search: 'pragmatic', sort: 'price', order: 'asc' }}
      />
    );

    const next = screen.getByRole('link', { name: 'Next' });
    const url = new URL(next.getAttribute('href')!, 'https://example.test');

    expect(url.searchParams.get('category')).toBe('Books');
    expect(url.searchParams.get('search')).toBe('pragmatic');
    expect(url.searchParams.get('sort')).toBe('price');
    expect(url.searchParams.get('order')).toBe('asc');
    expect(url.searchParams.get('page')).toBe('2');
  });

  // A query string may repeat a key (?category=a&category=b). Taking the first
  // keeps the link in step with the grid, which reads the first as well.
  it('takes the first value when a param is repeated', () => {
    render(
      <StorefrontPagination
        pagination={pagination(1, 2)}
        searchParams={{ category: ['Books', 'Toys'] }}
      />
    );

    const url = new URL(
      screen.getByRole('link', { name: 'Next' }).getAttribute('href')!,
      'https://example.test'
    );

    expect(url.searchParams.getAll('category')).toEqual(['Books']);
  });

  it('renders the edges as inert text rather than links', () => {
    render(<StorefrontPagination pagination={pagination(1, 3)} searchParams={{}} />);

    // Page 1 has nowhere to go back to, so "Prev" must not be clickable.
    expect(screen.queryByRole('link', { name: 'Prev' })).toBeNull();
    expect(screen.getByText('Prev')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next' })).toBeInTheDocument();
  });
});
