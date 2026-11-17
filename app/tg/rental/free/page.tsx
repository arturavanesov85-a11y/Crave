// Мини-приложение → «Свободные машины»: выбрать даты — увидеть свободные машины и цену за весь срок.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { availableVehicleIds } from '@/lib/booking';
import { db } from '@/lib/db';
import { addMinutes, parseLocal, toLocalInput } from '@/lib/dates';
import { rub } from '@/lib/money';
import { quoteFor } from '@/lib/orders';
import { can } from '@/lib/permissions';
import { loadSettings } from '@/lib/rules';
import { TgLogin } from '@/components/tg/TgLogin';

export const dynamic = 'force-dynamic';

export default async function TgFree({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await currentUser();
  if (!user) return <TgLogin />;
  if (!can(user, 'tg.rental') || !can(user, 'rental.read')) redirect('/tg/rental');
  const sp = await searchParams;
  const defFrom = toLocalInput(addMinutes(new Date(), 24 * 60)).slice(0, 11) + '10:00';
  const from = sp.from && parseLocal(sp.from) ? sp.from : defFrom;
  const to = sp.to && parseLocal(sp.to) ? sp.to : toLocalInput(addMinutes(parseLocal(from)!, 3 * 24 * 60));
  const start = parseLocal(from)!;
  const end = parseLocal(to)!;
  const valid = end > start;
  const settings = await loadSettings();
  const free = valid ? await availableVehicleIds(start, end, settings.prepBufferMinutes) : new Set<string>();
  const vehicles = valid ? await db.vehicle.findMany({ where: { id: { in: [...free] }, condition: { not: 'unavailable' } }, orderBy: { sortOrder: 'asc' } }) : [];
  const rows = await Promise.all(vehicles.map(async (v) => ({ v, q: (await quoteFor(v.id, start, end)).quote })));

  return (
    <div className="stack" style={{ gap: 12, padding: '12px 14px 32px' }}>
      <Link href="/tg/rental" className="small">← Дела</Link>
      <h1 style={{ fontSize: 22, fontWeight: 600 }}>Свободные машины</h1>
      <form className="card pad stack" style={{ gap: 8 }}>
        <label className="field">Получение<input className="input" type="datetime-local" name="from" defaultValue={from} required /></label>
        <label className="field">Возврат<input className="input" type="datetime-local" name="to" defaultValue={to} required /></label>
        <button className="btn btn-primary" type="submit" style={{ minHeight: 48 }}>Показать</button>
      </form>
      {!valid ? <div className="notice warn">Возврат должен быть позже получения.</div> : rows.length ? (
        <div className="tg-list">
          {rows.map(({ v, q }) => (
            <div key={v.id} className="tg-item">
              <div className="row" style={{ alignItems: 'baseline' }}>
                <strong>{v.title}</strong>
                {q.ok ? <strong>{rub(q.total)}</strong> : <span className="muted small">{q.error}</span>}
              </div>
              {q.ok ? <span className="text-2 small">{q.days} сут. × {rub(q.dailyRate)} · залог {rub(q.deposit)} · {q.includedKm} км{v.condition !== 'ready' ? ' · сейчас на подготовке' : ''}</span> : null}
              {q.ok && can(user, 'rental.write') ? <Link className="btn btn-quiet btn-sm" href={`/tg/rental/new?vehicle=${v.id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}>Забронировать</Link> : null}
            </div>
          ))}
        </div>
      ) : <div className="empty">На эти даты свободных машин нет.</div>}
    </div>
  );
}
