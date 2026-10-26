import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { can, directionsOf, roleLabel } from '@/lib/permissions';
import { db } from '@/lib/db';
import { logout } from '../actions';
import { Logo } from '@/components/site/Logo';
import { CrmNav } from './CrmNav';

export const dynamic = 'force-dynamic';
export const metadata = { title: { default: 'CRM', template: '%s — CRM CRAVE' }, robots: { index: false } };

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const dirs = directionsOf(user);
  const [newRental, newSales, newService] = await Promise.all(
    (['rental', 'sales', 'service'] as const).map((d) => db.lead.count({ where: { status: 'new', direction: d } })),
  );
  // Пункты без доступа не показываются. Порядок: работа с клиентами → справочники → сайты → настройки.
  const items = [
    { href: '/crm', label: 'Сегодня', show: can(user, 'rental.read') || can(user, 'rental.read.assigned') },
    { href: '/crm/calendar', label: 'Календарь', show: can(user, 'rental.read') },
    { href: '/crm/orders', label: 'Заказы', show: can(user, 'rental.read') || can(user, 'rental.read.assigned') },
    { href: '/crm/leads', label: 'Заявки проката', show: can(user, 'leads.rental') && dirs.includes('rental'), count: newRental },
    { href: '/crm/sales', label: 'Продажи', show: can(user, 'leads.sales'), count: newSales },
    { href: '/crm/service-desk', label: 'Сервис', show: can(user, 'leads.service'), count: newService },
    { href: '/crm/vehicles', label: 'Автомобили', show: can(user, 'fleet.read') },
    { href: '/crm/customers', label: 'Клиенты', show: can(user, 'customers.read') },
    { href: '/crm/finance', label: 'Финансы', show: can(user, 'finance.view') },
    { href: '/crm/sales-cars', label: 'Авто в продаже', show: can(user, 'sales.catalog') },
    { href: '/crm/sales-site', label: 'Сайт автосалона', show: can(user, 'sales.catalog') },
    { href: '/crm/service-site', label: 'Сайт сервиса', show: can(user, 'service.site') },
    { href: '/crm/settings', label: 'Настройки', show: can(user, 'settings.manage') || user.role === 'owner' },
  ].filter((i) => i.show);

  return (
    <div className="crm">
      <aside className="crm-side">
        <Link href="/crm" style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 8px' }}>
          <Logo variant="crm" height={52} />
        </Link>
        <CrmNav items={items.map(({ href, label, count }) => ({ href, label, count }))} />
        <div className="small" style={{ marginTop: 'auto', padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong>{user.fullName}</strong>
          <span className="muted">{roleLabel(user.role)}</span>
          <form action={logout}><button className="btn btn-quiet btn-sm" type="submit" style={{ marginTop: 6 }}>Выйти</button></form>
          <a href="/" className="muted" style={{ marginTop: 6 }}>Открыть сайт →</a>
        </div>
      </aside>
      <main className="crm-main">{children}</main>
    </div>
  );
}
