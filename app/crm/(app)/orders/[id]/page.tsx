import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { db, json } from '@/lib/db';
import { daysWord, fmtDateTime, toLocalInput } from '@/lib/dates';
import { holdInfo, usersById } from '@/lib/crm-data';
import { DEPOSIT_STATUS_LABEL, KIND_LABEL as LEDGER_LABEL, METHOD_LABEL, PAYMENT_STATUS_LABEL, summarize } from '@/lib/ledger';
import { rub } from '@/lib/money';
import { eligibility } from '@/lib/customers';
import { formatPhone, freeAlternatives, returnExtras, STATUS_LABEL, type QuoteOk, type Terms } from '@/lib/orders';
import { can } from '@/lib/permissions';
import { ActionDialog, ActionForm } from '@/components/crm/ActionForm';
import { assignAction, cancelOrderAction, chargeAction, completeOrderAction, commentAction, extendOrderAction, moneyAction, orderStepAction, replaceVehicleAction, reverseAction, withholdDecisionAction, withholdRequestAction } from '../../../actions';

export const metadata = { title: 'Заказ' };

const TABS: [string, string][] = [['terms', 'Условия'], ['money', 'Оплаты'], ['handover', 'Выдача и возврат'], ['docs', 'Документы'], ['history', 'История']];
const CHECK_LABEL: Record<string, string> = { docs: 'Документы', keys: 'Ключи', clean: 'Чистота', kit: 'Комплектность', tires: 'Шины', lights: 'Свет' };

