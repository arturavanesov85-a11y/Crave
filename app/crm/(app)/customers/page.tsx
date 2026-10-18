import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtDate } from '@/lib/dates';
import { directionsOf, DIRECTION_LABEL } from '@/lib/permissions';
import { formatPhone } from '@/lib/orders';

export const metadata = { title: 'Клиенты' };

export default async function Customers({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser('customers.read');
  const dirs = directionsOf(user);
  const q = ((await searchParams).q ?? '').trim();
  const digits = q.replace(/\D/g, '');
  // Сотрудник видит только клиентов своих направлений.
  const customers = await db.customer.findMany({
    where: { directions: { some: { direction: { in: dirs } } }, ...(q ? { OR: [{ fullName: { contains: q } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] } : {}) },
    include: { directions: true, _count: { select: { orders: true, leads: true } } },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
  return (
    <>
      <div className="toolbar">
        <h1>Клиенты</h1>
        <div className="grow" />
        <form className="wrap-row" style={{ gap: 8 }}>
          <input className="input" name="q" defaultValue={q} placeholder="Имя или телефон" style={{ minHeight: 38, width: 240 }} />
          <button className="btn btn-quiet btn-sm" type="submit">Найти</button>
        </form>
      </div>
      <div className="table-box">
        <table className="table">
          <thead><tr><th>Клиент</th><th>Телефон</th><th>Направления</th><th className="num">Заказы</th><th>С нами с</th></tr></thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/crm/customers/${c.id}`} style={{ fontWeight: 600 }}>{c.fullName}</Link></td>
                <td>{formatPhone(c.phone)}</td>
                <td className="small">{c.directions.filter((d) => dirs.includes(d.direction as never)).map((d) => DIRECTION_LABEL[d.direction as keyof typeof DIRECTION_LABEL]).join(', ')}</td>
                <td className="num">{dirs.includes('rental') ? c._count.orders : '—'}</td>
                <td className="small">{fmtDate(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!customers.length ? <p className="muted pad">Клиентов не найдено.</p> : null}
      </div>
    </>
  );
}
