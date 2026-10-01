import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Le code partagé avec l'appli mobile est en TypeScript, compilé par Next.
  transpilePackages: ['@chantio/shared'],
};

export default nextConfig;
