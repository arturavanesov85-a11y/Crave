import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { can, directionsOf, roleLabel } from '@/lib/permissions';
import { db } from '@/lib/db';
import { logout } from '../actions';
import { Logo } from '@/components/site/Logo';
import { CrmNav, type NavEntry } from './CrmNav';

export const dynamic = 'force-dynamic';
export const metadata = { title: { default: 'CRM', template: '%s — CRM CRAVE' }, robots: { index: false } };

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const dirs = directionsOf(user);
  const [newRental, newSales, newService] = await Promise.all(
    (['rental', 'sales', 'service'] as const).map((d) => db.lead.count({ where: { status: 'new', direction: d } })),
  );
  // Меню: «Сегодня» → направления (раскрывающиеся группы) → «Клиенты» → «Настройки».
  // Пункты без доступа не показываются, пустые группы тоже.
  const link = (href: string, label: string, show: boolean, count?: number) => (show ? [{ href, label, count }] : []);
  const nav: NavEntry[] = [
    ...link('/crm', 'Сегодня', can(user, 'rental.read') || can(user, 'rental.read.assigned')),
    {
      label: 'Прокат',
      items: [
        ...link('/crm/calendar', 'Календарь', can(user, 'rental.read')),
        ...link('/crm/orders', 'Заказы', can(user, 'rental.read') || can(user, 'rental.read.assigned')),
        ...link('/crm/leads', 'Заявки', can(user, 'leads.rental') && dirs.includes('rental'), newRental),
        ...link('/crm/vehicles', 'Автомобили', can(user, 'fleet.read')),
        ...link('/crm/finance', 'Финансы', can(user, 'finance.view')),
      ],
    },
    {
      label: 'Салон',
      items: [
        ...link('/crm/sales', 'Заявки', can(user, 'leads.sales'), newSales),
        ...link('/crm/sales-cars', 'Авто в продаже', can(user, 'sales.catalog')),
        ...link('/crm/sales-site', 'Сайт салона', can(user, 'sales.catalog')),
      ],
    },
    {
      label: 'Сервис',
      items: [
        ...link('/crm/service-desk', 'Заявки', can(user, 'leads.service'), newService),
        ...link('/crm/service-site', 'Сайт сервиса', can(user, 'service.site')),
      ],
    },
    ...link('/crm/customers', 'Клиенты', can(user, 'customers.read')),
    ...link('/crm/settings', 'Настройки', can(user, 'settings.manage') || user.role === 'owner'),
  ].filter((e) => !('items' in e) || e.items.length > 0);

  return (
    <div className="crm">
      <aside className="crm-side">
        <Link href="/crm" style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 8px' }}>
          <Logo variant="crm" height={52} />
        </Link>
        <CrmNav nav={nav} />
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
