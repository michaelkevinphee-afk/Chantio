import type { Metadata } from 'next';
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

// Même typographie que le site Chantio : Plus Jakarta Sans, et JetBrains Mono pour les références.
const jakarta = Plus_Jakarta_Sans({ variable: '--font-jakarta', subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] });
const mono = JetBrains_Mono({ variable: '--font-jetbrains', subsets: ['latin'], weight: ['500', '700'] });

export const metadata: Metadata = {
  title: 'Chantio',
  description: "Fiches d'intervention pour les artisans du bâtiment",
  // Logo « C en blocs » dans l'onglet, les favoris et l'écran d'accueil de l'iPhone.
  icons: {
    icon: { url: '/icon.svg', type: 'image/svg+xml' },
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="fr" className={`${jakarta.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
