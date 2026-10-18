import { SiteFooter, SiteHeader } from '@/components/site/SiteHeader';

export const metadata = { title: { default: 'CRAVE Service — автосервис', template: '%s — CRAVE Service' }, description: 'CRAVE Service: заявка на обслуживание автомобиля.' };

export default function ServiceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="proto-note"><div className="wrap">Тестовая версия. Название «CRAVE Service» — рабочее.</div></div>
      <SiteHeader active="service" home="/service" sub="SERVICE" nav={[{ href: '/service', label: 'Главная' }, { href: '/service#services', label: 'Услуги' }, { href: '/service#contact', label: 'Записаться' }]} />
      <main>{children}</main>
      <SiteFooter name="Автосервис" links={[{ href: '/politika-konfidencialnosti', label: 'Политика конфиденциальности' }]} />
    </>
  );
}
