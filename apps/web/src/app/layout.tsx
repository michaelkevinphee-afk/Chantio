import type { Metadata } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import './globals.css';

// Même typographie que l'appli mobile : Barlow pour le texte, Barlow Condensed pour les titres.
const texte = Barlow({ variable: '--font-texte', subsets: ['latin'], weight: ['500', '600', '700', '800'] });
const titre = Barlow_Condensed({ variable: '--font-barlow', subsets: ['latin'], weight: ['700', '800'] });

export const metadata: Metadata = {
  title: 'Chantio',
  description: "Fiches d'intervention pour les artisans du bâtiment",
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="fr" className={`${texte.variable} ${titre.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
