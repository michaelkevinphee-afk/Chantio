import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Le code partagé avec l'appli mobile est en TypeScript, compilé par Next.
  transpilePackages: ['@chantio/shared'],
  // Une page déjà vue s'affiche aussitôt si on y revient dans les 30 secondes
  // (les enregistrements, eux, rafraîchissent toujours l'affichage).
  experimental: { staleTimes: { dynamic: 30 } },
};

export default nextConfig;
