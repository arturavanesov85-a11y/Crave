import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
import { orderScope } from '@/lib/crm-data';
import { summarize, PAYMENT_STATUS_LABEL } from '@/lib/ledger';
import { rub } from '@/lib/money';
import { formatPhone, STATUS_LABEL } from '@/lib/orders';
import { can } from '@/lib/permissions';

export const metadata = { title: 'Заказы' };

const FILTERS: [string, string][] = [['active', 'Активные'], ['new', 'Новые'], ['negotiation', 'Согласование'], ['confirmed', 'Брони'], ['issued', 'Выданы'], ['returned', 'Ждут завершения'], ['inactive', 'Неактивные'], ['closed', 'Завершённые'], ['cancelled', 'Отменённые'], ['all', 'Все']];

export default async function Orders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser(['rental.read', 'rental.read.assigned']);
  const sp = await searchParams;
  const f = sp.status ?? 'active';
  const q = (sp.q ?? '').trim();
  const where: Prisma.RentalOrderWhereInput = { ...orderScope(user) };
  if (f === 'active') where.status = { in: ['new', 'negotiation', 'confirmed', 'issued', 'returned'] };
  else if (f === 'cancelled') where.status = { in: ['cancelled', 'no_show'] };
  else if (f === 'inactive') where.status = { in: ['closed', 'cancelled', 'no_show'] };
  else if (f !== 'all') where.status = f;
  if (q) {
    const digits = q.replace(/\D/g, '');
    where.OR = [{ number: { contains: q } }, { customer: { fullName: { contains: q } } }, ...(digits.length >= 3 ? [{ customer: { phone: { contains: digits } } }] : [])];
  }
  const orders = await db.rentalOrder.findMany({ where, include: { vehicle: true, customer: true, ledger: { select: { kind: true, amount: true } } }, orderBy: { pickupAt: 'asc' }, take: 300 });

  return (
    <>
      <div className="toolbar">
        <h1>Заказы</h1>
        <div className="grow" />
        <form className="wrap-row" style={{ gap: 8 }}>
          <input type="hidden" name="status" value={f} />
          <input className="input" name="q" defaultValue={q} placeholder="Номер, имя или телефон" style={{ minHeight: 38, width: 240 }} />
          <button className="btn btn-quiet btn-sm" type="submit">Найти</button>
        </form>
        {can(user, 'rental.write') ? <Link className="btn btn-primary btn-sm" href="/crm/orders/new">Новый заказ</Link> : null}
      </div>
      <nav className="wrap-row" style={{ gap: 8 }} aria-label="Фильтр по статусу">
        {FILTERS.map(([k, l]) => <Link key={k} className={`chip${f === k ? ' on' : ''}`} href={`/crm/orders?status=${k}${q ? `&q=${encodeURIComponent(q)}` : ''}`}>{l}</Link>)}
      </nav>
      <div className="table-box">
        <table className="table">
          <thead><tr><th>Номер</th><th>Статус</th><th>Клиент</th><th>Автомобиль</th><th>Срок</th><th className="num">Стоимость</th><th>Оплата</th></tr></thead>
          <tbody>
            {orders.map((o) => {
              const m = summarize(o.ledger);
              const overdue = o.status === 'issued' && o.returnAt < new Date();
              return (
                <tr key={o.id}>
                  <td><Link href={`/crm/orders/${o.id}`} style={{ fontWeight: 600 }}>{o.number}</Link>{o.source === 'site' ? <div className="muted small">с сайта</div> : null}</td>
                  <td><span className={`tag${o.status === 'confirmed' ? ' gold' : ''}${overdue ? ' warn' : ''}`}>{overdue ? 'Просрочка возврата' : STATUS_LABEL[o.status]}</span></td>
                  <td>{o.customer.fullName}<div className="muted small">{formatPhone(o.customer.phone)}</div></td>
                  <td>{o.vehicle.title}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(o.pickupAt)}<div className="muted small">{fmtDateTime(o.returnAt)}</div></td>
                  <td className="num">{rub(m.charges || JSON.parse(o.quoteSnapshot).total)}</td>
                  <td>{m.charges ? <span className={m.debt > 0 ? 'warn' : ''}>{PAYMENT_STATUS_LABEL[m.paymentStatus]}{m.debt > 0 ? ` · долг ${rub(m.debt)}` : ''}</span> : <span className="muted">до подтверждения</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!orders.length ? <p className="muted pad">Заказов нет.</p> : null}
      </div>
    </>
  );
}
