import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtDateTime, parseLocal, startOfLocalDay, toLocalInput } from '@/lib/dates';
import { can } from '@/lib/permissions';
import { KIND_LABEL, METHOD_LABEL } from '@/lib/ledger';
import { rub } from '@/lib/money';
import { debtsAndDeposits, periodReport, utilization } from '@/lib/reports';
import { usersById } from '@/lib/crm-data';
import { ActionDialog } from '@/components/crm/ActionForm';
import { expenseAction, reverseAction } from '../../actions';

export const metadata = { title: 'Финансы' };

export default async function Finance({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser('finance.view');
  const sp = await searchParams;
  const tab = sp.tab ?? 'reports';
  const today = toLocalInput(new Date()).slice(0, 10);
  const fromStr = sp.from ?? today.slice(0, 8) + '01';
  const toStr = sp.to ?? today;
  const from = parseLocal(fromStr + 'T00:00') ?? startOfLocalDay(new Date());
  const to = new Date((parseLocal(toStr + 'T00:00') ?? new Date()).getTime() + 86400000);
  const q = `from=${fromStr}&to=${toStr}`;

  const tabs: [string, string][] = [['reports', 'Отчёты'], ['ledger', 'Операции'], ['debts', 'Долги и залоги']];

  return (
    <>
      <div className="toolbar">
        <h1>Финансы</h1>
        <div className="grow" />
        <form className="wrap-row" style={{ gap: 8 }}>
          <input type="hidden" name="tab" value={tab} />
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center' }}>с<input className="input" type="date" name="from" defaultValue={fromStr} style={{ minHeight: 38 }} /></label>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center' }}>по<input className="input" type="date" name="to" defaultValue={toStr} style={{ minHeight: 38 }} /></label>
          <button className="btn btn-quiet btn-sm" type="submit">Показать</button>
        </form>
        {can(user, 'export.run') ? <a className="btn btn-quiet btn-sm" href={`/api/export/ledger?${q}`}>Экспорт CSV</a> : null}
        {can(user, 'finance.expenses') ? (
          <ActionDialog label="Расход" title="Общий расход направления" action={expenseAction} submit="Записать" variant="primary" description="Расход по конкретной машине добавляется в её карточке.">
            <label className="field">Сумма, ₽<input className="input" name="amount" inputMode="decimal" required /></label>
            <label className="field">Основание<input className="input" name="basis" placeholder="Аренда площадки, реклама…" required /></label>
            <label className="field">Дата<input className="input" type="date" name="date" defaultValue={today} /></label>
            <label className="field">Способ<select className="input" name="method"><option value="transfer">Перевод</option><option value="card">Карта</option><option value="cash">Наличные</option></select></label>
          </ActionDialog>
        ) : null}
      </div>
      <nav className="tabs" style={{ padding: 0 }}>{tabs.map(([k, l]) => <Link key={k} href={`/crm/finance?tab=${k}&${q}`} aria-current={tab === k ? 'page' : undefined}>{l}</Link>)}</nav>

      {tab === 'reports' ? <Reports from={from} to={to} showResult={can(user, 'finance.result')} /> : null}
      {tab === 'ledger' ? <Ledger from={from} to={to} canReverse={can(user, 'ledger.reverse')} /> : null}
      {tab === 'debts' ? <Debts /> : null}
    </>
  );
}

