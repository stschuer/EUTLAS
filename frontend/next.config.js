/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@eutlas/shared'],
  // Enable standalone output only on Linux (CI) - Windows has symlink issues
  output: process.platform === 'linux' ? 'standalone' : undefined,
  eslint: {
    // Allow production builds to complete even with ESLint errors
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Allow production builds to complete even with TypeScript errors
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;


