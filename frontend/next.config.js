/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@eutlas/shared'],
  // Enable standalone output for Docker builds (works on Linux)
  // On Windows, standalone mode has symlink issues
  output: process.env.DOCKER_BUILD === 'true' || process.platform === 'linux' ? 'standalone' : undefined,
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


