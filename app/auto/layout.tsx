import { SiteFooter, SiteHeader } from '@/components/site/SiteHeader';

export const metadata = { title: { absolute: 'CRAVE Auto — покупка автомобиля', template: '%s — CRAVE Auto' }, description: 'CRAVE Auto: автомобили в наличии и поставка под заказ.' };

const NAV = [
  { href: '/auto#stock', label: 'В наличии' },
  { href: '/auto#order', label: 'Под заказ' },
  { href: '/auto#contact', label: 'Контакты' },
];

export default function AutoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader active="sales" home="/auto" nav={NAV} />
      <main>{children}</main>
      <SiteFooter active="sales" name="Продажа автомобилей" links={[{ href: '/politika-konfidencialnosti', label: 'Политика конфиденциальности' }]} />
    </>
  );
}
