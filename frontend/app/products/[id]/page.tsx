import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import StarRating from '@/components/ui/StarRating';
import Breadcrumb from '@/components/ui/Breadcrumb';
import ProductGallery from '@/components/ProductGallery';
import ProductReviews from '@/components/ProductReviews';
import ProductFaq from '@/components/ProductFaq';
import RelatedProducts from '@/components/RelatedProducts';
import { siteUrl } from '@/lib/siteUrl';
import { serializeJsonLd } from '@/lib/jsonLd';
import PriceDisplay from './PriceDisplay';
import AddToCartControls from './AddToCartControls';
// Request-scoped: generateMetadata and the page body share one read.
import { loadProduct } from './loadProduct';

/**
 * Rendered per request, never cached. The whole promise of this storefront is
 * "if it's on the page, it's on the shelf" - a cached page would show a stock
 * count that was true a minute ago, which is precisely the claim it makes.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await loadProduct(id);

  if (!product) {
    return { title: 'Product not found' };
  }

  // Falls back to a generated sentence rather than leaving the description
  // empty: an unfurled link with no summary looks broken.
  const description =
    product.description?.trim() ||
    `${product.name} - ${product.category} at ShelfStock. Cash on delivery, live stock counts.`;
  const url = `${siteUrl}/products/${product.id}`;
  const image = product.images?.[0] ?? product.image_url ?? undefined;

  return {
    title: product.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      title: product.name,
      description,
      url,
      siteName: 'ShelfStock',
      images: image ? [{ url: image, alt: product.name }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: product.name,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await loadProduct(id);

  // A malformed id and a missing one both land here, so a stranger cannot
  // tell them apart - the same reasoning as the API's 404.
  if (!product) notFound();

  const price = Number(product.price);
  const image = product.images?.[0] ?? product.image_url ?? undefined;

  // Structured data, so a search result can carry the price, availability and
  // star rating instead of just a blue link.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description ?? undefined,
    sku: String(product.id),
    category: product.category,
    image: product.images?.length ? product.images : undefined,
    offers: {
      '@type': 'Offer',
      price: price.toFixed(2),
      priceCurrency: 'USD',
      availability:
        product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `${siteUrl}/products/${product.id}`,
    },
    ...((product.rating_count ?? 0) > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: product.rating_average,
        reviewCount: product.rating_count,
      },
    }),
  };

  return (
    <div>
      <script
        type="application/ld+json"
        // serializeJsonLd, not JSON.stringify: the name and description here
        // are typed by an admin through the product CRUD endpoint, and
        // JSON.stringify does not escape "<". A product named "</script>..."
        // would otherwise close this tag and run as HTML.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <Breadcrumb
        items={[
          { label: 'Shop', href: '/' },
          // Category filtering is a query string on the home page rather than
          // its own route, so this crumb links to that filtered view.
          { label: product.category, href: `/?category=${encodeURIComponent(product.category)}` },
          { label: product.name },
        ]}
      />

      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <ProductGallery images={product.images ?? []} productName={product.name} />
        <div>
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <p className="mt-1 text-sm text-gray-500">{product.category}</p>

          {(product.rating_count ?? 0) > 0 && (
            <a href="#reviews" className="mt-2 inline-flex hover:underline">
              <StarRating
                average={product.rating_average ?? 0}
                count={product.rating_count}
                size="md"
              />
            </a>
          )}

          <PriceDisplay product={product} />

          <p className="mt-4 text-gray-700">{product.description}</p>
          {/* Colours here are one step darker than the obvious amber-600/red-600
              so each clears 4.5:1 against white. */}
          <p className="mt-2 text-sm">
            {product.stock === 0 ? (
              <span className="font-medium text-red-700">Out of stock</span>
            ) : product.stock <= 5 ? (
              <span className="font-medium text-amber-700">Only {product.stock} left</span>
            ) : (
              <span className="text-brand-700">In stock</span>
            )}
          </p>

          <AddToCartControls product={product} />

          {/* Store-wide buying facts, next to the buy button where the doubt is. */}
          <ul className="mt-6 space-y-1.5 border-t border-gray-200 pt-4 text-sm text-gray-600">
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-brand-600">
                ✓
              </span>
              Pay cash when it arrives — no card needed
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-brand-600">
                ✓
              </span>
              This price is locked to your order once you place it
            </li>
          </ul>
        </div>
      </div>

      <div id="reviews">
        <ProductReviews productId={String(product.id)} />
      </div>

      <ProductFaq />

      <RelatedProducts productId={String(product.id)} category={product.category} />
    </div>
  );
}
