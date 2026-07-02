'use client';

import { Pagination as PaginationType } from '@/types';

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
    <div className="mt-4 flex items-center justify-center gap-2">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-40"
      >
        Prev
      </button>
      <span className="text-sm text-gray-600">
        Page {page} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}
