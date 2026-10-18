import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { can, directionsOf, roleLabel } from '@/lib/permissions';
import { db } from '@/lib/db';
import { logout } from '../actions';
import { CrmNav } from './CrmNav';

export const dynamic = 'force-dynamic';
export const metadata = { title: { default: 'CRM', template: '%s — CRM CRAVE' }, robots: { index: false } };

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const dirs = directionsOf(user);
  const newLeads = await db.lead.count({ where: { status: 'new', direction: { in: dirs } } });
  const items = [
    { href: '/crm', label: 'Сегодня', show: can(user, 'rental.read') || can(user, 'rental.read.assigned') },
    { href: '/crm/calendar', label: 'Календарь', show: can(user, 'rental.read') },
    { href: '/crm/orders', label: 'Заказы', show: can(user, 'rental.read') || can(user, 'rental.read.assigned') },
    { href: '/crm/leads', label: 'Заявки', show: dirs.length > 0 && (can(user, 'leads.rental') || can(user, 'leads.sales') || can(user, 'leads.service')), count: newLeads },
    { href: '/crm/vehicles', label: 'Автомобили', show: can(user, 'fleet.read') },
    { href: '/crm/customers', label: 'Клиенты', show: can(user, 'customers.read') },
    { href: '/crm/finance', label: 'Финансы', show: can(user, 'finance.view') },
    { href: '/crm/settings', label: 'Настройки', show: can(user, 'settings.manage') || can(user, 'users.manage') },
  ].filter((i) => i.show);

  return (
    <div className="crm">
      <aside className="crm-side">
        <Link href="/crm" style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 8px' }}>
          <span className="logo" style={{ fontSize: 24 }}>CRAVE</span>
          <span className="muted small">CRM</span>
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
