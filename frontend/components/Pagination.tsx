'use client';

import { Pagination as PaginationType } from '@/types';
import Button from './ui/Button';

export default function Pagination({
  pagination,
  onPageChange,
}: {
  pagination: PaginationType;
  onPageChange: (page: number) => void;
}) {
  const { page, totalPages } = pagination;
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-center gap-2">
      <Button variant="secondary" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
        Prev
      </Button>
      {/* aria-live so a page change is announced, not just visually updated. */}
      <span aria-live="polite" className="text-sm text-gray-600">
        Page {page} of {totalPages}
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
      >
        Next
      </Button>
    </nav>
  );
}
