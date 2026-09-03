// The exchange-rate API is the only third-party origin the browser talks to.
// Read the host out of the configured URL so overriding the env var cannot
// silently put the app in breach of its own connect-src.
const exchangeRateOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_EXCHANGE_RATE_API ?? 'https://api.frankfurter.app/latest?from=USD';
  try {
    return new URL(raw).origin;
  } catch {
    return 'https://api.frankfurter.app';
  }
})();

/**
 * Report-only on purpose. Next needs 'unsafe-inline' for its bootstrap script
 * and for next/font's injected styles unless every render threads a nonce,
 * which force-dynamic pages make possible but is a bigger change than this.
 * Ship it collecting violations first; promote to Content-Security-Policy once
 * the report is clean and the nonce work is done.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.unsplash.com https://placehold.co",
  "font-src 'self' data:",
  `connect-src 'self' ${exchangeRateOrigin}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * helmet only runs on the Express app mounted at /api, so before this every
   * page a person actually looks at - storefront, checkout, admin - served
   * with no CSP, no X-Frame-Options and no Referrer-Policy.
   *
   * The source is a negative lookahead rather than '/:path*' so these do not
   * also fire on /api responses, where helmet already sets its own and two
   * sources of the same header is how they drift.
   */
  async headers() {
    return [
      {
        source: '/((?!api/).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          { key: 'Content-Security-Policy-Report-Only', value: csp },
        ],
      },
    ];
  },
  // Emit a self-contained server bundle so the Docker image can run
  // `node server.js` without node_modules. Harmless outside Docker.
  output: 'standalone',
  images: {
    /**
     * Allowlisted rather than `hostname: '**'`.
     *
     * The wildcard let anyone call /_next/image?url=<any https url> and have
     * this deployment fetch, optimize and serve it - an open image proxy on
     * your bandwidth.
     *
     * The trade-off: an admin pasting an image URL from a host not listed here
     * gets the neutral placeholder from components/ui/ProductImage instead of
     * the photo (it degrades, it doesn't break). Add the host below when that
     * happens, or restore `{ protocol: 'https', hostname: '**' }` to go back to
     * accepting anything.
     */
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'placehold.co' },
    ],
  },
};

module.exports = nextConfig;
