/** @type {import('next').NextConfig} */
const nextConfig = {
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
