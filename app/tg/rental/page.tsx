// Мини-приложение → «Прокат»: дела на сегодня и завтра. Сотрудник выдачи видит только свои заказы.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { addMinutes, fmtDate, fmtTime, startOfLocalDay } from '@/lib/dates';
import { orderScope } from '@/lib/crm-data';
import { rub } from '@/lib/money';
import { STATUS_LABEL } from '@/lib/orders';
import { can } from '@/lib/permissions';
import { ActionForm } from '@/components/crm/ActionForm';
import { TgLogin } from '@/components/tg/TgLogin';
import { TgTop } from '@/components/tg/TgTop';
import { vehicleConditionAction, withholdDecisionAction } from '@/app/crm/actions';

export const dynamic = 'force-dynamic';

type O = { id: string; number: string; status: string; pickupAt: Date; returnAt: Date; vehicle: { title: string }; customer: { fullName: string } };

function Item({ o, at, note, warn }: { o: O; at: Date; note: string; warn?: boolean }) {
  return (
    <Link href={`/tg/rental/order/${o.id}`} className={`tg-item${warn ? ' warn' : ''}`}>
      <div className="row" style={{ alignItems: 'baseline' }}>
        <strong>{fmtTime(at)} · {o.vehicle.title}</strong>
        <span className={`small ${warn ? 'error-text' : 'muted'}`}>{note}</span>
      </div>
      <span className="text-2 small">{o.customer.fullName} · {o.number} · {fmtDate(at)}</span>
    </Link>
  );
}

export default async function TgRental() {
  const user = await currentUser();
  if (!user) return <TgLogin />;
  if (!can(user, 'tg.rental')) redirect('/tg');
  const now = new Date();
  const dayEnd = addMinutes(startOfLocalDay(now), 48 * 60);
  const scope = orderScope(user);
  const inc = { vehicle: { select: { title: true } }, customer: { select: { fullName: true } } } as const;

  const [fresh, pickups, returns, preparing, withholds] = await Promise.all([
    can(user, 'rental.read') ? db.rentalOrder.findMany({ where: { status: { in: ['new', 'negotiation'] } }, include: inc, orderBy: { createdAt: 'asc' } }) : [],
    db.rentalOrder.findMany({ where: { ...scope, status: 'confirmed', pickupAt: { lt: dayEnd } }, include: inc, orderBy: { pickupAt: 'asc' } }),
    db.rentalOrder.findMany({ where: { ...scope, status: 'issued', returnAt: { lt: dayEnd } }, include: inc, orderBy: { returnAt: 'asc' } }),
    can(user, 'rental.inspect') || can(user, 'fleet.write') ? db.vehicle.findMany({ where: { condition: 'preparing' }, orderBy: { sortOrder: 'asc' } }) : [],
    can(user, 'deposit.withhold.approve') ? db.withholdRequest.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' } }) : [],
  ]);
  const whOrders = withholds.length ? await db.rentalOrder.findMany({ where: { id: { in: withholds.map((w) => w.orderId) } }, include: inc }) : [];
  const empty = !fresh.length && !pickups.length && !returns.length && !preparing.length && !withholds.length;

  return (
    <div className="stack" style={{ gap: 14, padding: '12px 14px 32px' }}>
      <TgTop user={user} active="rental" />

      {can(user, 'rental.read') ? (
        <div className="grid-2" style={{ gap: 8 }}>
          <Link className="btn btn-quiet" href="/tg/rental/free" style={{ minHeight: 48 }}>Свободные машины</Link>
          {can(user, 'rental.write') ? <Link className="btn btn-primary" href="/tg/rental/new" style={{ minHeight: 48 }}>Новая бронь</Link> : null}
        </div>
      ) : null}

      {withholds.length ? (
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="tg-section-title">Удержания на подтверждение · {withholds.length}</h2>
          {withholds.map((w) => {
            const o = whOrders.find((x) => x.id === w.orderId);
            return (
              <div key={w.id} className="tg-item">
                <strong>{rub(w.amount)} · {o?.vehicle.title}</strong>
                <span className="text-2 small">{o?.customer.fullName} · {o?.number}</span>
                <span className="small">{w.basis}</span>
                <div className="wrap-row" style={{ gap: 6 }}>
                  <ActionForm action={withholdDecisionAction} hidden={{ requestId: w.id, decision: 'approve' }} submit="Подтвердить" />
                  <ActionForm action={withholdDecisionAction} hidden={{ requestId: w.id, decision: 'reject' }} submit="Отклонить" variant="quiet" />
                  {o ? <Link className="btn btn-quiet btn-sm" href={`/tg/rental/order/${o.id}`}>Заказ</Link> : null}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      {fresh.length ? (
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="tg-section-title">Заявки в работе · {fresh.length}</h2>
          <div className="tg-list">{fresh.map((o) => <Item key={o.id} o={o} at={o.pickupAt} note={STATUS_LABEL[o.status]} warn={o.status === 'new'} />)}</div>
        </section>
      ) : null}

      {returns.length ? (
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="tg-section-title">Возвраты · {returns.length}</h2>
          <div className="tg-list">{returns.map((o) => <Item key={o.id} o={o} at={o.returnAt} note={o.returnAt < now ? 'просрочен' : 'возврат'} warn={o.returnAt < now} />)}</div>
        </section>
      ) : null}

      {pickups.length ? (
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="tg-section-title">Выдачи · {pickups.length}</h2>
          <div className="tg-list">{pickups.map((o) => <Item key={o.id} o={o} at={o.pickupAt} note={o.pickupAt < now ? 'время прошло' : 'выдача'} warn={o.pickupAt < now} />)}</div>
        </section>
      ) : null}

      {preparing.length ? (
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="tg-section-title">Подготовка машин · {preparing.length}</h2>
          {preparing.map((v) => (
            <div key={v.id} className="tg-item row" style={{ alignItems: 'center' }}>
              <span>{v.title}</span>
              <ActionForm action={vehicleConditionAction} hidden={{ vehicleId: v.id, condition: 'ready' }} submit="Готова" />
            </div>
          ))}
        </section>
      ) : null}

      {empty ? <div className="empty">На сегодня и завтра дел нет.</div> : null}
    </div>
  );
}
