import { SiteFooter, SiteHeader } from '@/components/site/SiteHeader';

export const metadata = { title: { absolute: 'CRAVE Service — автосервис', template: '%s — CRAVE Service' }, description: 'CRAVE Service: заявка на обслуживание автомобиля.' };

export default function ServiceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader active="service" home="/service" nav={[{ href: '/service', label: 'Главная' }, { href: '/service#services', label: 'Услуги' }, { href: '/service#contact', label: 'Записаться' }]} />
      <main>{children}</main>
      <SiteFooter active="service" name="Автосервис" links={[{ href: '/politika-konfidencialnosti', label: 'Политика конфиденциальности' }]} />
    </>
  );
}
