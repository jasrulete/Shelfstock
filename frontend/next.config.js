/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle so the Docker image can run
  // `node server.js` without node_modules. Harmless outside Docker.
  output: 'standalone',
  images: {
    // Admins can paste any https image URL when creating a product, so we
    // can't enumerate hostnames ahead of time.
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

module.exports = nextConfig;
