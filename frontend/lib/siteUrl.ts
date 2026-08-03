/**
 * Absolute origin, for metadata only - canonical URLs, Open Graph tags and the
 * sitemap all have to be absolute, and relative ones are simply ignored by
 * crawlers and link unfurlers.
 *
 * Read from Vercel's own `VERCEL_PROJECT_PRODUCTION_URL`, which always names
 * the production domain even when the code is running on a preview
 * deployment. That is what you want for a canonical URL: a preview should
 * point search engines at production, not at itself.
 *
 * This is NOT a base for fetching. `lib/api.ts` stays relative on purpose -
 * see the comment there about what a baked-in absolute host once cost us.
 * Nothing here ends up in a browser bundle.
 */
export const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'http://localhost:3000';
