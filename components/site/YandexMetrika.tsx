'use client';

// Счётчик Яндекс.Метрики сайта (код из кабинета Метрики). У каждого сайта свой номер.
// Next.js меняет страницы без перезагрузки — такие переходы отправляем в Метрику вручную (hit),
// иначе она увидит только первую страницу визита. CRM и мини-приложение счётчик не подключают.
import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';


type Ym = (id: number, method: string, ...args: unknown[]) => void;

function Hits({ id }: { id: number }) {
  const path = usePathname();
  const query = useSearchParams()?.toString();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false; // первый просмотр Метрика засчитывает сама при init
      return;
    }
    const ym = (window as unknown as { ym?: Ym }).ym;
    ym?.(id, 'hit', window.location.href, { referer: document.referrer, title: document.title });
  }, [id, path, query]);
  return null;
}

export function YandexMetrika({ id }: { id: number }) {
  const code = `(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=${id}', 'ym');
ym(${id}, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});`;
  return (
    <>
      <Script id={`ym-${id}`} strategy="afterInteractive">{code}</Script>
      <noscript>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://mc.yandex.ru/watch/${id}`} style={{ position: 'absolute', left: -9999 }} alt="" />
        </div>
      </noscript>
      <Suspense fallback={null}>
        <Hits id={id} />
      </Suspense>
    </>
  );
}
