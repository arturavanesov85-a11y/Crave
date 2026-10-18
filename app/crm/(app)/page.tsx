import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { addMinutes, fmtDateTime, fmtTime, startOfLocalDay } from '@/lib/dates';
import { holdInfo, orderScope, usersById } from '@/lib/crm-data';
import { can } from '@/lib/permissions';
import { summarize } from '@/lib/ledger';
import { rub } from '@/lib/money';
import { formatPhone } from '@/lib/orders';

export const metadata = { title: 'Сегодня' };

type Item = { at: Date | null; title: string; vehicle: string; customer: string; who: string; next: string; href: string; warn?: boolean };

export default async function Today() {
  const user = await requireUser(['rental.read', 'rental.read.assigned']);
  const now = new Date();
  const dayStart = startOfLocalDay(now);
  const dayEnd = addMinutes(dayStart, 24 * 60 * 2); // сегодня и завтра
  const scope = orderScope(user);
  const users = await usersById();
  const who = (id: string | null) => (id ? users.get(id)?.fullName ?? '—' : 'не назначен');

  const [pickups, returns, newOrders, negotiation, returned, preparing, withholds, docs, service, allVehicles, nowOcc] = await Promise.all([
    db.rentalOrder.findMany({ where: { ...scope, status: 'confirmed', pickupAt: { lt: dayEnd } }, include: { vehicle: true, customer: true }, orderBy: { pickupAt: 'asc' } }),
    db.rentalOrder.findMany({ where: { ...scope, status: 'issued', returnAt: { lt: dayEnd } }, include: { vehicle: true, customer: true }, orderBy: { returnAt: 'asc' } }),
    can(user, 'rental.read') ? db.rentalOrder.findMany({ where: { status: 'new' }, include: { vehicle: true, customer: true }, orderBy: { createdAt: 'asc' } }) : [],
    can(user, 'rental.read') ? db.rentalOrder.findMany({ where: { status: 'negotiation' }, include: { vehicle: true, customer: true }, orderBy: { pickupAt: 'asc' } }) : [],
    db.rentalOrder.findMany({ where: { ...scope, status: { in: ['returned', 'issued', 'confirmed'] } }, include: { vehicle: true, customer: true, ledger: { select: { kind: true, amount: true } } } }),
    db.vehicle.findMany({ where: { condition: 'preparing' } }),
    can(user, 'deposit.withhold.approve') ? db.withholdRequest.findMany({ where: { status: 'pending' } }) : [],
    can(user, 'fleet.read') ? db.vehicleDocument.findMany({ where: { validUntil: { lt: addMinutes(now, 30 * 24 * 60) } }, include: { vehicle: true } }) : [],
    can(user, 'fleet.read') ? db.vehicle.findMany({ where: { OR: [{ nextServiceAt: { lt: addMinutes(now, 14 * 24 * 60) } }, { nextServiceKm: { not: null } }] } }) : [],
    db.vehicle.count({ where: { condition: { not: 'unavailable' } } }),
    db.occupancy.findMany({ where: { releasedAt: null, kind: { in: ['rental', 'booking'] }, startsAt: { lte: now }, endsAt: { gt: now } } }),
  ]);
  const holds = await holdInfo([...newOrders, ...negotiation].map((o) => o.id));

  const sections: { title: string; items: Item[]; empty: string }[] = [];

  const overdue = returns.filter((o) => o.returnAt < now);
  if (overdue.length) {
    const next = await db.rentalOrder.findMany({ where: { vehicleId: { in: overdue.map((o) => o.vehicleId) }, status: 'confirmed' }, orderBy: { pickupAt: 'asc' } });
    sections.push({
      title: 'Просроченные возвраты',
      empty: '',
      items: overdue.map((o) => {
        const n = next.find((x) => x.vehicleId === o.vehicleId);
        return { at: o.returnAt, title: `${o.number} · просрочка`, vehicle: o.vehicle.title, customer: `${o.customer.fullName}, ${formatPhone(o.customer.phone)}`, who: who(o.assigneeId), next: n ? `Связаться с клиентом. Следующая выдача машины: ${n.number}, ${fmtDateTime(n.pickupAt)}` : 'Связаться с клиентом', href: `/crm/orders/${o.id}`, warn: true };
      }),
    });
  }
  sections.push({
    title: 'Выдачи — сегодня и завтра',
    empty: 'Выдач нет',
    items: pickups.map((o) => ({ at: o.pickupAt, title: o.number + (o.pickupAt < now ? ' · время выдачи прошло' : ''), vehicle: o.vehicle.title, customer: o.customer.fullName, who: who(o.handoverId), next: 'Провести выдачу', href: `/crm/orders/${o.id}/inspection?kind=pickup`, warn: o.pickupAt < now })),
  });
  sections.push({
    title: 'Возвраты — сегодня и завтра',
    empty: 'Возвратов нет',
    items: returns.filter((o) => o.returnAt >= now).map((o) => ({ at: o.returnAt, title: o.number, vehicle: o.vehicle.title, customer: o.customer.fullName, who: who(o.handoverId), next: 'Принять возврат', href: `/crm/orders/${o.id}/inspection?kind=return` })),
  });
  if (can(user, 'rental.read')) {
    sections.push({
      title: 'Новые заявки без обработки',
      empty: 'Все заявки разобраны',
      items: [...newOrders, ...negotiation.filter((o) => !holds.get(o.id)?.active)].map((o) => {
        const h = holds.get(o.id);
        const expired = !h?.active;
        return { at: o.createdAt, title: `${o.number} · ${o.status === 'new' ? 'новая' : 'согласование'}`, vehicle: o.vehicle.title, customer: `${o.customer.fullName}, ${formatPhone(o.customer.phone)}`, who: who(o.assigneeId), next: expired ? 'Резерв истёк — проверьте доступность и подтвердите' : `Взять в работу · резерв до ${h?.expiresAt ? fmtTime(h.expiresAt) : '—'}`, href: `/crm/orders/${o.id}`, warn: expired };
      }),
    });
  }
  sections.push({
    title: 'Подготовка автомобилей',
    empty: 'Все автомобили готовы',
    items: preparing.map((v) => ({ at: null, title: v.title, vehicle: v.title, customer: '—', who: '—', next: 'Подтвердить готовность к выдаче', href: `/crm/vehicles/${v.id}` })),
  });

  const money = returned.map((o) => ({ o, m: summarize(o.ledger) }));
  const debts = money.filter(({ o, m }) => m.debt > 0 && (o.status !== 'confirmed' || o.pickupAt < dayEnd));
  const deposits = money.filter(({ o, m }) => o.status === 'returned' && m.depositBalance > 0);
  if (can(user, 'payment.accept') || can(user, 'finance.view')) {
    sections.push({
      title: 'Оплаты и залоги',
      empty: 'Задолженностей и залогов к возврату нет',
      items: [
        ...debts.map(({ o, m }) => ({ at: o.pickupAt, title: `${o.number} · долг ${rub(m.debt)}`, vehicle: o.vehicle.title, customer: o.customer.fullName, who: who(o.assigneeId), next: 'Принять оплату', href: `/crm/orders/${o.id}?tab=money`, warn: o.status !== 'confirmed' })),
        ...deposits.map(({ o, m }) => ({ at: o.actualReturnAt, title: `${o.number} · залог ${rub(m.depositBalance)}`, vehicle: o.vehicle.title, customer: o.customer.fullName, who: who(o.assigneeId), next: 'Вернуть или удержать залог', href: `/crm/orders/${o.id}?tab=money` })),
        ...withholds.map((w) => ({ at: w.createdAt, title: `Удержание ${rub(w.amount)} ждёт решения`, vehicle: '—', customer: '—', who: who(w.requestedBy), next: 'Подтвердить или отклонить', href: `/crm/orders/${w.orderId}?tab=money`, warn: true })),
      ],
    });
  }
  if (can(user, 'fleet.read')) {
    const svc = service.filter((v) => (v.nextServiceAt && v.nextServiceAt < addMinutes(now, 14 * 1440)) || (v.nextServiceKm != null && v.mileageKm >= v.nextServiceKm - 1000));
    const items: Item[] = [
      ...docs.map((d) => ({ at: d.validUntil, title: `${d.title}: ${d.validUntil! < now ? 'истёк' : 'истекает'}`, vehicle: d.vehicle.title, customer: '—', who: '—', next: 'Продлить документ', href: `/crm/vehicles/${d.vehicleId}`, warn: d.validUntil! < now })),
      ...svc.map((v) => ({ at: v.nextServiceAt, title: 'Плановое ТО', vehicle: v.title, customer: '—', who: '—', next: `Запланировать ТО${v.nextServiceKm ? ` (пробег ${v.mileageKm} из ${v.nextServiceKm} км)` : ''}`, href: `/crm/vehicles/${v.id}` })),
    ];
    if (items.length) sections.push({ title: 'Документы и ТО', empty: '', items });
  }

  const busyNow = new Set(nowOcc.map((o) => o.vehicleId)).size;

  return (
    <>
      <div className="toolbar">
        <h1>Сегодня</h1>
        <span className="muted">{new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'long', day: 'numeric', month: 'long' }).format(now)}</span>
        <div className="grow" />
        {can(user, 'rental.write') ? <Link className="btn btn-primary btn-sm" href="/crm/orders/new">Новый заказ</Link> : null}
      </div>

      {can(user, 'finance.view') || user.role === 'rental_head' ? (
        <div className="kpis">
          <div className="card kpi"><span className="muted small">Загрузка сейчас</span><b>{busyNow} из {allVehicles}</b></div>
          <div className="card kpi"><span className="muted small">Просрочки возврата</span><b className={overdue.length ? 'warn' : ''}>{overdue.length}</b></div>
          <div className="card kpi"><span className="muted small">Долги клиентов</span><b>{rub(debts.reduce((s, d) => s + d.m.debt, 0))}</b></div>
          <div className="card kpi"><span className="muted small">Залоги к возврату</span><b>{rub(deposits.reduce((s, d) => s + d.m.depositBalance, 0))}</b></div>
        </div>
      ) : null}

      {sections.map((s) => (
        <section key={s.title} className="card pad stack" style={{ gap: 8 }}>
          <h2>{s.title} {s.items.length ? <span className="muted">· {s.items.length}</span> : null}</h2>
          {s.items.length ? (
            <ul className="list">
              {s.items.map((i, idx) => (
                <li key={idx}>
                  <span style={{ flex: '0 0 110px' }} className={i.warn ? 'warn' : 'muted'}>{i.at ? fmtDateTime(i.at) : '—'}</span>
                  <span style={{ flex: '2 1 220px', display: 'flex', flexDirection: 'column' }}>
                    <strong className={i.warn ? 'warn' : ''}>{i.title}</strong>
                    <span className="text-2 small">{i.vehicle} · {i.customer}</span>
                  </span>
                  <span className="muted small" style={{ flex: '1 1 140px' }}>{i.who}</span>
                  <Link className={`btn btn-sm ${i.warn ? 'btn-primary' : ''}`} href={i.href}>{i.next}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{s.empty}</p>
          )}
        </section>
      ))}
    </>
  );
}
