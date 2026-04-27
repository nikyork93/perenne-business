/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'assets.perenne.app' },
      { protocol: 'https', hostname: 'api.perenne.app' },
    ],
  },
  // Fabric.js needs canvas on server; we keep editor client-only
  webpack: (config) => {
    config.externals = [...(config.externals || []), { canvas: 'commonjs canvas' }];
    return config;
  },
};

module.exports = nextConfig;
