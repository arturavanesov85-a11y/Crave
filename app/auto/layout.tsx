import { SiteFooter, SiteHeader } from '@/components/site/SiteHeader';

export const metadata = { title: { default: 'CRAVE Auto — покупка автомобиля', template: '%s — CRAVE Auto' }, description: 'CRAVE Auto: подбор и покупка премиальных автомобилей.' };

export default function AutoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="proto-note"><div className="wrap">Тестовая версия. Название «CRAVE Auto» — рабочее.</div></div>
      <SiteHeader active="sales" home="/auto" sub="AUTO" nav={[{ href: '/auto', label: 'Главная' }, { href: '/auto#catalog', label: 'Автомобили' }, { href: '/auto#contact', label: 'Контакты' }]} />
      <main>{children}</main>
      <SiteFooter name="Продажа автомобилей" links={[{ href: '/politika-konfidencialnosti', label: 'Политика конфиденциальности' }]} />
    </>
  );
}
