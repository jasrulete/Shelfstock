/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Admins can paste any https image URL when creating a product, so we
    // can't enumerate hostnames ahead of time.
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

module.exports = nextConfig;
