'use client';

import { useState } from 'react';
import ProductImage from './ui/ProductImage';
import { cn } from '@/lib/cn';

/**
 * Product photography for the detail page.
 *
 * With one image this is just the image - no thumbnail strip, no controls. A
 * single-item "gallery" with one lonely thumbnail under it advertises that the
 * product is under-photographed.
 *
 * The thumbnails are a tablist rather than a row of buttons: they select
 * between views of one thing, which is what a tablist means, and it gives
 * arrow-key movement for free in screen readers that implement it.
 */
export default function ProductGallery({
  images,
  productName,
}: {
  images: string[];
  productName: string;
}) {
  const [active, setActive] = useState(0);
  const gallery = images.length > 0 ? images : [''];
  const current = gallery[Math.min(active, gallery.length - 1)];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
        <ProductImage
          src={current || null}
          alt={productName}
          priority
          sizes="(max-width: 767px) 100vw, 50vw"
        />
      </div>

      {gallery.length > 1 && (
        <div role="tablist" aria-label={`${productName} images`} className="flex gap-2">
          {gallery.map((url, i) => (
            <button
              key={url + i}
              role="tab"
              type="button"
              aria-selected={i === active}
              aria-label={`Image ${i + 1} of ${gallery.length}`}
              onClick={() => setActive(i)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') setActive((n) => (n + 1) % gallery.length);
                if (e.key === 'ArrowLeft')
                  setActive((n) => (n - 1 + gallery.length) % gallery.length);
              }}
              className={cn(
                'relative aspect-square w-16 overflow-hidden rounded border-2 transition-colors',
                i === active
                  ? 'border-brand-500'
                  : 'border-transparent hover:border-gray-300'
              )}
            >
              <ProductImage src={url} alt="" sizes="64px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
