import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
import { isActive } from '@/lib/booking';
import { can } from '@/lib/permissions';
import { COND_LABEL } from '@/lib/site';

export const metadata = { title: 'Автомобили' };

export default async function Vehicles() {
  const user = await requireUser('fleet.read');
  const now = new Date();
  const vehicles = await db.vehicle.findMany({ orderBy: { sortOrder: 'asc' }, include: { occupancies: { where: { releasedAt: null, blockedUntil: { gt: now } }, include: { order: true }, orderBy: { startsAt: 'asc' } }, documents: true, damages: { where: { status: 'open' } } } });
  return (
    <>
      <h1>Автомобили</h1>
      <div className="table-box">
        <table className="table">
          <thead><tr><th>Автомобиль</th><th>Состояние</th><th>Сейчас</th><th>Следующее</th><th className="num">Пробег</th><th>Документы и ТО</th>{can(user, 'vehicle.sensitive') ? <th>Госномер</th> : null}</tr></thead>
          <tbody>
            {vehicles.map((v) => {
              const occ = v.occupancies.filter((o) => isActive(o, now));
              const current = occ.find((o) => o.startsAt <= now && o.endsAt > now) ?? occ.find((o) => o.kind === 'rental');
              const next = occ.find((o) => o.startsAt > now);
              const expiring = v.documents.filter((d) => d.validUntil && d.validUntil < new Date(now.getTime() + 30 * 86400000));
              const svc = (v.nextServiceKm != null && v.mileageKm >= v.nextServiceKm - 1000) || (v.nextServiceAt && v.nextServiceAt < new Date(now.getTime() + 14 * 86400000));
              return (
                <tr key={v.id}>
                  <td><Link href={`/crm/vehicles/${v.id}`} style={{ fontWeight: 600 }}>{v.title}</Link><div className="muted small">{v.year}{v.isPublished ? '' : ' · скрыт на сайте'}</div></td>
                  <td><span className={`tag ${v.condition === 'ready' ? 'ok' : v.condition === 'unavailable' ? 'warn' : ''}`}>{current?.kind === 'rental' ? 'В аренде' : COND_LABEL[v.condition]}</span>{v.damages.length ? <div className="warn small">повреждений: {v.damages.length}</div> : null}</td>
                  <td className="small">{current ? <>{current.order ? <Link href={`/crm/orders/${current.orderId}`}>{current.order.number}</Link> : current.note} · до {fmtDateTime(current.endsAt)}{current.kind === 'rental' && current.endsAt < now ? <div className="warn">просрочка</div> : null}</> : <span className="muted">свободен</span>}</td>
                  <td className="small">{next ? <>{next.order ? <Link href={`/crm/orders/${next.orderId}`}>{next.order.number}</Link> : next.note} · {fmtDateTime(next.startsAt)}</> : <span className="muted">—</span>}</td>
                  <td className="num">{v.mileageKm.toLocaleString('ru-RU')} км</td>
                  <td className="small">{expiring.length ? <span className="warn">{expiring.map((d) => d.title).join(', ')}</span> : null}{svc ? <div className="warn">ТО скоро</div> : null}{!expiring.length && !svc ? <span className="muted">в порядке</span> : null}</td>
                  {can(user, 'vehicle.sensitive') ? <td className="small">{v.plate ?? <span className="muted">—</span>}</td> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
