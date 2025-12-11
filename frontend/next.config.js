/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@eutlas/shared'],
  // Enable standalone output for Docker/CI builds
  // On Windows locally, this is disabled due to symlink issues
  output: process.env.DOCKER_BUILD === 'true' || process.env.CI === 'true' ? 'standalone' : undefined,
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


