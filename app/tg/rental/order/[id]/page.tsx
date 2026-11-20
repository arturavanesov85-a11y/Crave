// Мини-приложение → «Прокат» → карточка заказа: всё для работы с телефона.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { db, json } from '@/lib/db';
import { fmtDateTime, toLocalInput } from '@/lib/dates';
import { orderMoney, PAYMENT_STATUS_LABEL, DEPOSIT_STATUS_LABEL } from '@/lib/ledger';
import { rub } from '@/lib/money';
import { formatPhone, STATUS_LABEL } from '@/lib/orders';
import { can } from '@/lib/permissions';
import { ActionDialog, ActionForm } from '@/components/crm/ActionForm';
import { CustomerDocs } from '@/components/crm/CustomerDocs';
import { TgLogin } from '@/components/tg/TgLogin';
import { commentAction, extendOrderAction, moneyAction, orderStepAction, withholdRequestAction } from '@/app/crm/actions';

export const dynamic = 'force-dynamic';

const METHODS = (
  <label className="field">Способ
    <select className="input" name="method" defaultValue="card">
      <option value="card">Карта</option><option value="cash">Наличные</option><option value="transfer">Перевод</option>
    </select>
  </label>
);

export default async function TgOrder({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return <TgLogin />;
  if (!can(user, 'tg.rental')) redirect('/tg');
  const o = await db.rentalOrder.findUnique({ where: { id: (await params).id }, include: { vehicle: true, customer: true, inspections: { select: { kind: true } }, events: { orderBy: { createdAt: 'desc' }, take: 6 } } });
  if (!o) notFound();
  if (!can(user, 'rental.read') && !(can(user, 'rental.read.assigned') && o.handoverId === user.id)) redirect('/tg/rental');
  const q = json<{ total?: number; deposit?: number; includedKm?: number; days?: number; hours?: number | null }>(o.quoteSnapshot, {});
  const m = await orderMoney(db, o.id, q.deposit ?? 0);
  const write = can(user, 'rental.write');
  const inspect = can(user, 'rental.inspect');
  const pay = can(user, 'payment.accept');
  const done = new Set(o.inspections.map((i) => i.kind));
  // Каждому своё: деньги видят менеджеры, руководители и финансы; сотрудник выдачи — только осмотр и звонок.
  const seeMoney = write || pay || can(user, 'finance.view');
  const canWithhold = can(user, 'deposit.withhold.request') && ['issued', 'returned'].includes(o.status) && m.depositBalance > 0;
  const hid = { id: o.id };

  return (
    <div className="stack" style={{ gap: 14, padding: '12px 14px 32px' }}>
      <Link href="/tg/rental" className="small">← Дела</Link>
      <div className="stack" style={{ gap: 4 }}>
        <span className="eyebrow">{STATUS_LABEL[o.status]} · {o.number}</span>
        <h1 style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}>{o.vehicle.title}{o.vehicle.plate ? <span className="muted" style={{ fontSize: 15 }}> · {o.vehicle.plate}</span> : null}</h1>
        <span className="text-2">{fmtDateTime(o.pickupAt)} — {fmtDateTime(o.returnAt)}{q.hours ? ` · ${q.hours} ч с водителем` : q.days ? ` · ${q.days} сут.` : ''}</span>
      </div>

      <section className="card pad stack" style={{ gap: 6 }}>
        <strong>{o.customer.fullName}</strong>
        <a href={`tel:+${o.customer.phone}`} className="btn btn-quiet" style={{ minHeight: 44 }}>Позвонить {formatPhone(o.customer.phone)}</a>
        {o.customer.telegramChatId ? <span className="muted small">Клиент получает подтверждения и акты в Telegram.</span> : null}
      </section>

      {/* Главное действие по статусу */}
      <section className="stack" style={{ gap: 8 }}>
        {o.status === 'new' && write ? <ActionForm action={orderStepAction} hidden={{ ...hid, step: 'take' }} submit="Взять в работу" className="stack" /> : null}
        {o.status === 'negotiation' && write ? (
          <div className="grid-2" style={{ gap: 8 }}>
            <ActionForm action={orderStepAction} hidden={{ ...hid, step: 'confirm' }} submit="Подтвердить бронь" className="stack" />
            <ActionForm action={orderStepAction} hidden={{ ...hid, step: 'hold' }} submit="Продлить резерв" variant="quiet" className="stack" />
          </div>
        ) : null}
        {o.status === 'confirmed' && inspect ? <Link className="btn btn-primary" style={{ minHeight: 52 }} href={`/tg/rental/order/${o.id}/inspection?kind=pickup`}>Провести выдачу</Link> : null}
        {o.status === 'issued' && inspect ? <Link className="btn btn-primary" style={{ minHeight: 52 }} href={`/tg/rental/order/${o.id}/inspection?kind=return`}>Принять возврат</Link> : null}
        {o.status === 'returned' ? <p className="muted small">Машина возвращена. Завершить заказ и вернуть залог — в CRM.</p> : null}
      </section>

      {seeMoney ? (
      <section className="card pad stack" style={{ gap: 6 }}>
        <h2 style={{ fontSize: 16 }}>Деньги</h2>
        <div className="row"><span className="muted">Начислено</span><span>{rub(m.charges)}</span></div>
        <div className="row"><span className="muted">Оплачено</span><span>{rub(m.paid)} · {PAYMENT_STATUS_LABEL[m.paymentStatus]}</span></div>
        {m.debt > 0 ? <div className="row"><span className="muted">К оплате</span><strong className="warn">{rub(m.debt)}</strong></div> : null}
        <div className="row"><span className="muted">Залог</span><span>{rub(m.depositBalance)} · {DEPOSIT_STATUS_LABEL[m.depositStatus]}{q.deposit ? ` (нужен ${rub(q.deposit)})` : ''}</span></div>
        {pay && ['confirmed', 'issued', 'returned'].includes(o.status) ? (
          <div className="wrap-row" style={{ gap: 6, marginTop: 4 }}>
            <ActionDialog label="Принять оплату" title="Оплата" action={moneyAction} submit="Провести" hidden={{ ...hid, kind: 'payment.in', key: `${o.id}-pay-${m.paid}` }} variant="primary">
              <label className="field">Сумма, ₽<input className="input" name="amount" inputMode="numeric" defaultValue={m.debt > 0 ? String(m.debt / 100) : ''} required /></label>
              {METHODS}
            </ActionDialog>
            <ActionDialog label="Принять залог" title="Залог" action={moneyAction} submit="Провести" hidden={{ ...hid, kind: 'deposit.in', key: `${o.id}-dep-${m.depositIn}` }}>
              <label className="field">Сумма, ₽<input className="input" name="amount" inputMode="numeric" defaultValue={q.deposit && q.deposit > m.depositBalance ? String((q.deposit - m.depositBalance) / 100) : ''} required /></label>
              {METHODS}
            </ActionDialog>
          </div>
        ) : null}
      </section>
      ) : null}

        {canWithhold ? (
          <ActionDialog label="Удержать из залога" title="Запрос на удержание" action={withholdRequestAction} submit="Отправить руководителю" hidden={hid} description="Руководитель получит запрос в Telegram и подтвердит его.">
            <label className="field">Сумма, ₽<input className="input" name="amount" inputMode="numeric" required /></label>
            <label className="field">Основание<textarea className="input" name="basis" rows={2} placeholder="Скол на бампере, см. фото возврата" required /></label>
          </ActionDialog>
        ) : null}

      {write && ['confirmed', 'issued'].includes(o.status) ? (
        <ActionDialog label="Продлить аренду" title="Продление" action={extendOrderAction} submit="Продлить" hidden={hid} description="CRM проверит, свободна ли машина, и досчитает стоимость.">
          <label className="field">Новая дата и время возврата<input className="input" type="datetime-local" name="returnAt" defaultValue={toLocalInput(o.returnAt)} required /></label>
        </ActionDialog>
      ) : null}

      {done.size ? (
        <section className="wrap-row" style={{ gap: 6 }}>
          {done.has('pickup') ? <a className="btn btn-quiet btn-sm" href={`/api/orders/${o.id}/act?kind=pickup`} target="_blank" rel="noreferrer">Акт выдачи (PDF)</a> : null}
          {done.has('return') ? <a className="btn btn-quiet btn-sm" href={`/api/orders/${o.id}/act?kind=return`} target="_blank" rel="noreferrer">Акт возврата (PDF)</a> : null}
        </section>
      ) : null}

      <CustomerDocs user={user} customerId={o.customerId} />

      <section className="card pad stack" style={{ gap: 8 }}>
        <h2 style={{ fontSize: 16 }}>Комментарий</h2>
        <ActionForm action={commentAction} hidden={hid} submit="Добавить" variant="quiet" className="stack" style={{ gap: 8 }}>
          <textarea className="input" name="body" rows={2} placeholder="Договорились о доставке к 10:00…" required />
        </ActionForm>
        {o.events.length ? (
          <ul className="small text-2" style={{ margin: 0, paddingLeft: 18 }}>
            {o.events.map((e) => <li key={e.id}>{fmtDateTime(e.createdAt)} — {e.text}</li>)}
          </ul>
        ) : null}
      </section>

      {can(user, 'rental.read') ? <a className="btn btn-quiet btn-sm" href={`/crm/orders/${o.id}`}>Открыть в CRM</a> : null}
    </div>
  );
}
