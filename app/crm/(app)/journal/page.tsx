import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
import { can, type Perm } from '@/lib/permissions';
import { usersById } from '@/lib/crm-data';
import { DELETED_ENTITY } from '@/lib/trash';
import { STATUS_LABEL } from '@/lib/orders';
import { LEAD_KIND } from '@/lib/workspace';
import { CHANNELS } from '@/lib/channels';

const CHANNEL_NAMES = Object.fromEntries(Object.entries(CHANNELS).map(([k, c]) => [k, c.label]));

export const metadata = { title: 'Журнал' };

// Подписи полей удалённой записи — остальные поля показываются как есть.
const FIELD: Record<string, string> = {
  number: 'Номер', name: 'Имя', fullName: 'Клиент', phone: 'Телефон', email: 'E-mail', direction: 'Направление', channel: 'Канал', kind: 'Тип',
  status: 'Статус', stage: 'Этап', message: 'Сообщение', carInfo: 'Автомобиль', amount: 'Сумма, коп.', pickupAt: 'Выдача', returnAt: 'Возврат',
  cancelReason: 'Причина отмены', lostReason: 'Причина отказа', notes: 'Заметки', createdAt: 'Создано', source: 'Источник', site: 'Сайт',
};
const SKIP = new Set(['id', 'payload', 'utm', 'termsSnapshot', 'quoteSnapshot', 'services', 'idempotencyKey', 'customerId', 'vehicleId', 'assigneeId', 'handoverId', 'saleCarId', 'leadId', 'orderId', 'updatedAt', 'viewedAt', '_count']);

type Rec = Record<string, unknown>;
const VALUE: Record<string, Record<string, string>> = {
  direction: { rental: 'Прокат', sales: 'Автосалон', service: 'Сервис' },
  channel: CHANNEL_NAMES,
  kind: LEAD_KIND,
  status: { ...STATUS_LABEL, new: 'новая', in_progress: 'в работе', converted: 'обработана', rejected: 'отклонена', spam: 'спам' },
};
const fmt = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? fmtDateTime(new Date(v)) : typeof v === 'boolean' ? (v ? 'да' : 'нет') : String(v));

function Snapshot({ rec, names }: { rec: Rec; names: (id: unknown) => string }) {
  const scalars = Object.entries(rec).filter(([k, v]) => !SKIP.has(k) && v !== null && v !== '' && typeof v !== 'object');
  const nested = (['customer', 'vehicle'] as const).map((k) => rec[k] as Rec | undefined).filter(Boolean) as Rec[];
  const history = [
    ...((rec.notes as Rec[] | undefined) ?? []).map((n) => ({ at: n.createdAt, who: n.authorId, text: n.text })),
    ...((rec.events as Rec[] | undefined) ?? []).map((n) => ({ at: n.createdAt, who: n.actorId, text: n.text })),
    ...((rec.comments as Rec[] | undefined) ?? []).map((n) => ({ at: n.createdAt, who: n.authorId, text: `💬 ${n.body}` })),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return (
    <div className="stack" style={{ gap: 8, marginTop: 8 }}>
      <dl className="facts-grid small">
        {nested.map((n, i) => <div key={i}><span className="k">{'title' in n ? 'Автомобиль' : 'Клиент'}</span>{String(n.title ?? n.fullName ?? '')}{n.phone ? <span className="text-2">+{String(n.phone)}</span> : null}</div>)}
        {scalars.map(([k, v]) => <div key={k}><span className="k">{FIELD[k] ?? k}</span><span style={{ whiteSpace: 'pre-wrap' }}>{VALUE[k]?.[String(v)] ?? fmt(v)}</span></div>)}
      </dl>
      {history.length ? (
        <ul className="list small">
          {history.map((h, i) => <li key={i}><span className="muted" style={{ flex: '0 0 120px' }}>{fmt(h.at)}</span><span className="grow" style={{ whiteSpace: 'pre-wrap' }}>{String(h.text)}</span><span className="muted">{h.who ? names(h.who) : 'система'}</span></li>)}
        </ul>
      ) : null}
    </div>
  );
}

export default async function Journal({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser(['records.delete', 'users.manage']);
  const all = (await searchParams).all === '1' && can(user, 'users.manage');
  const byId = await usersById();
  const names = (id: unknown) => byId.get(String(id))?.fullName ?? '—';
  const rows = await db.auditLog.findMany({ where: all ? {} : { action: { in: ['lead.delete', 'order.delete', 'customer.delete'] } }, orderBy: { createdAt: 'desc' }, take: all ? 200 : 300 });
  // Руководитель видит удаления только по своим разделам.
  const visible = rows.filter((r) => {
    if (all || user.role === 'owner') return true;
    const d = (() => { try { return JSON.parse(r.details ?? '{}') as { record?: Rec }; } catch { return {}; } })();
    if (r.entity === 'lead') return can(user, `leads.${String(d.record?.direction ?? '')}` as Perm);
    if (r.entity === 'order') return can(user, 'rental.read');
    return can(user, 'customers.read');
  });

  return (
    <>
      <div className="toolbar">
        <h1>Журнал</h1>
        <div className="grow" />
        {can(user, 'users.manage') ? (
          <span className="wrap-row">
            <Link className={`chip${all ? '' : ' on'}`} href="/crm/journal">Удалённые записи</Link>
            <Link className={`chip${all ? ' on' : ''}`} href="/crm/journal?all=1">Все изменения</Link>
          </span>
        ) : null}
      </div>
      <p className="muted small">{all ? 'Последние 200 действий сотрудников.' : 'Удалённые заявки, заказы и клиенты. Из рабочих разделов они убраны, здесь хранится полная копия со всей историей.'}</p>
      <section className="card pad stack" style={{ gap: 0 }}>
        {visible.map((r) => {
          const d = (() => { try { return JSON.parse(r.details ?? 'null') as { title?: string; record?: Rec } | null; } catch { return null; } })();
          const del = r.action.endsWith('.delete') && d?.record;
          return (
            <details key={r.id} style={{ borderBottom: '1px solid var(--line)', padding: '10px 0' }}>
              <summary className="wrap-row small" style={{ cursor: 'pointer', gap: '4px 12px' }}>
                <span className="muted" style={{ flex: '0 0 120px' }}>{fmtDateTime(r.createdAt)}</span>
                {del ? <span className="tag warn">{DELETED_ENTITY[r.entity] ?? r.entity}</span> : <span className="tag">{r.action}</span>}
                <span className="grow">{d?.title ?? (del ? '' : r.details?.slice(0, 160))}</span>
                <span>{r.actorId ? names(r.actorId) : 'система'}</span>
              </summary>
              {del ? <Snapshot rec={d!.record!} names={names} /> : r.details ? <pre className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{r.details}</pre> : null}
            </details>
          );
        })}
        {!visible.length ? <p className="muted">Пока пусто</p> : null}
      </section>
    </>
  );
}
