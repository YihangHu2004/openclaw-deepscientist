import type { NextConfig } from 'next';
import path from 'path';

const SERVER_URL = process.env.SERVER_URL || 'http://127.0.0.1:19000';

const nextConfig: NextConfig = {
  // In dev: proxy /api/* to the proxy server on 19000
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${SERVER_URL}/api/:path*` },
    ];
  },
  turbopack: {
    // Anchor Turbopack to this project's directory, not the workspace root
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
