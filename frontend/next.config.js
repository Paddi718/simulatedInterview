/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  compress: true,       // gzip/brotli 响应压缩
  productionBrowserSourceMaps: false,

  // 静态页面 CDN 缓存（面试 session 页除外，它走 WebSocket）
  async headers() {
    return [
      {
        source: '/:path((?!interview/session).*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },

  async rewrites() {
    // 服务端请求走内网地址（Docker 容器名 / 本地 localhost）
    const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
