import { SiteFooter, SiteHeader } from '@/components/site/SiteHeader';
import { YandexMetrika } from '@/components/site/YandexMetrika';
import { METRIKA } from '@/lib/metrika';

export const metadata = { title: { absolute: 'CRAVE Service — автосервис', template: '%s — CRAVE Service' }, description: 'CRAVE Service: заявка на обслуживание автомобиля.' };

export default function ServiceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader active="service" home="/service" nav={[{ href: '/service', label: 'Главная' }, { href: '/service#services', label: 'Услуги' }, { href: '/service#contact', label: 'Записаться' }]} />
      <main>{children}</main>
      <SiteFooter active="service" name="Автосервис" links={[{ href: '/politika-konfidencialnosti', label: 'Политика конфиденциальности' }]} />
      <YandexMetrika id={METRIKA.service} />
    </>
  );
}