async function Reports({ from, to, showResult }: { from: Date; to: Date; showResult: boolean }) {
  const [r, util] = await Promise.all([periodReport(from, to), utilization(from, to)]);
  const cashIn = r.paymentsIn, cashOut = r.paymentsRefund + r.expensesVehicle + r.expensesGeneral;
  return (
    <>
      <section className="stack">
        <h2>Поступления и выплаты</h2>
        <div className="kpis">
          <div className="card kpi"><span className="muted small">Оплаты клиентов</span><b>{rub(r.paymentsIn)}</b></div>
          <div className="card kpi"><span className="muted small">Возвраты оплат</span><b>{rub(r.paymentsRefund)}</b></div>
          <div className="card kpi"><span className="muted small">Расходы (машины / общие)</span><b>{rub(r.expensesVehicle + r.expensesGeneral)}</b><span className="muted small">{rub(r.expensesVehicle)} / {rub(r.expensesGeneral)}</span></div>
          <div className="card kpi"><span className="muted small">Итог денег (без залогов)</span><b>{rub(cashIn - cashOut)}</b></div>
        </div>
        <div className="kpis">
          <div className="card kpi"><span className="muted small">Залоги получены</span><b>{rub(r.depositsIn)}</b></div>
          <div className="card kpi"><span className="muted small">Залоги возвращены</span><b>{rub(r.depositsOut)}</b></div>
          <div className="card kpi"><span className="muted small">Удержано из залогов</span><b>{rub(r.depositsWithheld)}</b></div>
          <div className="card kpi"><span className="muted small">Начислено за период</span><b>{rub(r.charges)}</b><span className="muted small">аренда, услуги, доплаты − скидки</span></div>
        </div>
        <p className="muted small">Залог — не выручка: учитывается отдельно. Предоплата показывается в оплатах, заработанный доход — в начислениях.</p>
      </section>
      <section className="stack">
        <h2>Загрузка автопарка{showResult ? ' и результат по автомобилям' : ''}</h2>
        <div className="table-box">
          <table className="table">
            <thead><tr><th>Автомобиль</th><th className="num">Занято, ч</th><th className="num">Доступно, ч</th><th className="num">Загрузка</th><th className="num">Обслуживание, ч</th>{showResult ? <><th className="num">Начислено</th><th className="num">Прямые расходы</th><th className="num">Результат</th></> : null}</tr></thead>
            <tbody>
              {util.map((u) => (
                <tr key={u.v.id}>
                  <td><Link href={`/crm/vehicles/${u.v.id}`}>{u.v.title}</Link></td>
                  <td className="num">{Math.round(u.busyH)}</td>
                  <td className="num">{Math.round(u.availableH)}</td>
                  <td className="num">{(u.util * 100).toFixed(0)}%</td>
                  <td className="num">{Math.round(u.maintH)}</td>
                  {showResult ? <><td className="num">{rub(u.income)}</td><td className="num">{rub(u.expenses)}</td><td className="num">{rub(u.result)}</td></> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">Загрузка = занятое время (брони и аренда) / доступное время (период минус обслуживание и блокировки). Результат автомобиля = начисления − прямые расходы по машине; это не чистая прибыль компании.</p>
      </section>
    </>
  );
}

async function Ledger({ from, to, canReverse }: { from: Date; to: Date; canReverse: boolean }) {
  const [entries, users] = await Promise.all([
    db.ledgerEntry.findMany({ where: { occurredAt: { gte: from, lt: to } }, include: { order: { select: { number: true } } }, orderBy: { occurredAt: 'desc' }, take: 500 }),
    usersById(),
  ]);
  const reversed = new Set(entries.filter((e) => e.reversesId).map((e) => e.reversesId));
  return (
    <div className="table-box">
      <table className="table">
        <thead><tr><th>Дата</th><th>Операция</th><th>Заказ</th><th>Основание</th><th className="num">Сумма</th><th>Сотрудник</th><th /></tr></thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} style={e.reversesId || reversed.has(e.id) ? { opacity: 0.6 } : undefined}>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.occurredAt)}</td>
              <td>{e.reversesId ? 'Возврат · ' : ''}{KIND_LABEL[e.kind] ?? e.kind}{e.method ? <div className="muted small">{METHOD_LABEL[e.method]}</div> : null}</td>
              <td>{e.orderId ? <Link href={`/crm/orders/${e.orderId}?tab=money`}>{e.order?.number}</Link> : '—'}</td>
              <td>{e.basis}</td>
              <td className="num">{rub(e.amount)}</td>
              <td className="small">{users.get(e.createdById)?.fullName}{e.approvedById ? <div className="muted">подтв.: {users.get(e.approvedById)?.fullName}</div> : null}</td>
              <td>{canReverse && !e.reversesId && !reversed.has(e.id) ? (
                <ActionDialog label="Возврат" title="Возврат операции" action={reverseAction} submit="Сделать возврат" hidden={{ entryId: e.id }} description={`${KIND_LABEL[e.kind]} ${rub(e.amount)}`}>
                  <label className="field">Причина<input className="input" name="basis" required /></label>
                </ActionDialog>
              ) : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!entries.length ? <p className="muted pad">Операций за период нет.</p> : null}
    </div>
  );
}

async function Debts() {
  const { debts, deposits, overpaid } = await debtsAndDeposits();
  const block = (title: string, rows: typeof debts, value: (r: (typeof debts)[number]) => number) => (
    <section className="card pad stack">
      <h2>{title} <span className="muted">· {rub(rows.reduce((s, r) => s + value(r), 0))}</span></h2>
      {rows.length ? <ul className="list">{rows.map((r) => <li key={r.o.id}><Link href={`/crm/orders/${r.o.id}?tab=money`}>{r.o.number}</Link><span className="grow">{r.o.customer.fullName} · {r.o.vehicle.title}{r.o.status === 'closed' ? <span className="muted small"> · завершён</span> : null}</span>{r.o.depositReleaseAt && title.startsWith('Залоги') ? <span className={r.o.depositReleaseAt <= new Date() ? 'warn small' : 'muted small'}>вернуть с {fmtDateTime(r.o.depositReleaseAt)}</span> : null}<strong>{rub(value(r))}</strong></li>)}</ul> : <p className="muted">Нет</p>}
    </section>
  );
  return (
    <>
      {block('Долги клиентов', debts, (r) => r.m.debt)}
      {block('Залоги к возврату', deposits, (r) => r.m.depositBalance)}
      {block('Переплаты (вернуть или зачесть)', overpaid, (r) => -r.m.debt)}
    </>
  );
}
