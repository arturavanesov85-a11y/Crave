import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Montserrat, Playfair_Display } from 'next/font/google';
import './globals.css';

const sans = Montserrat({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '600'], variable: '--font-sans', display: 'swap' });
const serif = Cormorant_Garamond({ subsets: ['latin', 'cyrillic'], weight: ['500', '600'], variable: '--font-serif', display: 'swap' });
// Шрифт подписи логотипа (CAR RENTAL / AUTO / SERVICE) — тот же, что в логотипе crave-rental.ru.
const logo = Playfair_Display({ subsets: ['latin'], weight: ['400'], variable: '--font-logo', display: 'block' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_ORIGIN || 'http://localhost:3000'),
  title: { default: 'CRAVE', template: '%s — CRAVE' },
};

export const viewport: Viewport = { themeColor: '#0A0A09', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${sans.variable} ${serif.variable} ${logo.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
