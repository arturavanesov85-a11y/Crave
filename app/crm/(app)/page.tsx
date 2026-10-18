import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { addMinutes, fmtDate, fmtDateTime, fmtTime, startOfLocalDay } from '@/lib/dates';
import { holdInfo, orderScope, usersById } from '@/lib/crm-data';
import { can, directionsOf } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { summarize } from '@/lib/ledger';
import { rub } from '@/lib/money';
import { formatPhone } from '@/lib/orders';

export const metadata = { title: 'Сегодня' };

type Ref = { id: string; label: string } | null;
type Item = { at: Date | null; order: Ref; note?: string; vehicle: Ref; customer: (Ref & { phone?: string }) | null; who: string; next: string; href: string; warn?: boolean };

type O = { id: string; number: string; vehicleId: string; customerId: string; vehicle: { title: string }; customer: { fullName: string; phone: string } };
const refs = (o: O) => ({ order: { id: o.id, label: o.number }, vehicle: { id: o.vehicleId, label: o.vehicle.title }, customer: { id: o.customerId, label: o.customer.fullName, phone: o.customer.phone } });

export default async function Today() {
  const user = await requireUser();
  // Сотрудники автосалона и сервиса начинают со своих заявок.
  if (!can(user, 'rental.read') && !can(user, 'rental.read.assigned')) redirect(directionsOf(user).length ? '/crm/leads' : '/crm/settings');
  const now = new Date();
  const dayStart = startOfLocalDay(now);
  const dayEnd = addMinutes(dayStart, 24 * 60 * 2); // сегодня и завтра
  const scope = orderScope(user);
  const users = await usersById();
  const who = (id: string | null) => (id ? users.get(id)?.fullName ?? '—' : 'не назначен');
  const showCustomers = can(user, 'customers.read');
  const showFleet = can(user, 'fleet.read');

  const [pickups, returns, newOrders, negotiation, withMoney, preparing, withholds, docs, service, allVehicles, nowOcc] = await Promise.all([
    db.rentalOrder.findMany({ where: { ...scope, status: 'confirmed', pickupAt: { lt: dayEnd } }, include: { vehicle: true, customer: true }, orderBy: { pickupAt: 'asc' } }),
    db.rentalOrder.findMany({ where: { ...scope, status: 'issued', returnAt: { lt: dayEnd } }, include: { vehicle: true, customer: true }, orderBy: { returnAt: 'asc' } }),
    can(user, 'rental.read') ? db.rentalOrder.findMany({ where: { status: 'new' }, include: { vehicle: true, customer: true }, orderBy: { createdAt: 'asc' } }) : [],
    can(user, 'rental.read') ? db.rentalOrder.findMany({ where: { status: 'negotiation' }, include: { vehicle: true, customer: true }, orderBy: { pickupAt: 'asc' } }) : [],
    db.rentalOrder.findMany({ where: { ...scope, status: { in: ['returned', 'issued', 'confirmed', 'closed'] } }, include: { vehicle: true, customer: true, ledger: { select: { kind: true, amount: true } } } }),
    db.vehicle.findMany({ where: { condition: 'preparing' } }),
    can(user, 'deposit.withhold.approve') ? db.withholdRequest.findMany({ where: { status: 'pending' } }) : [],
    showFleet ? db.vehicleDocument.findMany({ where: { validUntil: { lt: addMinutes(now, 30 * 24 * 60) } }, include: { vehicle: true } }) : [],
    showFleet ? db.vehicle.findMany({ where: { OR: [{ nextServiceAt: { lt: addMinutes(now, 14 * 24 * 60) } }, { nextServiceKm: { not: null } }] } }) : [],
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
        return { at: o.returnAt, ...refs(o), note: 'просрочка', who: who(o.assigneeId), next: n ? `Связаться с клиентом · следующая выдача ${n.number}, ${fmtDateTime(n.pickupAt)}` : 'Связаться с клиентом', href: `/crm/orders/${o.id}`, warn: true };
      }),
    });
  }
  sections.push({
    title: 'Выдачи — сегодня и завтра',
    empty: 'Выдач нет',
    items: pickups.map((o) => ({ at: o.pickupAt, ...refs(o), note: o.pickupAt < now ? 'время выдачи прошло' : undefined, who: who(o.handoverId), next: 'Провести выдачу', href: `/crm/orders/${o.id}/inspection?kind=pickup`, warn: o.pickupAt < now })),
  });
  sections.push({
    title: 'Возвраты — сегодня и завтра',
    empty: 'Возвратов нет',
    items: returns.filter((o) => o.returnAt >= now).map((o) => ({ at: o.returnAt, ...refs(o), who: who(o.handoverId), next: 'Принять возврат', href: `/crm/orders/${o.id}/inspection?kind=return` })),
  });
  if (can(user, 'rental.read')) {
    sections.push({
      title: 'Новые заявки без обработки',
      empty: 'Все заявки разобраны',
      items: [...newOrders, ...negotiation.filter((o) => !holds.get(o.id)?.active)].map((o) => {
        const h = holds.get(o.id);
        const expired = !h?.active;
        return { at: o.createdAt, ...refs(o), note: o.status === 'new' ? 'новая' : 'согласование', who: who(o.assigneeId), next: expired ? 'Резерв истёк — проверить и подтвердить' : `Взять в работу · резерв до ${h?.expiresAt ? fmtTime(h.expiresAt) : '—'}`, href: `/crm/orders/${o.id}`, warn: expired };
      }),
    });
  }
  const returnedOrders = withMoney.filter((o) => o.status === 'returned');
  sections.push({
    title: 'Завершить после возврата',
    empty: 'Нет заказов, ожидающих завершения',
    items: returnedOrders.map((o) => ({ at: o.actualReturnAt, ...refs(o), who: who(o.assigneeId), next: 'Завершить заказ', href: `/crm/orders/${o.id}?tab=money` })),
  });
  sections.push({
    title: 'Подготовка автомобилей',
    empty: 'Все автомобили готовы',
    items: preparing.map((v) => ({ at: null, order: null, vehicle: { id: v.id, label: v.title }, customer: null, who: '—', next: 'Подтвердить готовность', href: `/crm/vehicles/${v.id}` })),
  });

  const money = withMoney.map((o) => ({ o, m: summarize(o.ledger) }));
  const debts = money.filter(({ o, m }) => m.debt > 0 && (o.status !== 'confirmed' || o.pickupAt < dayEnd));
  const deposits = money.filter(({ o, m }) => o.status === 'closed' && m.depositBalance > 0);
  const depositsDue = deposits.filter(({ o }) => !o.depositReleaseAt || o.depositReleaseAt <= now);
  if (can(user, 'payment.accept') || can(user, 'finance.view')) {
    sections.push({
      title: 'Оплаты и залоги',
      empty: 'Задолженностей и залогов к возврату нет',
      items: [
        ...debts.map(({ o, m }) => ({ at: o.pickupAt, ...refs(o), note: `долг ${rub(m.debt)}`, who: who(o.assigneeId), next: 'Принять оплату', href: `/crm/orders/${o.id}?tab=money`, warn: o.status !== 'confirmed' })),
        ...depositsDue.map(({ o, m }) => ({ at: o.depositReleaseAt, ...refs(o), note: `остаток залога ${rub(m.depositBalance)}`, who: who(o.assigneeId), next: 'Вернуть залог', href: `/crm/orders/${o.id}?tab=money`, warn: true })),
        ...withholds.map((w) => ({ at: w.createdAt, order: null, note: `удержание ${rub(w.amount)} ждёт решения`, vehicle: null, customer: null, who: who(w.requestedBy), next: 'Подтвердить или отклонить', href: `/crm/orders/${w.orderId}?tab=money`, warn: true })),
      ],
    });
  }
  if (showFleet) {
    const svc = service.filter((v) => (v.nextServiceAt && v.nextServiceAt < addMinutes(now, 14 * 1440)) || (v.nextServiceKm != null && v.mileageKm >= v.nextServiceKm - 1000));
    const items: Item[] = [
      ...docs.map((d) => ({ at: d.validUntil, order: null, note: `${d.title}: ${d.validUntil! < now ? 'истёк' : 'истекает'}`, vehicle: { id: d.vehicleId, label: d.vehicle.title }, customer: null, who: '—', next: 'Продлить документ', href: `/crm/vehicles/${d.vehicleId}`, warn: d.validUntil! < now })),
      ...svc.map((v) => ({ at: v.nextServiceAt, order: null, note: `плановое ТО${v.nextServiceKm ? ` (${v.mileageKm} из ${v.nextServiceKm} км)` : ''}`, vehicle: { id: v.id, label: v.title }, customer: null, who: '—', next: 'Запланировать ТО', href: `/crm/vehicles/${v.id}` })),
    ];
    if (items.length) sections.push({ title: 'Документы и ТО', empty: '', items });
  }

  const busyNow = new Set(nowOcc.map((o) => o.vehicleId)).size;
  const heldDeposits = deposits.filter((d) => !depositsDue.includes(d));

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
          <div className="card kpi"><span className="muted small">Залоги на проверке штрафов</span><b>{rub(heldDeposits.reduce((s, d) => s + d.m.depositBalance, 0))}</b>{heldDeposits.length ? <span className="muted small">ближайший возврат {fmtDate(heldDeposits.map((d) => d.o.depositReleaseAt!).sort((a, b) => +a - +b)[0])}</span> : null}</div>
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
                  <span style={{ flex: '2 1 260px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span>
                      {i.order ? <Link href={`/crm/orders/${i.order.id}`} style={{ fontWeight: 600 }}>{i.order.label}</Link> : null}
                      {i.order && i.vehicle ? ' · ' : null}
                      {i.vehicle ? (showFleet ? <Link href={`/crm/vehicles/${i.vehicle.id}`} style={{ color: 'var(--text)', fontWeight: i.order ? 400 : 600 }}>{i.vehicle.label}</Link> : <span>{i.vehicle.label}</span>) : null}
                      {i.note ? <span className={i.warn ? 'warn' : 'text-2'}> · {i.note}</span> : null}
                    </span>
                    {i.customer ? (
                      <span className="small">
                        {showCustomers ? <Link href={`/crm/customers/${i.customer.id}`} className="text-2">{i.customer.label}</Link> : <span className="text-2">{i.customer.label}</span>}
                        {i.customer.phone ? <> · <a href={`tel:+${i.customer.phone}`} className="text-2">{formatPhone(i.customer.phone)}</a></> : null}
                      </span>
                    ) : null}
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
