/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true, // Włącz kompresję GZIP dla odpowiedzi
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'conceptfab.com',
        pathname: '/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  // Allow dev origins for cross-origin requests
  allowedDevOrigins: ['192.168.1.111'],
  
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