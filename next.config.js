/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'conceptfab.com',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/gallery/:path*',
        destination: '/api/gallery/:path*',
      },
    ];
  },
};

module.exports = nextConfig;