'use client';

// Связка с Telegram WebApp: готовность, полноэкранный режим, цвета, системная кнопка «Назад».
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

type BackButton = { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
export type TgWebApp = {
  initData: string;
  initDataUnsafe?: { user?: { first_name?: string; username?: string } };
  ready(): void;
  expand(): void;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  BackButton?: BackButton;
  HapticFeedback?: { impactOccurred(style: string): void };
};

export function tg(): TgWebApp | null {
  return typeof window !== 'undefined' ? ((window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp ?? null) : null;
}

export function TgShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    const app = tg();
    if (!app) return;
    app.ready();
    app.expand();
    app.setHeaderColor?.('#0A0A09');
    app.setBackgroundColor?.('#0A0A09');
  }, []);

  useEffect(() => {
    const back = tg()?.BackButton;
    if (!back) return;
    const onBack = () => router.back();
    if (path !== '/tg' && path !== '/tg/rental') {
      back.show();
      back.onClick(onBack);
    } else back.hide();
    return () => back.offClick(onBack);
  }, [path, router]);

  return <div className="tg-app">{children}</div>;
}
