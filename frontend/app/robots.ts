import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/siteUrl';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Nothing here is secret - the API enforces its own authorization - but
      // none of it is a page worth indexing, and crawling checkout or the
      // admin area only burns crawl budget on redirects to /login.
      disallow: ['/admin/', '/cart', '/checkout', '/orders', '/login', '/register', '/api/'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
