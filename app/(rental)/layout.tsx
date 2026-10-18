import { SiteFooter, SiteHeader } from '@/components/site/SiteHeader';

const NAV = [
  { href: '/avtopark', label: 'Автопарк' },
  { href: '/ceny', label: 'Цены' },
  { href: '/usloviya-arendy', label: 'Условия аренды' },
  { href: '/kontakty', label: 'Контакты' },
];

export default function RentalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="proto-note"><div className="wrap">Тестовая версия. Тарифы перенесены с текущего сайта и ожидают подтверждения.</div></div>
      <SiteHeader active="rental" home="/" nav={NAV} />
      <main>{children}</main>
      <SiteFooter name="Прокат премиальных автомобилей" links={[{ href: '/usloviya-arendy', label: 'Условия аренды' }, { href: '/politika-konfidencialnosti', label: 'Политика конфиденциальности' }]} />
    </>
  );
}
