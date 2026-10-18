import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
import { can, directionsOf, DIRECTION_LABEL } from '@/lib/permissions';
import { formatPhone, STATUS_LABEL } from '@/lib/orders';
import { summarize } from '@/lib/ledger';
import { rub } from '@/lib/money';

export const metadata = { title: 'Клиент' };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser('customers.read');
  const dirs = directionsOf(user);
  const c = await db.customer.findUnique({
    where: { id: (await params).id },
    include: { directions: true, orders: { include: { vehicle: true, ledger: { select: { kind: true, amount: true } } }, orderBy: { pickupAt: 'desc' } }, leads: { orderBy: { createdAt: 'desc' } } },
  });
  if (!c) notFound();
  // Общая база клиентов не означает доступ ко всей истории по трём направлениям.
  if (!c.directions.some((d) => dirs.includes(d.direction as never))) redirect('/crm/no-access');
  const showRental = dirs.includes('rental') && can(user, 'rental.read');
  const leads = c.leads.filter((l) => dirs.includes(l.direction as never));

  return (
    <>
      <Link href="/crm/customers" className="small">← Клиенты</Link>
      <section className="card pad stack" style={{ gap: 6 }}>
        <h1>{c.fullName}</h1>
        <a href={`tel:+${c.phone}`}>{formatPhone(c.phone)}</a>
        {c.email ? <span className="text-2">{c.email}</span> : null}
        <span className="muted small">Направления: {c.directions.filter((d) => dirs.includes(d.direction as never)).map((d) => DIRECTION_LABEL[d.direction as keyof typeof DIRECTION_LABEL]).join(', ')}</span>
        {can(user, 'customer.docs.view') ? <span className="muted small">Документы клиента: загрузка — в следующей версии.</span> : null}
      </section>
      {showRental ? (
        <section className="card pad stack">
          <h2>Аренда</h2>
          {c.orders.length ? (
            <ul className="list">
              {c.orders.map((o) => {
                const m = summarize(o.ledger);
                return <li key={o.id}><Link href={`/crm/orders/${o.id}`}>{o.number}</Link><span className="grow">{o.vehicle.title}</span><span className="small">{fmtDateTime(o.pickupAt)}</span><span className="tag">{STATUS_LABEL[o.status]}</span>{m.debt > 0 ? <span className="warn small">долг {rub(m.debt)}</span> : null}</li>;
              })}
            </ul>
          ) : <p className="muted">Заказов нет</p>}
        </section>
      ) : null}
      <section className="card pad stack">
        <h2>Обращения</h2>
        {leads.length ? <ul className="list">{leads.map((l) => <li key={l.id}><span className="small">{fmtDateTime(l.createdAt)}</span><span className="tag">{DIRECTION_LABEL[l.direction as keyof typeof DIRECTION_LABEL]}</span><span className="grow text-2">{l.message ?? '—'}</span></li>)}</ul> : <p className="muted">Нет</p>}
      </section>
    </>
  );
}
