import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { db, json } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
import { can, directionsOf, DIRECTION_LABEL, type Direction } from '@/lib/permissions';
import { formatPhone } from '@/lib/orders';
import { usersById } from '@/lib/crm-data';
import { ActionForm } from '@/components/crm/ActionForm';
import { leadAction } from '../../actions';

export const metadata = { title: 'Заявки' };

const STATUS: Record<string, string> = { new: 'Новая', in_progress: 'В работе', converted: 'Заказ создан', rejected: 'Отклонена', spam: 'Спам' };
const KIND: Record<string, string> = { booking_request: 'Бронирование', callback: 'Обратный звонок', purchase: 'Покупка', service_request: 'Запись в сервис' };

export default async function Leads({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser(['leads.rental', 'leads.sales', 'leads.service']);
  const sp = await searchParams;
  const dirs = directionsOf(user).filter((d) => can(user, `leads.${d}` as never));
  const dir = (sp.dir && dirs.includes(sp.dir as Direction) ? sp.dir : dirs[0]) as Direction;
  if (!dir) redirect('/crm/no-access');
  const status = sp.status ?? 'open';
  const [leads, users, counts] = await Promise.all([
    db.lead.findMany({ where: { direction: dir, ...(status === 'open' ? { status: { in: ['new', 'in_progress'] } } : status === 'all' ? {} : { status }) }, orderBy: { createdAt: 'desc' }, take: 200 }),
    usersById(),
    db.lead.groupBy({ by: ['direction'], where: { status: 'new', direction: { in: dirs } }, _count: true }),
  ]);
  const now = Date.now();

  return (
    <>
      <div className="toolbar">
        <h1>Заявки</h1>
        <nav className="seg" aria-label="Направление">
          {dirs.map((d) => {
            const n = counts.find((c) => c.direction === d)?._count;
            return <Link key={d} href={`/crm/leads?dir=${d}`} aria-current={d === dir ? 'page' : undefined}>{DIRECTION_LABEL[d]}{n ? ` · ${n}` : ''}</Link>;
          })}
        </nav>
      </div>
      <nav className="wrap-row" style={{ gap: 8 }}>
        {[['open', 'Открытые'], ['converted', 'С заказом'], ['rejected', 'Отклонённые'], ['spam', 'Спам'], ['all', 'Все']].map(([k, l]) => <Link key={k} className={`chip${status === k ? ' on' : ''}`} href={`/crm/leads?dir=${dir}&status=${k}`}>{l}</Link>)}
      </nav>
      {dir !== 'rental' ? <div className="notice">Модуль {dir === 'sales' ? 'продаж автомобилей' : 'автосервиса'} в первой версии содержит только входящие обращения. Сделки, заказ-наряды и расписание появятся на следующих этапах.</div> : null}
      <div className="stack" style={{ gap: 10 }}>
        {leads.map((l) => {
          const payload = json<Record<string, unknown>>(l.payload, {});
          const utm = json<Record<string, string>>(l.utm, {});
          const stale = l.status === 'new' && !l.assigneeId && now - l.createdAt.getTime() > 15 * 60000;
          return (
            <article key={l.id} className="card pad wrap-row" style={{ alignItems: 'flex-start', gap: '10px 20px' }}>
              <div style={{ flex: '2 1 280px' }} className="stack">
                <div className="wrap-row" style={{ gap: 8 }}>
                  <strong>{l.name}</strong>
                  <a href={`tel:+${l.phone}`}>{formatPhone(l.phone)}</a>
                  <span className={`tag ${l.status === 'new' ? 'gold' : ''}`}>{STATUS[l.status]}</span>
                  {stale ? <span className="tag warn">без ответственного более 15 мин</span> : null}
                </div>
                <span className="text-2 small">{KIND[l.kind] ?? l.kind} · {fmtDateTime(l.createdAt)} · сайт: {l.site}{Object.keys(utm).length ? ` · ${Object.entries(utm).map(([k, v]) => `${k}=${v}`).join(', ')}` : ''}</span>
                {payload.vehicle ? <span className="small">{String(payload.vehicle)}</span> : null}
                {payload.car ? <span className="small">Автомобиль: {String(payload.car)}</span> : null}
                {l.message ? <span className="small">«{l.message}»</span> : null}
                <span className="muted small">Ответственный: {l.assigneeId ? users.get(l.assigneeId)?.fullName : 'не назначен'}</span>
              </div>
              <div className="wrap-row" style={{ flex: '1 1 260px', justifyContent: 'flex-end' }}>
                {l.orderId ? <Link className="btn btn-sm btn-primary" href={`/crm/orders/${l.orderId}`}>Открыть заказ</Link> : null}
                {!l.orderId && dir === 'rental' && can(user, 'rental.write') ? <Link className="btn btn-sm btn-primary" href={`/crm/orders/new?lead=${l.id}`}>Создать заказ</Link> : null}
                {l.status === 'new' ? <ActionForm action={leadAction} hidden={{ leadId: l.id, status: 'in_progress' }} submit="Взять в работу" variant="ghost" /> : null}
                {dir !== 'rental' && l.status === 'in_progress' ? <ActionForm action={leadAction} hidden={{ leadId: l.id, status: 'converted' }} submit="Обработана" variant="ghost" /> : null}
                {['new', 'in_progress'].includes(l.status) && !l.orderId ? <ActionForm action={leadAction} hidden={{ leadId: l.id, status: 'rejected' }} submit="Отклонить" variant="quiet" /> : null}
                {l.status === 'new' && !l.orderId ? <ActionForm action={leadAction} hidden={{ leadId: l.id, status: 'spam' }} submit="Спам" variant="quiet" /> : null}
              </div>
            </article>
          );
        })}
        {!leads.length ? <div className="empty">Заявок нет</div> : null}
      </div>
    </>
  );
}
