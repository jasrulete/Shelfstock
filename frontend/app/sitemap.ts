import type { MetadataRoute } from 'next';
import { listProducts } from '@/server/queries/products';
import { siteUrl } from '@/lib/siteUrl';

// Regenerated per request rather than at build time: the catalogue is in the
// database, and a build-time snapshot would omit every product added since the
// last deploy.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 100 is the cap listProducts enforces. This storefront has six products; if
  // it ever outgrows one page, this needs to page through rather than silently
  // listing only the first hundred.
  const { products } = await listProducts({ limit: '100', sort: 'created_at', order: 'desc' });

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    ...products.map((product) => ({
      url: `${siteUrl}/products/${product.id}`,
      lastModified: product.created_at ? new Date(product.created_at) : new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ];
}
