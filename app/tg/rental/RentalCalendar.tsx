// Мини-приложение → «Прокат»: календарь месяца с выдачами и возвратами.
// Нажали на день — ниже список его выдач и возвратов. Листание месяцев — стрелками.
import Link from 'next/link';
import { db } from '@/lib/db';
import { addMinutes, fmtTime, parseLocal, toLocalInput } from '@/lib/dates';
import { orderScope } from '@/lib/crm-data';
import { STATUS_LABEL } from '@/lib/orders';
import type { SessionUser } from '@/lib/permissions';

const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const ymd = (d: Date) => toLocalInput(d).slice(0, 10);
const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
const monthTitle = (d: Date) => cap(new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', month: 'long', year: 'numeric' }).format(d).replace(/ г\.$/, ''));
const dayTitle = (d: Date) => cap(new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'long', day: 'numeric', month: 'long' }).format(d));

export async function RentalCalendar({ user, month, day }: { user: SessionUser; month?: string; day?: string }) {
  const now = new Date();
  const today = ymd(now);
  const ym = /^\d{4}-\d{2}$/.test(month ?? '') ? month! : (day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.slice(0, 7) : today.slice(0, 7));
  const [y, m] = ym.split('-').map(Number);
  const start = parseLocal(`${ym}-01T00:00`)!;
  const nextYm = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
  const prevYm = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
  const end = parseLocal(`${nextYm}-01T00:00`)!;
  const selected = day && day.startsWith(ym) ? day : today.startsWith(ym) ? today : `${ym}-01`;

  const orders = await db.rentalOrder.findMany({
    where: {
      ...orderScope(user),
      status: { in: ['new', 'negotiation', 'confirmed', 'issued'] },
      OR: [{ pickupAt: { gte: start, lt: end } }, { returnAt: { gte: start, lt: end } }],
    },
    include: { vehicle: { select: { title: true } }, customer: { select: { fullName: true } } },
    orderBy: { pickupAt: 'asc' },
  });

  // События: выдача — по дате начала (кроме уже выданных), возврат — по дате окончания.
  type Ev = { at: Date; type: 'pickup' | 'return'; o: (typeof orders)[number] };
  const events: Ev[] = [];
  for (const o of orders) {
    if (o.pickupAt >= start && o.pickupAt < end && o.status !== 'issued') events.push({ at: o.pickupAt, type: 'pickup', o });
    if (o.returnAt >= start && o.returnAt < end && ['confirmed', 'issued'].includes(o.status)) events.push({ at: o.returnAt, type: 'return', o });
  }
  const byDay = new Map<string, Ev[]>();
  for (const e of events) { const k = ymd(e.at); byDay.set(k, [...(byDay.get(k) ?? []), e]); }

  // Сетка с понедельника.
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  const lead = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Moscow', weekday: 'short' }).format(start));
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => ymd(addMinutes(start, i * 1440 + 720)))];
  while (cells.length % 7) cells.push(null);

  const list = (byDay.get(selected) ?? []).sort((a, b) => a.at.getTime() - b.at.getTime());
  const href = (q: string) => `/tg/rental?${q}#calendar`;

  return (
    <section id="calendar" className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ alignItems: 'center' }}>
        <Link className="btn btn-quiet btn-sm" href={href(`m=${prevYm}`)} aria-label="Предыдущий месяц">←</Link>
        <h2 className="tg-section-title" style={{ margin: 0 }}>{monthTitle(start)}</h2>
        <Link className="btn btn-quiet btn-sm" href={href(`m=${nextYm}`)} aria-label="Следующий месяц">→</Link>
      </div>
      <div className="tg-cal">
        {WEEK.map((w) => <span key={w} className="tg-cal-head">{w}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const ev = byDay.get(d) ?? [];
          const p = ev.filter((e) => e.type === 'pickup').length, r = ev.length - p;
          const cls = ['tg-cal-day', d === selected ? 'sel' : '', d === today ? 'today' : '', d < today ? 'past' : ''].filter(Boolean).join(' ');
          return (
            <Link key={d} href={href(`d=${d}`)} className={cls} aria-label={`${d}: выдач ${p}, возвратов ${r}`}>
              <span>{Number(d.slice(8))}</span>
              <span className="tg-cal-dots">{p ? <i className="up">{p}</i> : null}{r ? <i className="down">{r}</i> : null}</span>
            </Link>
          );
        })}
      </div>
      <p className="muted small" style={{ margin: 0 }}><i className="tg-cal-key up" /> выдачи · <i className="tg-cal-key down" /> возвраты</p>

      <h3 style={{ fontSize: 15, margin: '6px 0 0' }}>{dayTitle(parseLocal(`${selected}T12:00`)!)}</h3>
      {list.length ? (
        <div className="tg-list">
          {list.map((e) => (
            <Link key={`${e.type}-${e.o.id}`} href={`/tg/rental/order/${e.o.id}`} className={`tg-item${e.type === 'return' && e.at < now && e.o.status === 'issued' ? ' warn' : ''}`}>
              <div className="row" style={{ alignItems: 'baseline' }}>
                <strong>{fmtTime(e.at)} · {e.type === 'pickup' ? 'Выдача' : 'Возврат'} · {e.o.vehicle.title}</strong>
                <span className="muted small">{STATUS_LABEL[e.o.status]}</span>
              </div>
              <span className="text-2 small">{e.o.customer.fullName} · {e.o.number}</span>
            </Link>
          ))}
        </div>
      ) : <div className="muted small">Выдач и возвратов нет.</div>}
    </section>
  );
}
