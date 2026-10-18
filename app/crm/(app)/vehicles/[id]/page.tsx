import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { db, json } from '@/lib/db';
import { fmtDate, fmtDateTime, toLocalInput } from '@/lib/dates';
import { isActive, KIND_LABEL } from '@/lib/booking';
import { can } from '@/lib/permissions';
import { rub } from '@/lib/money';
import { tierLabel, type Tier } from '@/lib/pricing';
import { STATUS_LABEL } from '@/lib/orders';
import { ActionDialog, ActionForm } from '@/components/crm/ActionForm';
import { damageRepairedAction, expenseAction, releaseBlockAction, tariffAction, vehicleBlockAction, vehicleConditionAction, vehicleDocAction, vehicleUpdateAction } from '../../../actions';
import { COND_LABEL } from '@/lib/site';

export const metadata = { title: 'Автомобиль' };

const DOC_KIND: Record<string, string> = { sts: 'СТС', osago: 'ОСАГО', kasko: 'КАСКО', diagnostic_card: 'Диагностическая карта', other: 'Другое' };

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser('fleet.read');
  const { id } = await params;
  const now = new Date();
  const v = await db.vehicle.findUnique({
    where: { id },
    include: {
      tariffs: { orderBy: { validFrom: 'desc' } },
      documents: { orderBy: { validUntil: 'asc' } },
      damages: { orderBy: { createdAt: 'desc' } },
      occupancies: { where: { releasedAt: null, blockedUntil: { gt: now } }, include: { order: true }, orderBy: { startsAt: 'asc' } },
      orders: { orderBy: { pickupAt: 'desc' }, take: 20, include: { customer: true } },
    },
  });
  if (!v) notFound();
  const fw = can(user, 'fleet.write');
  const active = v.tariffs.find((t) => t.status === 'active');
  const tiers = active ? json<Tier[]>(active.tiers, []).sort((a, b) => a.minDays - b.minDays) : [];
  const occ = v.occupancies.filter((o) => isActive(o, now));
  const money = can(user, 'finance.result')
    ? await db.ledgerEntry.findMany({ where: { vehicleId: id } })
    : null;
  const income = money?.filter((e) => e.kind.startsWith('charge.')).reduce((s, e) => s + e.amount, 0) ?? 0;
  const expenses = money?.filter((e) => e.kind === 'expense.vehicle').reduce((s, e) => s + e.amount, 0) ?? 0;

  return (
    <>
      <Link href="/crm/vehicles" className="small">← Автомобили</Link>
      <div className="toolbar">
        <h1>{v.title}</h1>
        <span className={`tag ${v.condition === 'ready' ? 'ok' : ''}`}>{occ.some((o) => o.kind === 'rental' && o.startsAt <= now) ? 'В аренде' : COND_LABEL[v.condition]}</span>
        <div className="grow" />
        {v.condition === 'preparing' && (fw || can(user, 'rental.inspect')) ? <ActionForm action={vehicleConditionAction} hidden={{ vehicleId: id, condition: 'ready' }} submit="Готов к выдаче" /> : null}
        {fw ? (
          <ActionDialog label="Состояние" title="Состояние автомобиля" action={vehicleConditionAction} submit="Сохранить" hidden={{ vehicleId: id }}>
            <label className="field">Состояние<select className="input" name="condition" defaultValue={v.condition}>{Object.entries(COND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <p className="muted small">«Недоступен» убирает машину из поиска на сайте. Для конкретных дат используйте блокировку.</p>
          </ActionDialog>
        ) : null}
        {fw ? (
          <ActionDialog label="Блокировка / ТО" title="Заблокировать даты" action={vehicleBlockAction} submit="Заблокировать" hidden={{ vehicleId: id }} description="Проверяется пересечение с бронями.">
            <label className="field">Тип<select className="input" name="kind"><option value="maintenance">Обслуживание</option><option value="block">Ручная блокировка</option></select></label>
            <div className="grid-2"><label className="field">С<input className="input" type="datetime-local" name="from" defaultValue={toLocalInput(now).slice(0, 11) + '09:00'} required /></label><label className="field">По<input className="input" type="datetime-local" name="to" defaultValue={toLocalInput(now).slice(0, 11) + '18:00'} required /></label></div>
            <label className="field">Причина<input className="input" name="note" required /></label>
          </ActionDialog>
        ) : null}
      </div>

      <div className="cols">
        <div className="main stack">
          <section className="card pad stack">
            <h2>Занятость</h2>
            {occ.length ? (
              <ul className="list">
                {occ.map((o) => (
                  <li key={o.id}>
                    <span style={{ flex: '0 0 260px' }}>{fmtDateTime(o.startsAt)} — {fmtDateTime(o.endsAt)}</span>
                    <span className="tag">{KIND_LABEL[o.kind]}</span>
                    <span className="grow">{o.order ? <Link href={`/crm/orders/${o.orderId}`}>{o.order.number}</Link> : o.note}</span>
                    {fw && !o.orderId ? <ActionForm action={releaseBlockAction} hidden={{ occupancyId: o.id }} submit="Снять" variant="quiet" /> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="muted">Свободен</p>}
          </section>

          <section className="card pad stack">
            <div className="row"><h2>Тариф</h2>{can(user, 'tariff.edit') ? (
              <ActionDialog label="Изменить тариф" title="Новый тариф" action={tariffAction} submit="Сохранить" hidden={{ vehicleId: id }} description="Создаётся новая версия тарифа. Согласованные заказы сохраняют свой снимок и не пересчитываются.">
                <div className="grid-2">
                  {[1, 3, 7, 14, 30].map((d) => <label key={d} className="field">{d === 1 ? '1–2 сут' : `от ${d} сут`}, ₽<input className="input" name={`t${d}`} inputMode="decimal" defaultValue={String((tiers.find((t) => t.minDays === d)?.dailyRate ?? 0) / 100)} required /></label>)}
                  <label className="field">Залог, ₽<input className="input" name="deposit" defaultValue={String((active?.deposit ?? 0) / 100)} required /></label>
                  <label className="field">Км в сутки<input className="input" name="km" defaultValue={String(active?.includedKmPerDay ?? 250)} required /></label>
                  <label className="field">Перепробег, ₽/км<input className="input" name="overmileage" defaultValue={String((active?.overmileagePerKm ?? 0) / 100)} required /></label>
                  <label className="field">С водителем, ₽/ч<input className="input" name="driver" defaultValue={active?.driverPerHour ? String(active.driverPerHour / 100) : ''} placeholder="нет" /></label>
                </div>
                <label className="field">Комментарий<input className="input" name="note" /></label>
              </ActionDialog>
            ) : null}</div>
            {active ? (
              <>
                <div className="boxes">
                  {tiers.map((t) => <div className="box" key={t.minDays}><span className="muted small">{tierLabel(t.minDays, tiers)}</span><b>{rub(t.dailyRate)}</b></div>)}
                </div>
                <p className="text-2 small">Залог {rub(active.deposit)} · {active.includedKmPerDay} км/сут · перепробег {rub(active.overmileagePerKm)}/км · с водителем {active.driverPerHour ? `${rub(active.driverPerHour)}/ч` : 'нет'}. Действует с {fmtDate(active.validFrom)}.{active.note ? ` ${active.note}` : ''}</p>
              </>
            ) : <p className="warn">Тариф не задан — машина не показывается на сайте.</p>}
            {v.tariffs.length > 1 ? <details><summary className="small muted">История тарифов ({v.tariffs.length - 1})</summary>{v.tariffs.filter((t) => t.status !== 'active').map((t) => <div key={t.id} className="small muted">с {fmtDate(t.validFrom)}: {json<Tier[]>(t.tiers, []).map((x) => rub(x.dailyRate)).join(' / ')}</div>)}</details> : null}
          </section>

          <section className="card pad stack">
            <h2>Повреждения</h2>
            {v.damages.length ? (
              <ul className="list">{v.damages.map((d) => (
                <li key={d.id} style={d.status === 'repaired' ? { opacity: 0.55 } : undefined}>
                  <span className="grow"><strong>{d.location}</strong> — {d.description}</span>
                  <span className="muted small">{fmtDateTime(d.createdAt)}</span>
                  {d.status === 'open' && fw ? <ActionForm action={damageRepairedAction} hidden={{ damageId: d.id }} submit="Устранено" variant="quiet" /> : <span className="tag">{d.status === 'open' ? 'открыто' : 'устранено'}</span>}
                </li>
              ))}</ul>
            ) : <p className="muted">Не зафиксированы</p>}
          </section>

          <section className="card pad stack">
            <h2>История аренды</h2>
            <ul className="list">{v.orders.map((o) => <li key={o.id}><Link href={`/crm/orders/${o.id}`}>{o.number}</Link><span className="text-2 grow">{o.customer.fullName}</span><span className="small">{fmtDateTime(o.pickupAt)} — {fmtDateTime(o.returnAt)}</span><span className="tag">{STATUS_LABEL[o.status]}</span></li>)}</ul>
            {!v.orders.length ? <p className="muted">Заказов нет</p> : null}
          </section>
        </div>

        <aside className="aside">
          <section className="card pad stack">
            <h2>Данные</h2>
            <ActionForm action={vehicleUpdateAction} hidden={{ vehicleId: id }} submit="Сохранить" variant="quiet" className="stack" style={{ gap: 10 }}>
              <fieldset disabled={!fw} style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {can(user, 'vehicle.sensitive') ? (
                  <>
                    <label className="field">VIN<input className="input" name="vin" defaultValue={v.vin ?? ''} /></label>
                    <label className="field">Госномер<input className="input" name="plate" defaultValue={v.plate ?? ''} /></label>
                  </>
                ) : <p className="muted small">VIN и госномер скрыты для вашей роли.</p>}
                <label className="field">Пробег, км<input className="input" name="mileageKm" type="number" defaultValue={v.mileageKm} /></label>
                <label className="field">Следующее ТО, км<input className="input" name="nextServiceKm" type="number" defaultValue={v.nextServiceKm ?? ''} /></label>
                <label className="field">Следующее ТО, дата<input className="input" name="nextServiceAt" type="date" defaultValue={v.nextServiceAt ? toLocalInput(v.nextServiceAt).slice(0, 10) : ''} /></label>
                <label className="field">Описание на сайте<textarea className="input" name="description" defaultValue={v.description ?? ''} /></label>
                <label className="check"><input type="checkbox" name="isPublished" defaultChecked={v.isPublished} />Показывать на сайте</label>
              </fieldset>
            </ActionForm>
          </section>

          <section className="card pad stack">
            <div className="row"><h2>Документы</h2>{fw ? (
              <ActionDialog label="Добавить" title="Документ автомобиля" action={vehicleDocAction} submit="Добавить" hidden={{ vehicleId: id }}>
                <label className="field">Вид<select className="input" name="kind">{Object.entries(DOC_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <label className="field">Название<input className="input" name="title" required /></label>
                <label className="field">Действует до<input className="input" type="date" name="validUntil" /></label>
              </ActionDialog>
            ) : null}</div>
            {v.documents.length ? v.documents.map((d) => (
              <div key={d.id} className="row small"><span>{d.title} <span className="muted">· {DOC_KIND[d.kind]}</span></span><span className={d.validUntil && d.validUntil < new Date(now.getTime() + 30 * 86400000) ? 'warn' : 'muted'}>{d.validUntil ? `до ${fmtDate(d.validUntil)}` : 'бессрочно'}</span></div>
            )) : <p className="muted small">Не добавлены</p>}
          </section>

          {money ? (
            <section className="card pad stack" style={{ gap: 8 }}>
              <h2>Доходы и расходы</h2>
              <div className="row"><span className="muted">Начислено по заказам</span><span>{rub(income)}</span></div>
              <div className="row"><span className="muted">Прямые расходы</span><span>{rub(expenses)}</span></div>
              <div className="row" style={{ fontWeight: 600 }}><span>Результат автомобиля</span><span>{rub(income - expenses)}</span></div>
              <p className="muted small">Начисления минус прямые расходы. Это не чистая прибыль компании.</p>
              {can(user, 'finance.expenses') ? (
                <ActionDialog label="Добавить расход" title="Расход по автомобилю" action={expenseAction} submit="Записать" hidden={{ vehicleId: id }}>
                  <label className="field">Сумма, ₽<input className="input" name="amount" inputMode="decimal" required /></label>
                  <label className="field">Основание<input className="input" name="basis" placeholder="ТО, мойка, ремонт…" required /></label>
                  <label className="field">Дата<input className="input" type="date" name="date" defaultValue={toLocalInput(now).slice(0, 10)} /></label>
                  <label className="field">Способ<select className="input" name="method"><option value="transfer">Перевод</option><option value="card">Карта</option><option value="cash">Наличные</option></select></label>
                </ActionDialog>
              ) : null}
            </section>
          ) : null}
        </aside>
      </div>
    </>
  );
}