function MethodSelect() {
  return (
    <label className="field">Способ
      <select className="input" name="method" defaultValue="transfer">
        <option value="transfer">Перевод</option><option value="card">Карта</option><option value="cash">Наличные</option>
      </select>
    </label>
  );
}

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser(['rental.read', 'rental.read.assigned']);
  const { id } = await params;
  const tab = (await searchParams).tab ?? 'terms';
  const o = await db.rentalOrder.findUnique({
    where: { id },
    include: {
      vehicle: true,
      customer: true,
      events: { orderBy: { createdAt: 'desc' } },
      comments: { orderBy: { createdAt: 'asc' } },
      inspections: { include: { photos: true, damages: true }, orderBy: { performedAt: 'asc' } },
      ledger: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!o) notFound();
  if (!can(user, 'rental.read') && o.handoverId !== user.id) redirect('/crm/no-access');

  const [users, holds, withholds, openDamages, staff] = await Promise.all([
    usersById(),
    holdInfo([o.id]),
    db.withholdRequest.findMany({ where: { orderId: id }, orderBy: { createdAt: 'desc' } }),
    db.damage.findMany({ where: { vehicleId: o.vehicleId, status: 'open' }, orderBy: { createdAt: 'desc' } }),
    db.user.findMany({ where: { isActive: true, role: { in: ['owner', 'rental_head', 'rental_manager', 'handover'] } }, orderBy: { fullName: 'asc' } }),
  ]);
  const name = (uid: string | null) => (uid ? users.get(uid)?.fullName ?? '—' : '—');
  const terms = json<Terms>(o.termsSnapshot, null as never);
  const el = eligibility(o.customer);
  const q = json<QuoteOk>(o.quoteSnapshot, null as never);
  const m = summarize(o.ledger);
  const hold = holds.get(o.id);
  const now = new Date();
  const write = can(user, 'rental.write');
  const overdue = o.status === 'issued' && o.returnAt < now;

  // Предыдущая аренда этой машины просрочена — выдача под риском.
  const blocker = ['new', 'negotiation', 'confirmed'].includes(o.status)
    ? await db.rentalOrder.findFirst({ where: { vehicleId: o.vehicleId, status: 'issued', id: { not: o.id }, returnAt: { lt: now } } })
    : null;
  const alternatives = write && ['new', 'negotiation', 'confirmed'].includes(o.status) ? await freeAlternatives(o) : [];
  const pickupInsp = o.inspections.find((i) => i.kind === 'pickup');
  const returnInsp = o.inspections.find((i) => i.kind === 'return');

  let next: React.ReactNode = null;
  if (write && o.status === 'new') next = <ActionForm action={orderStepAction} hidden={{ id, step: 'take' }} submit="Взять в работу" />;
  else if (write && o.status === 'negotiation') next = <ActionForm action={orderStepAction} hidden={{ id, step: 'confirm' }} submit="Подтвердить бронь" />;
  else if (o.status === 'confirmed' && can(user, 'rental.inspect')) next = <Link className="btn btn-primary btn-sm" href={`/crm/orders/${id}/inspection?kind=pickup`}>Провести выдачу</Link>;
  else if (o.status === 'issued' && can(user, 'rental.inspect')) next = <Link className="btn btn-primary btn-sm" href={`/crm/orders/${id}/inspection?kind=return`}>Принять возврат</Link>;
  else if (o.status === 'returned' && write) {
    const refund = can(user, 'refund.issue');
    const pendingWithhold = withholds.some((w) => w.status === 'pending');
    next = (
      <ActionDialog label="Завершить заказ" title={`Завершить заказ ${o.number}`} action={completeOrderAction} submit="Завершить заказ" variant="primary" hidden={{ id }} description="Расчёт с клиентом проводится в журнал. После завершения заказ уходит в неактивные; долг и остаток залога продолжают учитываться в финансах.">
        <div className="box" style={{ gap: 6 }}>
          <div className="row"><span className="muted">Начислено</span><span>{rub(m.charges)}</span></div>
          <div className="row"><span className="muted">Оплачено</span><span>{rub(m.paid)}</span></div>
          <div className="row" style={{ fontWeight: 600 }}><span>{m.debt >= 0 ? 'К доплате' : 'Переплата'}</span><span className={m.debt > 0 ? 'warn' : ''}>{rub(Math.abs(m.debt))}</span></div>
          <div className="row"><span className="muted">Залог на руках</span><span>{rub(m.depositBalance)}</span></div>
        </div>
        {pendingWithhold ? <p className="warn small">Есть удержание из залога, ожидающее решения руководителя — завершить можно после решения.</p> : null}
        {m.debt > 0 && can(user, 'payment.accept') ? (
          <div className="grid-2">
            <label className="field">Доплата клиента, ₽<input className="input" name="payment" inputMode="decimal" defaultValue={String(m.debt / 100)} /></label>
            <label className="field">Способ<select className="input" name="paymentMethod"><option value="transfer">Перевод</option><option value="card">Карта</option><option value="cash">Наличные</option></select></label>
          </div>
        ) : null}
        {m.debt > 0 ? <label className="check small"><input type="checkbox" name="allowDebt" />Завершить с долгом (останется в «Долги клиентов»)</label> : null}
        {m.debt < 0 ? (refund ? (
          <div className="grid-2">
            <label className="field">Вернуть переплату, ₽<input className="input" name="overpay" inputMode="decimal" defaultValue={String(-m.debt / 100)} /></label>
            <label className="field">Способ<select className="input" name="overpayMethod"><option value="transfer">Перевод</option><option value="card">Карта</option><option value="cash">Наличные</option></select></label>
          </div>
        ) : <p className="muted small">Переплату вернёт руководитель или финансист.</p>) : null}
        {m.depositBalance > 0 ? (refund ? (
          <>
            <div className="grid-2">
              <label className="field">Вернуть залог сейчас, ₽<input className="input" name="depositRefund" inputMode="decimal" defaultValue={String(Math.max(0, m.depositBalance - 2000000) / 100)} /></label>
              <label className="field">Способ<select className="input" name="depositMethod"><option value="transfer">Перевод</option><option value="card">Карта</option><option value="cash">Наличные</option></select></label>
            </div>
            <label className="field">Остаток держать на проверку штрафов, дней<input className="input" name="holdDays" type="number" min={0} defaultValue={21} /></label>
          </>
        ) : (
          <>
            <input type="hidden" name="holdDays" value="21" />
            <p className="muted small">Залог вернёт руководитель или финансист; заказ появится у них в «Залоги к возврату».</p>
          </>
        )) : null}
      </ActionDialog>
    );
  }

  const extras = o.status === 'issued' ? returnExtras(o, q, terms, pickupInsp?.mileageKm ?? null, o.vehicle.mileageKm, now) : null;

  return (
    <>
      <div className="wrap-row small"><Link href="/crm/orders">← Заказы</Link><Link href={`/crm/calendar?start=${toLocalInput(o.pickupAt).slice(0, 10)}`}>Календарь</Link></div>

      <section className="card pad stack">
        <div className="wrap-row" style={{ gap: '10px 12px' }}>
          <h1>Заказ {o.number}</h1>
          <span className={`tag ${o.status === 'confirmed' ? 'gold' : ''}`}>{STATUS_LABEL[o.status]}</span>
          {overdue ? <span className="tag warn">Просрочка возврата</span> : null}
          {m.charges ? <span className="tag">Оплата: {PAYMENT_STATUS_LABEL[m.paymentStatus]}</span> : null}
          <span className="tag">Залог: {DEPOSIT_STATUS_LABEL[m.depositStatus]}{m.depositBalance ? ` · ${rub(m.depositBalance)}` : ''}</span>
          {hold && hold.kind === 'hold' ? <span className={`tag ${hold.active ? '' : 'warn'}`}>{hold.active ? `Резерв до ${fmtDateTime(hold.expiresAt)}` : 'Резерв истёк'}</span> : null}
          <div className="grow" />
          {next}
        </div>
        <div className="facts-grid">
          <div><span className="k">Клиент</span>{can(user, 'customers.read') ? <Link href={`/crm/customers/${o.customerId}`} style={{ fontWeight: 600, color: 'var(--text)' }}>{o.customer.fullName}</Link> : <strong>{o.customer.fullName}</strong>}<a href={`tel:+${o.customer.phone}`} className="text-2">{formatPhone(o.customer.phone)}</a>{el.issues.map((i) => <span key={i} className="warn small">{i}</span>)}{el.unknown.length && ['new', 'negotiation', 'confirmed'].includes(o.status) ? <span className="muted small">не заполнено: {el.unknown.join(', ')}</span> : null}</div>
          <div><span className="k">Автомобиль</span><Link href={`/crm/vehicles/${o.vehicleId}`} style={{ fontWeight: 600, color: 'var(--text)' }}>{o.vehicle.title}</Link><span className="text-2">{o.vehicle.colorExterior} · {o.vehicle.year}</span></div>
          <div><span className="k">Срок</span><strong>{fmtDateTime(o.pickupAt)} → {fmtDateTime(o.returnAt)}</strong><span className="text-2">{daysWord(q.days)}{o.actualPickupAt ? ` · выдан ${fmtDateTime(o.actualPickupAt)}` : ''}{o.actualReturnAt ? ` · возвращён ${fmtDateTime(o.actualReturnAt)}` : ''}{o.closedAt ? ` · завершён ${fmtDateTime(o.closedAt)}` : ''}</span></div>
          <div><span className="k">Стоимость</span><strong>{rub(m.charges || q.total)}</strong>{m.charges ? <span className={m.debt > 0 ? 'warn' : 'gold'}>{m.debt > 0 ? `долг ${rub(m.debt)}` : m.debt < 0 ? `переплата ${rub(-m.debt)}` : 'оплачено'}</span> : <span className="muted">начислится при подтверждении</span>}</div>
          <div><span className="k">Ответственный</span><strong>{name(o.assigneeId)}</strong><span className="text-2">выдача: {name(o.handoverId)}</span></div>
        </div>
        {write && !['closed', 'cancelled', 'no_show'].includes(o.status) ? (
          <div className="wrap-row">
            {['new', 'negotiation'].includes(o.status) ? <ActionForm action={orderStepAction} hidden={{ id, step: 'hold' }} submit="Продлить резерв" variant="quiet" /> : null}
            {['new'].includes(o.status) ? <ActionForm action={orderStepAction} hidden={{ id, step: 'confirm' }} submit="Сразу подтвердить бронь" variant="quiet" /> : null}
            {['negotiation', 'confirmed', 'issued'].includes(o.status) ? (
              <ActionDialog label="Продлить" title="Продление аренды" action={extendOrderAction} submit="Продлить" hidden={{ id }} description="Проверяется следующая бронь этой машины с учётом подготовки. Стоимость пересчитывается по снимку тарифа заказа.">
                <label className="field">Новая дата возврата<input className="input" type="datetime-local" name="returnAt" defaultValue={toLocalInput(new Date(o.returnAt.getTime() + 86400000))} required /></label>
              </ActionDialog>
            ) : null}
            {['new', 'negotiation', 'confirmed'].includes(o.status) ? (
              <ActionDialog label="Заменить автомобиль" title="Замена автомобиля" action={replaceVehicleAction} submit="Заменить" hidden={{ id }} description="Показаны машины, свободные на этот период. Цена заказа сохраняется по снимку.">
                {alternatives.length ? (
                  <label className="field">Автомобиль<select className="input" name="vehicleId">{alternatives.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label>
                ) : <p className="warn">Свободных машин на этот период нет — передайте вопрос руководителю.</p>}
                <label className="field">Причина<input className="input" name="reason" required /></label>
              </ActionDialog>
            ) : null}
            <ActionDialog label="Назначить" title="Ответственные" action={assignAction} submit="Сохранить" hidden={{ id }}>
              <label className="field">Ответственный менеджер<select className="input" name="assigneeId" defaultValue={o.assigneeId ?? ''}><option value="">—</option>{staff.filter((s) => s.role !== 'handover').map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}</select></label>
              <label className="field">Сотрудник выдачи<select className="input" name="handoverId" defaultValue={o.handoverId ?? ''}><option value="">—</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}</select></label>
            </ActionDialog>
            {['new', 'negotiation', 'confirmed'].includes(o.status) ? (
              <ActionDialog label="Отменить" title="Отмена заказа" action={cancelOrderAction} submit="Отменить заказ" variant="danger" hidden={{ id }} description="Бронь будет снята, начисления будут отменены возвратом. Полученные деньги и залог останутся на заказе — решение по ним во вкладке «Оплаты».">
                {o.status === 'confirmed' ? <label className="field">Тип<select className="input" name="status"><option value="cancelled">Отмена</option><option value="no_show">Неявка клиента</option></select></label> : null}
                <label className="field">Причина<input className="input" name="reason" required /></label>
              </ActionDialog>
            ) : null}
          </div>
        ) : null}
      </section>

      {blocker ? (
        <div className="notice warn">
          <strong>Выдача под риском.</strong> Предыдущая аренда этой машины (<Link href={`/crm/orders/${blocker.id}`}>{blocker.number}</Link>) просрочена с {fmtDateTime(blocker.returnAt)}. Подготовка — {terms.prepBufferMinutes / 60} ч.
          {alternatives.length ? ` Свободны: ${alternatives.slice(0, 4).map((a) => a.title).join(', ')}.` : ' Свободных машин нет — передайте руководителю.'}
        </div>
      ) : null}
      {o.status === 'cancelled' || o.status === 'no_show' ? <div className="notice">Причина: {o.cancelReason}</div> : null}

      <div className="cols">
        <section className="main card" style={{ overflow: 'hidden' }}>
          <nav className="tabs" aria-label="Разделы заказа">
            {TABS.map(([k, l]) => <Link key={k} href={`?tab=${k}`} aria-current={tab === k ? 'page' : undefined} scroll={false}>{l}</Link>)}
          </nav>
          <div className="pad stack">
            {tab === 'terms' ? (
              <>
                <p className="muted small">Снимок условий от {fmtDateTime(new Date(terms.capturedAt))}. Изменение общего прайса этот заказ не пересчитывает.</p>
                <table className="table"><tbody>
                  <tr><td className="muted">Тариф</td><td className="num">«{q.tier.label}» · {rub(q.dailyRate)} / сутки</td></tr>
                  <tr><td className="muted">Оплачиваемый срок</td><td className="num">{daysWord(q.days)}</td></tr>
                  <tr><td className="muted">Аренда</td><td className="num">{rub(q.rent)}</td></tr>
                  {q.services.map((s) => <tr key={s.code}><td className="muted">{s.name}</td><td className="num">{s.qty} {s.unit} · {rub(s.amount)}</td></tr>)}
                  <tr><td className="muted">Скидка</td><td className="num">{q.discount ? `${rub(q.discount)} · ${q.discountReason}` : 'нет'}</td></tr>
                  <tr><td className="muted">Итого по расчёту</td><td className="num"><strong>{rub(q.total)}</strong></td></tr>
                  <tr><td className="muted">Включённый пробег</td><td className="num">{q.includedKm} км · сверх — {rub(terms.tariff.overmileagePerKm)} / км</td></tr>
                  <tr><td className="muted">Залог</td><td className="num">{rub(terms.tariff.deposit)} · не входит в стоимость</td></tr>
                  <tr><td className="muted">Подготовка после аренды</td><td className="num">{terms.prepBufferMinutes / 60} ч</td></tr>
                  {terms.assumptions.length ? <tr><td className="muted">Не утверждены</td><td className="gold" style={{ textAlign: 'right' }}>{terms.assumptions.join(', ')}</td></tr> : null}
                </tbody></table>
              </>
            ) : null}

            {tab === 'money' ? (
              <>
                <div className="boxes">
                  <div className="box"><span className="muted small">Начислено</span><b>{rub(m.charges)}</b></div>
                  <div className="box"><span className="muted small">Оплачено</span><b>{rub(m.paid)}</b></div>
                  <div className="box"><span className="muted small">{m.debt >= 0 ? 'Долг' : 'Переплата'}</span><b className={m.debt > 0 ? 'warn' : ''}>{rub(Math.abs(m.debt))}</b></div>
                  <div className="box gold"><span className="muted small">Залог: получен / возвращён / удержан</span><b>{rub(m.depositIn)} / {rub(m.depositRefunded)} / {rub(m.depositWithheld)}</b><span className="text-2 small">Остаток {rub(m.depositBalance)} · требуется {rub(terms.tariff.deposit)}{o.depositReleaseAt && m.depositBalance > 0 ? ` · вернуть после ${fmtDateTime(o.depositReleaseAt)}` : ''}. Не является выручкой.</span></div>
                </div>
                <div className="wrap-row">
                  {can(user, 'payment.accept') ? (
                    <>
                      <ActionDialog label="Принять оплату" title="Оплата" action={moneyAction} submit="Провести" variant="primary" hidden={{ id, kind: 'payment.in' }}>
                        <label className="field">Сумма, ₽<input className="input" name="amount" inputMode="decimal" defaultValue={m.debt > 0 ? String(m.debt / 100) : ''} required /></label>
                        <MethodSelect />
                        <label className="field">Основание<input className="input" name="basis" defaultValue="Оплата аренды" required /></label>
                      </ActionDialog>
                      <ActionDialog label="Принять залог" title="Залог" action={moneyAction} submit="Провести" hidden={{ id, kind: 'deposit.in' }}>
                        <label className="field">Сумма, ₽<input className="input" name="amount" inputMode="decimal" defaultValue={String(Math.max(0, terms.tariff.deposit - m.depositBalance) / 100)} required /></label>
                        <MethodSelect />
                        <label className="field">Основание<input className="input" name="basis" defaultValue="Обеспечительный платёж" required /></label>
                      </ActionDialog>
                    </>
                  ) : null}
                  {can(user, 'refund.issue') ? (
                    <>
                      <ActionDialog label="Вернуть залог" title="Возврат залога" action={moneyAction} submit="Провести" hidden={{ id, kind: 'deposit.refund' }} description="Обычно 20 000 ₽ удерживаются на 21 день для проверки штрафов — их можно вернуть позже отдельной операцией.">
                        <label className="field">Сумма, ₽<input className="input" name="amount" inputMode="decimal" defaultValue={String(Math.max(0, m.depositBalance - 2000000) / 100)} required /></label>
                        <MethodSelect />
                        <label className="field">Основание<input className="input" name="basis" defaultValue="Возврат залога" required /></label>
                      </ActionDialog>
                      <ActionDialog label="Возврат оплаты" title="Возврат оплаты клиенту" action={moneyAction} submit="Провести" hidden={{ id, kind: 'payment.refund' }}>
                        <label className="field">Сумма, ₽<input className="input" name="amount" inputMode="decimal" defaultValue={m.debt < 0 ? String(-m.debt / 100) : ''} required /></label>
                        <MethodSelect />
                        <label className="field">Основание<input className="input" name="basis" required /></label>
                      </ActionDialog>
                    </>
                  ) : null}
                  {write ? (
                    <ActionDialog label="Доп. начисление" title="Дополнительное начисление" action={chargeAction} submit="Начислить" hidden={{ id, type: 'charge' }} description="Перепробег, опоздание, мойка, топливо и т. п. Основание обязательно.">
                      <label className="field">Сумма, ₽<input className="input" name="amount" inputMode="decimal" required /></label>
                      <label className="field">Основание<input className="input" name="basis" required /></label>
                    </ActionDialog>
                  ) : null}
                  {can(user, 'discount.apply') ? (
                    <ActionDialog label="Скидка" title="Скидка" action={chargeAction} submit="Применить" hidden={{ id, type: 'discount' }}>
                      <label className="field">Сумма, ₽<input className="input" name="amount" inputMode="decimal" required /></label>
                      <label className="field">Причина<input className="input" name="basis" required /></label>
                    </ActionDialog>
                  ) : null}
                  {can(user, 'deposit.withhold.request') && m.depositBalance > 0 ? (
                    <ActionDialog label="Удержать из залога" title="Запрос на удержание" action={withholdRequestAction} submit="Отправить на подтверждение" hidden={{ id }} description="Удержание проводится только после подтверждения руководителем.">
                      <label className="field">Сумма, ₽<input className="input" name="amount" inputMode="decimal" required /></label>
                      <label className="field">Основание (повреждение, штраф…)<textarea className="input" name="basis" required /></label>
                    </ActionDialog>
                  ) : null}
                </div>

                {withholds.length ? (
                  <div className="stack" style={{ gap: 8 }}>
                    <h2>Удержания</h2>
                    <ul className="list">
                      {withholds.map((w) => (
                        <li key={w.id}>
                          <span style={{ flex: '1 1 260px' }}><strong>{rub(w.amount)}</strong> · {w.basis}<br /><span className="muted small">{name(w.requestedBy)}, {fmtDateTime(w.createdAt)}</span></span>
                          <span className={`tag ${w.status === 'pending' ? 'warn' : ''}`}>{w.status === 'pending' ? 'ждёт решения' : w.status === 'approved' ? `подтверждено: ${name(w.decidedBy)}` : `отклонено: ${name(w.decidedBy)}`}</span>
                          {w.status === 'pending' && can(user, 'deposit.withhold.approve') ? (
                            <span className="wrap-row">
                              <ActionForm action={withholdDecisionAction} hidden={{ requestId: w.id, decision: 'approve' }} submit="Подтвердить" />
                              <ActionForm action={withholdDecisionAction} hidden={{ requestId: w.id, decision: 'reject' }} submit="Отклонить" variant="quiet" />
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <h2>Операции</h2>
                <div className="table-box">
                  <table className="table">
                    <thead><tr><th>Дата</th><th>Операция</th><th>Основание</th><th className="num">Сумма</th><th>Кто</th><th /></tr></thead>
                    <tbody>
                      {o.ledger.map((e) => {
                        const reversed = o.ledger.some((x) => x.reversesId === e.id);
                        return (
                          <tr key={e.id} style={reversed || e.reversesId ? { opacity: 0.6 } : undefined}>
                            <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.occurredAt)}</td>
                            <td>{e.reversesId ? 'Возврат · ' : ''}{LEDGER_LABEL[e.kind] ?? e.kind}{e.method ? <div className="muted small">{METHOD_LABEL[e.method]}</div> : null}</td>
                            <td>{e.basis}</td>
                            <td className="num">{rub(e.amount)}</td>
                            <td className="small">{name(e.createdById)}{e.approvedById ? <div className="muted">подтв.: {name(e.approvedById)}</div> : null}</td>
                            <td>
                              {can(user, 'ledger.reverse') && !e.reversesId && !reversed ? (
                                <ActionDialog label="Возврат" title="Возврат операции" action={reverseAction} submit="Сделать возврат" hidden={{ entryId: e.id }} description={`${LEDGER_LABEL[e.kind]} ${rub(e.amount)}. Операция не удаляется — создаётся обратная запись с причиной, обе остаются в истории.`}>
                                  <label className="field">Причина<input className="input" name="basis" required /></label>
                                </ActionDialog>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!o.ledger.length ? <p className="muted pad">Операций нет. Аренда начисляется при подтверждении брони.</p> : null}
                </div>
              </>
            ) : null}

            {tab === 'handover' ? (
              <>
                {extras ? (
                  <div className="notice">По текущему пробегу машины в CRM ({o.vehicle.mileageKm} км): {extras.overKm ? `перепробег ${extras.overKm} км ≈ ${rub(extras.overAmount)}` : 'перепробега нет'}{extras.lateDays ? `, опоздание ${daysWord(extras.lateDays)} ≈ ${rub(extras.lateAmount)}` : ''}. Точные цифры — при осмотре на возврате.</div>
                ) : null}
                <div className="boxes">
                  {[['pickup', 'Выдача', pickupInsp] as const, ['return', 'Возврат', returnInsp] as const].map(([k, label, insp]) => (
                    <div className="box" key={k}>
                      <strong>{label}</strong>
                      {insp ? (
                        <>
                          <span className="text-2">{fmtDateTime(insp.performedAt)} · {name(insp.performedBy)}</span>
                          <span>Пробег {insp.mileageKm.toLocaleString('ru-RU')} км · топливо {insp.fuelPercent}%</span>
                          <span className="small text-2">{Object.entries(json<Record<string, boolean>>(insp.checklist, {})).map(([c, v]) => `${CHECK_LABEL[c] ?? c}: ${v ? 'да' : 'нет'}`).join(' · ')}</span>
                          {insp.notes ? <span className="small">{insp.notes}</span> : null}
                          {insp.damages.length ? <span className="small warn">Новые повреждения: {insp.damages.map((d) => `${d.location} — ${d.description}`).join('; ')}</span> : null}
                          <div className="wrap-row" style={{ gap: 6 }}>
                            {insp.photos.map((p) => (
                              <a key={p.id} href={`/api/files/${p.id}`} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`/api/files/${p.id}`} alt="Фото осмотра" style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} />
                              </a>
                            ))}
                          </div>
                        </>
                      ) : (
                        <span className="muted">{k === 'pickup' ? `Не проведена · план ${fmtDateTime(o.pickupAt)}` : `План ${fmtDateTime(o.returnAt)}`}</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="box">
                  <strong>Известные повреждения автомобиля</strong>
                  {openDamages.length ? (
                    <ul className="list">{openDamages.map((d) => <li key={d.id}><span style={{ flex: '1 1 200px' }}><strong>{d.location}</strong> — {d.description}</span><span className="muted small">{fmtDateTime(d.createdAt)}</span></li>)}</ul>
                  ) : <span className="muted">Не зафиксированы</span>}
                </div>
              </>
            ) : null}

            {tab === 'docs' ? (
              <table className="table"><tbody>
                <tr><td>Договор аренды</td><td className="num gold">шаблон не утверждён</td></tr>
                <tr><td>Акт приёма-передачи</td><td className="num muted">{pickupInsp ? `осмотр ${fmtDateTime(pickupInsp.performedAt)}` : 'после выдачи'}</td></tr>
                <tr><td>Паспорт и водительское удостоверение</td><td className="num muted">{can(user, 'customer.docs.view') ? 'загрузка документов клиента — в следующей версии' : 'нет доступа'}</td></tr>
              </tbody></table>
            ) : null}

            {tab === 'history' ? (
              <ul className="list">
                {o.events.map((e) => <li key={e.id}><span className="muted" style={{ flex: '0 0 120px' }}>{fmtDateTime(e.createdAt)}</span><span style={{ flex: '1 1 300px' }}>{e.text}</span><span className="muted small">{e.actorId ? name(e.actorId) : 'сайт'}</span></li>)}
              </ul>
            ) : null}
          </div>
        </section>

        <aside className="aside">
          <section className="card pad stack" style={{ gap: 10 }}>
            <h2>Комментарии</h2>
            {o.comments.map((c) => <div key={c.id} className="small"><span className="muted">{name(c.authorId)} · {fmtDateTime(c.createdAt)}</span><div>{c.body}</div></div>)}
            {!o.comments.length ? <span className="muted small">Пока нет</span> : null}
            <ActionForm action={commentAction} hidden={{ id }} submit="Добавить" variant="quiet" className="stack" style={{ gap: 8 }}>
              <textarea className="input" name="body" rows={2} aria-label="Новый комментарий" required />
            </ActionForm>
          </section>
          {o.leadId ? <Link className="small" href="/crm/leads">Исходная заявка с сайта →</Link> : null}
        </aside>
      </div>
    </>
  );
}
