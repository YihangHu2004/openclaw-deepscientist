import type { NextConfig } from 'next';
import path from 'path';

const PROXY_PORT = parseInt(process.env.DEEPCLAW_UI_PORT || '19000', 10);

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // Dev-mode proxy: when opening localhost:3000 directly, forward API/WS to the proxy server
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `http://127.0.0.1:${PROXY_PORT}/api/:path*` },
    ];
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
