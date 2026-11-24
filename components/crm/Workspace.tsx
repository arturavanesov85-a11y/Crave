// Доска заявок рабочей зоны: колонки по этапам, свои/все, поиск, закрытые.
import Link from 'next/link';
import { ChannelTag } from './ChannelTag';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { fmtDateTime, startOfLocalDay, addMinutes } from '@/lib/dates';
import { formatPhone } from '@/lib/orders';
import { rub } from '@/lib/money';
import type { SessionUser } from '@/lib/permissions';
import { usersById } from '@/lib/crm-data';
import { LEAD_KIND, STAGES, WS, stageOf, type WsDirection } from '@/lib/workspace';
import { ActionDialog } from './ActionForm';
import { requestCreateAction } from '@/app/crm/workspace-actions';

export async function Workspace({ direction, user, sp }: { direction: WsDirection; user: SessionUser; sp: Record<string, string | undefined> }) {
  const ws = WS[direction];
  const mine = sp.mine === '1';
  const view = sp.view === 'closed' ? 'closed' : 'board';
  const q = (sp.q ?? '').trim();
  const now = new Date();
  const today = startOfLocalDay(now);
  const where: Prisma.LeadWhereInput = { direction, ...(mine ? { assigneeId: user.id } : {}) };
  if (q) {
    const digits = q.replace(/\D/g, '');
    where.OR = [{ name: { contains: q } }, { carInfo: { contains: q } }, { message: { contains: q } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])];
  }
  const closedCodes = STAGES[direction].filter((s) => s.closed).map((s) => s.code);
  const [leads, users] = await Promise.all([
    db.lead.findMany({ where: { ...where, stage: view === 'closed' ? { in: closedCodes } : { notIn: closedCodes } }, orderBy: [{ nextActionAt: 'asc' }, { createdAt: 'desc' }], take: 500 }),
    usersById(),
  ]);
  const cars = direction === 'sales' ? new Map((await db.saleCar.findMany({ select: { id: true, title: true, year: true } })).map((c) => [c.id, `${c.title}, ${c.year}`])) : new Map<string, string>();
  const open = STAGES[direction].filter((s) => !s.closed);
  const overdue = leads.filter((l) => l.nextActionAt && l.nextActionAt < now).length;
  const fresh = leads.filter((l) => l.stage === 'new').length;
  const todayAppointments = direction === 'service' ? leads.filter((l) => l.appointmentAt && l.appointmentAt >= today && l.appointmentAt < addMinutes(today, 1440)).length : 0;
  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(mine ? { mine: '1' } : {}), ...(q ? { q } : {}), ...(view === 'closed' ? { view } : {}) });
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
    return `${ws.path}?${p}`;
  };

  const card = (l: (typeof leads)[number]) => {
    const late = l.nextActionAt && l.nextActionAt < now;
    return (
      <Link key={l.id} href={`/crm/requests/${l.id}`} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 12, color: 'var(--text)', borderColor: late ? 'var(--warn)' : undefined }}>
        <div className="row" style={{ alignItems: 'center' }}><strong>{l.name}</strong><span className="muted small">{fmtDateTime(l.createdAt)}</span></div>
        <span className="text-2 small" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><ChannelTag channel={l.channel} />{l.phone ? `${formatPhone(l.phone)} · ` : ''}{LEAD_KIND[l.kind] ?? l.kind}</span>
        {l.carInfo || l.saleCarId ? <span className="small">{l.saleCarId ? cars.get(l.saleCarId) : l.carInfo}</span> : null}
        {direction === 'service' && l.appointmentAt ? <span className="small gold">Запись: {fmtDateTime(l.appointmentAt)}</span> : null}
        {l.nextActionAt || l.nextAction ? <span className={`small ${late ? 'warn' : 'muted'}`}>{late ? 'Просрочено: ' : ''}{l.nextAction ?? 'действие'}{l.nextActionAt ? ` · ${fmtDateTime(l.nextActionAt)}` : ''}</span> : null}
        <div className="row small" style={{ marginTop: 2 }}><span className="muted">{l.assigneeId ? users.get(l.assigneeId)?.fullName : 'не назначен'}</span>{l.amount ? <span>{rub(l.amount)}</span> : null}</div>
      </Link>
    );
  };

  return (
    <>
      <div className="toolbar">
        <h1>{ws.title}</h1>
        <div className="grow" />
        <form className="wrap-row" style={{ gap: 8 }}>
          {mine ? <input type="hidden" name="mine" value="1" /> : null}
          {view === 'closed' ? <input type="hidden" name="view" value="closed" /> : null}
          <input className="input" name="q" defaultValue={q} placeholder="Имя, телефон, автомобиль" style={{ minHeight: 38, width: 240 }} />
          <button className="btn btn-quiet btn-sm" type="submit">Найти</button>
        </form>
        <ActionDialog label="Новая заявка" title={`Новая заявка · ${ws.title}`} action={requestCreateAction} submit="Создать" variant="primary" hidden={{ direction }}>
          <div className="grid-2 stack-sm">
            <label className="field">Имя клиента<input className="input" name="name" required /></label>
            <label className="field">Телефон<input className="input" name="phone" type="tel" required placeholder="+7" /></label>
          </div>
          <label className="field">{direction === 'sales' ? 'Какой автомобиль ищет' : 'Автомобиль клиента'}<input className="input" name="carInfo" /></label>
          <label className="field">{direction === 'sales' ? 'Пожелания, бюджет' : 'Какие работы нужны'}<textarea className="input" name="message" rows={3} /></label>
        </ActionDialog>
      </div>

      <div className="kpis">
        <div className="card kpi"><span className="muted small">Новые</span><b className={fresh ? 'gold' : ''}>{fresh}</b></div>
        <div className="card kpi"><span className="muted small">Просрочены действия</span><b className={overdue ? 'warn' : ''}>{overdue}</b></div>
        {direction === 'service' ? <div className="card kpi"><span className="muted small">Записи на сегодня</span><b>{todayAppointments}</b></div> : null}
        <div className="card kpi"><span className="muted small">{view === 'closed' ? 'Закрытых' : 'В работе'}</span><b>{leads.length}</b></div>
      </div>

      <nav className="wrap-row" style={{ gap: 8 }}>
        <Link className={`chip${!mine ? ' on' : ''}`} href={link({ mine: '' })}>Все</Link>
        <Link className={`chip${mine ? ' on' : ''}`} href={link({ mine: '1' })}>Мои</Link>
        <span style={{ width: 12 }} />
        <Link className={`chip${view === 'board' ? ' on' : ''}`} href={link({ view: '' })}>В работе</Link>
        <Link className={`chip${view === 'closed' ? ' on' : ''}`} href={link({ view: 'closed' })}>Закрытые</Link>
      </nav>

      {view === 'board' ? (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${open.length}, minmax(240px, 1fr))`, gap: 12, minWidth: open.length * 250 }}>
            {open.map((s) => {
              const items = leads.filter((l) => l.stage === s.code);
              return (
                <section key={s.code} className="stack" style={{ gap: 8, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: 10, alignContent: 'start' }}>
                  <h2 className="row" style={{ fontSize: 14 }}>{s.label}<span className="muted">{items.length}</span></h2>
                  {items.map(card)}
                  {!items.length ? <p className="muted small">Пусто</p> : null}
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="table-box">
          <table className="table">
            <thead><tr><th>Клиент</th><th>Итог</th><th>Автомобиль</th><th className="num">Сумма</th><th>Закрыта</th><th>Ответственный</th></tr></thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td><Link href={`/crm/requests/${l.id}`} style={{ fontWeight: 600 }}>{l.name}</Link><div className="muted small"><ChannelTag channel={l.channel} /> {l.phone ? formatPhone(l.phone) : ''}</div></td>
                  <td><span className={`tag ${stageOf(direction, l.stage).closed === 'won' ? 'ok' : ''}`}>{stageOf(direction, l.stage).label}</span>{l.lostReason ? <div className="muted small">{l.lostReason}</div> : null}</td>
                  <td className="small">{l.saleCarId ? cars.get(l.saleCarId) : l.carInfo ?? '—'}</td>
                  <td className="num">{l.amount ? rub(l.amount) : '—'}</td>
                  <td className="small">{fmtDateTime(l.closedAt)}</td>
                  <td className="small">{l.assigneeId ? users.get(l.assigneeId)?.fullName : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!leads.length ? <p className="muted pad">Закрытых заявок нет.</p> : null}
        </div>
      )}
    </>
  );
}
