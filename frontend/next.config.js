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
 *
 * Report-only enforces nothing, so its value is entirely in the report. Both
 * reporting mechanisms point at POST /api/csp-report: report-uri for Firefox
 * and Safari, report-to (with the Reporting-Endpoints header below) for
 * Chromium. Each violation becomes one "CSP violation:" line in the server
 * log. The promotion procedure - read that log across every page first - is
 * in docs/OPERATIONS.md, and tests/securityHeaders.test.ts pins that no
 * enforcing header ships until someone changes it on purpose.
 */
// Only `next dev` evals - its bundles carry eval source maps. A production
// bundle never does, so the policy that ships must not allow it, or promotion
// would enforce less than it reads as. Next sets NODE_ENV before loading this
// file, so the same config serves both.
const isDev = process.env.NODE_ENV === 'development';

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.unsplash.com https://placehold.co",
  "font-src 'self' data:",
  `connect-src 'self' ${exchangeRateOrigin}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'report-uri /api/csp-report',
  'report-to csp-endpoint',
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
          // Names the group that the CSP's report-to directive refers to. A
          // relative URL is resolved against the page, per the Reporting API.
          { key: 'Reporting-Endpoints', value: 'csp-endpoint="/api/csp-report"' },
          { key: 'Content-Security-Policy-Report-Only', value: csp },
        ],
      },
    ];
  },
  // helmet already strips X-Powered-By on /api; pages advertised the framework
  // until this. Fingerprinting only, and free to turn off.
  poweredByHeader: false,
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
