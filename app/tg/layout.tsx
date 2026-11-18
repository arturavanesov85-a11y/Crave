import Script from 'next/script';
import { TgShell } from '@/components/tg/TgShell';

export const metadata = { title: { absolute: 'CRAVE — для сотрудников' }, robots: { index: false } };
export const viewport = { themeColor: '#0A0A09', width: 'device-width', initialScale: 1, maximumScale: 1 };

export default function TgLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Копия скрипта Telegram лежит у нас: с telegram.org на телефонах он грузится не всегда. */}
      <Script src="/tg/telegram-web-app.js" strategy="beforeInteractive" />
      <TgShell>{children}</TgShell>
    </>
  );
}
