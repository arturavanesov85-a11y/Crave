import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Montserrat } from 'next/font/google';
import './globals.css';

const sans = Montserrat({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '600'], variable: '--font-sans', display: 'swap' });
const serif = Cormorant_Garamond({ subsets: ['latin', 'cyrillic'], weight: ['500', '600'], variable: '--font-serif', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_ORIGIN || 'http://localhost:3000'),
  title: { default: 'CRAVE', template: '%s — CRAVE' },
};

export const viewport: Viewport = { themeColor: '#0A0A09', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
