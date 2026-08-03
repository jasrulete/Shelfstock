import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const replace = vi.fn();
let currentParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/',
  useSearchParams: () => currentParams,
}));

import StorefrontControls from '../components/StorefrontControls';

const CATEGORIES = ['Apparel', 'Books', 'Electronics'];

/** The href the component pushed, parsed so assertions read by param. */
function pushedParams(call = 0) {
  const href = push.mock.calls[call][0] as string;
  return new URL(href, 'https://example.test').searchParams;
}

beforeEach(() => {
  vi.useFakeTimers();
  push.mockClear();
  replace.mockClear();
  currentParams = new URLSearchParams();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StorefrontControls', () => {
  it('offers the categories the server found, not a hardcoded list', () => {
    render(<StorefrontControls categories={CATEGORIES} />);

    for (const c of CATEGORIES) {
      expect(screen.getByRole('option', { name: c })).toBeInTheDocument();
    }
  });

  it('writes the search term to the URL once typing pauses', () => {
    render(<StorefrontControls categories={CATEGORIES} />);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'keyboard' } });
    expect(push).not.toHaveBeenCalled(); // still within the debounce

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(push).toHaveBeenCalledTimes(1);
    expect(pushedParams().get('search')).toBe('keyboard');
  });

  // Without the debounce every keystroke is a server render and a history
  // entry, and the back button turns into a per-character undo.
  it('does not navigate once per keystroke', () => {
    render(<StorefrontControls categories={CATEGORIES} />);
    const box = screen.getByRole('searchbox');

    fireEvent.change(box, { target: { value: 'k' } });
    act(() => void vi.advanceTimersByTime(100));
    fireEvent.change(box, { target: { value: 'ke' } });
    act(() => void vi.advanceTimersByTime(100));
    fireEvent.change(box, { target: { value: 'key' } });
    act(() => void vi.advanceTimersByTime(400));

    expect(push).toHaveBeenCalledTimes(1);
    expect(pushedParams().get('search')).toBe('key');
  });

  // push, not replace: a filter is somewhere you can go back from.
  it('navigates with push so the back button undoes a filter', () => {
    render(<StorefrontControls categories={CATEGORIES} />);

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Books' } });

    expect(push).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it('applies a category immediately, with no debounce', () => {
    render(<StorefrontControls categories={CATEGORIES} />);

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Books' } });

    expect(pushedParams().get('category')).toBe('Books');
  });

  // Page 3 of the old result set is rarely page 3 of the new one, and is
  // often past the end of it.
  it('drops the page number when the filters change', () => {
    currentParams = new URLSearchParams('page=3&category=Toys');
    render(<StorefrontControls categories={CATEGORIES} />);

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Books' } });

    expect(pushedParams().get('category')).toBe('Books');
    expect(pushedParams().get('page')).toBeNull();
  });

  it('keeps the other filters when one of them changes', () => {
    currentParams = new URLSearchParams('search=mug&minPrice=10');
    render(<StorefrontControls categories={CATEGORIES} />);

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Books' } });

    const params = pushedParams();
    expect(params.get('search')).toBe('mug');
    expect(params.get('minPrice')).toBe('10');
    expect(params.get('category')).toBe('Books');
  });

  it('removes a filter from the URL when it is cleared', () => {
    currentParams = new URLSearchParams('category=Books');
    render(<StorefrontControls categories={CATEGORIES} />);

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '' } });

    expect(push).toHaveBeenCalledWith('/', expect.anything());
  });

  it('splits the sort control into sort and order params', () => {
    render(<StorefrontControls categories={CATEGORIES} />);

    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'price:asc' } });

    const params = pushedParams();
    expect(params.get('sort')).toBe('price');
    expect(params.get('order')).toBe('asc');
  });

  it('shows the filters currently in the URL', () => {
    currentParams = new URLSearchParams('search=mug&category=Books&minPrice=5&sort=price&order=asc');
    render(<StorefrontControls categories={CATEGORIES} />);

    expect(screen.getByRole('searchbox')).toHaveValue('mug');
    expect(screen.getByLabelText('Category')).toHaveValue('Books');
    expect(screen.getByLabelText('Minimum price')).toHaveValue(5);
    expect(screen.getByLabelText('Sort by')).toHaveValue('price:asc');
  });

  // The back button changes the URL underneath the component; the box has to
  // follow, or it claims a filter that is no longer applied.
  it('re-syncs the search box when the URL changes underneath it', () => {
    currentParams = new URLSearchParams('search=mug');
    const { rerender } = render(<StorefrontControls categories={CATEGORIES} />);
    expect(screen.getByRole('searchbox')).toHaveValue('mug');

    currentParams = new URLSearchParams();
    rerender(<StorefrontControls categories={CATEGORIES} />);

    expect(screen.getByRole('searchbox')).toHaveValue('');
  });
});
