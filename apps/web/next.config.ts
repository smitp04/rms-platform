import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Transpile local workspace packages
  transpilePackages: ['@devx/auth', '@devx/types', '@devx/config', '@devx/db'],

  // Required for Prisma in Next.js App Router
  serverExternalPackages: ['@prisma/client'],
};

export default nextConfig;
