'use client';

import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/cn';

/**
 * Product photography with a real fallback.
 *
 * Every call site previously did `{product.image_url && <Image .../>}`, which
 * leaves an empty grey square when a product has no image - and shows a broken
 * image when the URL is set but fails to load. Admins can paste any URL, and
 * remote images rot, so both cases are routine rather than exceptional.
 *
 * The fallback is deliberately quiet: a neutral mark on a tinted ground, not an
 * error state. A missing photo is a gap in the catalogue, not something the
 * shopper did wrong.
 */
export default function ProductImage({
  src,
  alt,
  sizes,
  priority = false,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center bg-gray-100"
        // The product name is already adjacent in every layout that uses this,
        // so announcing a decorative placeholder would just be noise.
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-1/3 w-1/3 max-h-10 max-w-10 text-gray-400"
        >
          <path d="M3 8.5 12 3l9 5.5v7L12 21l-9-5.5z" />
          <path d="M3 8.5 12 14l9-5.5M12 14v7" />
        </svg>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      onError={() => setFailed(true)}
      className={cn('object-cover', className)}
    />
  );
}
