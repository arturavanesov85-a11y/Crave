import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { addMinutes, fmtDateTime, parseLocal, startOfLocalDay, toLocalInput } from '@/lib/dates';
import { isActive, KIND_LABEL } from '@/lib/booking';
import { can } from '@/lib/permissions';
import { loadSettings } from '@/lib/rules';

export const metadata = { title: 'Календарь' };

const COND: Record<string, [string, string]> = { ready: ['Готов', 'var(--gold-light)'], preparing: ['Подготовка', 'var(--text-2)'], maintenance: ['ТО', 'var(--muted)'], unavailable: ['Недоступен', 'var(--warn)'] };

export default async function Calendar({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser('rental.read');
  const sp = await searchParams;
  const view = sp.view === 'day' || sp.view === 'month' ? sp.view : 'week';
  const now = new Date();
  const today = startOfLocalDay(now);
  let start = sp.start ? parseLocal(`${sp.start}T00:00`) ?? today : today;
  if (view === 'month' && !sp.start) start = parseLocal(toLocalInput(today).slice(0, 8) + '01T00:00')!;
  const ymd = (d: Date) => toLocalInput(d).slice(0, 10);

  let hours: number, cols: number, step: number;
  if (view === 'day') { hours = 24; cols = 24; step = 1; }
  else if (view === 'week') { hours = 168; cols = 7; step = 24; }
  else {
    const [y, m] = ymd(start).split('-').map(Number);
    const next = parseLocal(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01T00:00`)!;
    hours = Math.round((next.getTime() - start.getTime()) / 3600000); cols = Math.round(hours / 24); step = 24;
  }
  const end = addMinutes(start, hours * 60);
  const shift = (dir: number) => {
    if (view === 'month') {
      const [y, m] = ymd(start).split('-').map(Number);
      const nm = m + dir, ny = y + Math.floor((nm - 1) / 12), mm = ((nm - 1) % 12 + 12) % 12 + 1;
      return `${ny}-${String(mm).padStart(2, '0')}-01`;
    }
    return ymd(addMinutes(start, dir * hours * 60));
  };

  const [vehicles, occ, settings] = await Promise.all([
    db.vehicle.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.occupancy.findMany({ where: { releasedAt: null, startsAt: { lt: end }, blockedUntil: { gt: addMinutes(start, -60 * 24 * 30) } }, include: { order: { include: { customer: true } } } }),
    loadSettings(),
  ]);
  const pos = (a: Date, b: Date) => {
    const s = Math.max(0, (a.getTime() - start.getTime()) / 3600000), e = Math.min(hours, (b.getTime() - start.getTime()) / 3600000);
    return e <= s ? null : { left: `${(s / hours) * 100}%`, width: `calc(${((e - s) / hours) * 100}% - 2px)` };
  };
  const nowPos = now >= start && now < end ? `${((now.getTime() - start.getTime()) / 3600000 / hours) * 100}%` : null;
  const canWrite = can(user, 'rental.write');

  const colLabel = (i: number) => {
    const d = addMinutes(start, i * step * 60);
    if (view === 'day') return { top: toLocalInput(d).slice(11, 13), sub: '', today: false };
    const f = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'short', day: 'numeric' }).format(d);
    const isToday = ymd(d) === ymd(now);
    return { top: view === 'week' ? f : toLocalInput(d).slice(8, 10), sub: view === 'week' ? (isToday ? 'Сегодня' : new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', month: 'short' }).format(d)) : '', today: isToday };
  };
  const title = view === 'day'
    ? new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'long', day: 'numeric', month: 'long' }).format(start)
    : view === 'month' ? new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', month: 'long', year: 'numeric' }).format(start)
    : `${new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short' }).format(start)} – ${new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short', year: 'numeric' }).format(addMinutes(end, -1))}`;

  const overdueCount = occ.filter((o) => o.kind === 'rental' && o.endsAt < now).length;

  return (
    <>
      <div className="toolbar">
        <h1>Календарь автомобилей</h1>
        <div className="grow" />
        <nav className="seg" aria-label="Масштаб">
          {(['day', 'week', 'month'] as const).map((v) => (
            <Link key={v} href={`/crm/calendar?view=${v}`} aria-current={view === v ? 'page' : undefined}>{v === 'day' ? 'День' : v === 'week' ? 'Неделя' : 'Месяц'}</Link>
          ))}
        </nav>
        <div className="wrap-row" style={{ gap: 6 }}>
          <Link className="btn btn-quiet btn-sm" href={`/crm/calendar?view=${view}&start=${shift(-1)}`} aria-label="Назад">←</Link>
          <span style={{ minWidth: 170, textAlign: 'center', fontWeight: 500 }}>{title}</span>
          <Link className="btn btn-quiet btn-sm" href={`/crm/calendar?view=${view}&start=${shift(1)}`} aria-label="Вперёд">→</Link>
          <Link className="btn btn-quiet btn-sm" href={`/crm/calendar?view=${view}`}>Сегодня</Link>
        </div>
        {canWrite ? <Link className="btn btn-primary btn-sm" href="/crm/orders/new">Новая бронь</Link> : null}
      </div>
      {overdueCount ? <div className="notice warn">Просроченных возвратов: {overdueCount}. Просрочка продолжает занимать машину и может сорвать следующую выдачу — см. «Сегодня».</div> : null}

      <div className="cal-box">
        <div className="cal">
          <div className="cal-head">
            <div className="cal-car muted small">Автомобиль</div>
            <div className="cal-cols" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {Array.from({ length: cols }, (_, i) => {
                const l = colLabel(i);
                return <div key={i} className={`cal-col${l.today ? ' today' : ''}`} style={view !== 'week' ? { textAlign: 'center', padding: '8px 2px' } : undefined}><div style={{ fontWeight: 600 }}>{l.top}</div>{l.sub ? <div className="muted">{l.sub}</div> : null}</div>;
              })}
            </div>
          </div>
          {vehicles.map((v) => {
            const items = occ.filter((o) => o.vehicleId === v.id && isActive(o, now));
            const rentedNow = items.some((o) => o.kind === 'rental' && o.startsAt <= now);
            const [condLabel, condColor] = rentedNow ? ['В аренде', 'var(--text)'] : COND[v.condition] ?? [v.condition, 'var(--text-2)'];
            return (
              <div className="cal-row" key={v.id}>
                <div className="cal-car">
                  <Link href={`/crm/vehicles/${v.id}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{v.title}</Link>
                  <span className="tag" style={{ alignSelf: 'flex-start', color: condColor }}>{condLabel}</span>
                </div>
                <div className="cal-lane" style={{ backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent calc(100% / ${cols} - 1px), var(--line-soft) calc(100% / ${cols} - 1px), var(--line-soft) calc(100% / ${cols}))` }}>
                  {canWrite
                    ? Array.from({ length: cols }, (_, i) => {
                        const at = addMinutes(start, i * step * 60);
                        const from = view === 'day' ? toLocalInput(at) : `${ymd(at)}T10:00`;
                        return <Link key={i} className="cal-free" aria-label={`Создать бронь: ${v.title}, ${from}`} href={`/crm/orders/new?vehicle=${v.id}&from=${from}`} style={{ left: `${(i / cols) * 100}%`, width: `${100 / cols}%` }} />;
                      })
                    : null}
                  {items.flatMap((o) => {
                    const out = [];
                    const overdue = o.kind === 'rental' && o.endsAt < now;
                    const bufEnd = overdue ? addMinutes(now, settings.prepBufferMinutes) : o.blockedUntil;
                    const bufStart = overdue ? now : o.endsAt;
                    const pb = pos(bufStart, bufEnd);
                    if (pb && bufEnd > bufStart) out.push(<span key={o.id + 'b'} className="bar buffer" style={pb} title="Подготовка" />);
                    const p = pos(o.startsAt, o.endsAt);
                    const label = o.order ? `${o.order.number.slice(-6).replace(/^0+/, '№')} · ${o.order.customer.fullName}` : o.note ?? KIND_LABEL[o.kind];
                    const t = `${KIND_LABEL[o.kind]}: ${fmtDateTime(o.startsAt)} — ${fmtDateTime(o.endsAt)}${o.expiresAt ? ` (резерв до ${fmtDateTime(o.expiresAt)})` : ''}`;
                    const cls = `bar ${o.kind}${o.startsAt < start ? ' cutl' : ''}${o.endsAt > end ? ' cutr' : ''}`;
                    const href = o.orderId ? `/crm/orders/${o.orderId}` : `/crm/vehicles/${v.id}`;
                    if (p) out.push(<Link key={o.id} className={cls} href={href} style={p} title={t}>{label}</Link>);
                    const po = overdue ? pos(o.endsAt, now) : null;
                    if (po) out.push(<Link key={o.id + 'o'} className="bar overdue" href={href} style={po} title="Просрочка возврата">!</Link>);
                    return out;
                  })}
                  {nowPos ? <span className="now-line" style={{ left: nowPos }} /> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ul className="legend" aria-label="Обозначения">
        <li><i style={{ background: 'var(--gold)' }} />Подтверждённая бронь</li>
        <li><i style={{ background: 'var(--text)' }} />Автомобиль выдан</li>
        <li><i style={{ border: '1.5px dashed var(--gold-light)' }} />Временный резерв</li>
        <li><i style={{ background: 'var(--block)' }} />ТО и блокировки</li>
        <li><i style={{ background: 'repeating-linear-gradient(45deg, var(--block) 0 3px, transparent 3px 6px)' }} />Подготовка ({settings.prepBufferMinutes / 60} ч)</li>
        <li><i style={{ background: 'var(--warn)' }} />Просрочка</li>
      </ul>
      <p className="muted small">Клик по свободному месту — новая бронь на эту машину и дату. Клик по полосе — заказ. Перенос и продление — в карточке заказа, с проверкой доступности.</p>
    </>
  );
}
