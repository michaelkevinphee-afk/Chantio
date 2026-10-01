import type { Metadata } from 'next';
import { Barlow_Condensed, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ variable: '--font-jakarta', subsets: ['latin'] });
const barlow = Barlow_Condensed({ variable: '--font-barlow', subsets: ['latin'], weight: ['700', '800'] });

export const metadata: Metadata = {
  title: 'Chantio',
  description: "Fiches d'intervention pour les artisans du bâtiment",
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="fr" className={`${jakarta.variable} ${barlow.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
