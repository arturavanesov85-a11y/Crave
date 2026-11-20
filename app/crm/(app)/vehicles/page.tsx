import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { db, json } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
import { isActive } from '@/lib/booking';
import { can } from '@/lib/permissions';
import { COND_LABEL, DIRECTION_URLS } from '@/lib/site';
import { SortableRows } from '@/components/crm/SortableRows';
import { vehicleOrderAction } from '../../actions';

export const metadata = { title: 'Автомобили' };

export default async function Vehicles() {
  const user = await requireUser('fleet.read');
  const now = new Date();
  const vehicles = await db.vehicle.findMany({ orderBy: { sortOrder: 'asc' }, include: { occupancies: { where: { releasedAt: null, blockedUntil: { gt: now } }, include: { order: true }, orderBy: { startsAt: 'asc' } }, documents: true, damages: { where: { status: 'open' } } } });
  return (
    <>
      <div className="toolbar">
        <h1>Автомобили</h1>
        <div className="grow" />
        <a className="btn btn-quiet btn-sm" href={DIRECTION_URLS.rental === '/' ? '/avtopark' : `${DIRECTION_URLS.rental}/avtopark`} target="_blank" rel="noreferrer">Открыть автопарк на сайте</a>
        {can(user, 'fleet.write') ? <Link className="btn btn-primary btn-sm" href="/crm/vehicles/new">Добавить автомобиль</Link> : null}
      </div>
      <SortableRows
        action={can(user, 'fleet.write') ? vehicleOrderAction : undefined}
        hint="Чтобы поменять порядок показа на сайте и в приложении, перетащите строку за значок ⠿."
        empty="Пока нет автомобилей."
        head={<><th>Фото</th><th>Автомобиль</th><th>На сайте</th><th>Состояние</th><th>Сейчас</th><th>Следующее</th><th className="num">Пробег</th><th>Документы и ТО</th>{can(user, 'vehicle.sensitive') ? <th>Госномер</th> : null}</>}
        rows={vehicles.map((v) => {
          const occ = v.occupancies.filter((o) => isActive(o, now));
          const current = occ.find((o) => o.startsAt <= now && o.endsAt > now) ?? occ.find((o) => o.kind === 'rental');
          const next = occ.find((o) => o.startsAt > now);
          const expiring = v.documents.filter((d) => d.validUntil && d.validUntil < new Date(now.getTime() + 30 * 86400000));
          const svc = (v.nextServiceKm != null && v.mileageKm >= v.nextServiceKm - 1000) || (v.nextServiceAt && v.nextServiceAt < new Date(now.getTime() + 14 * 86400000));
          const photo = json<string[]>(v.photos, [])[0];
          return {
            id: v.id,
            cells: (
              <>
                <td style={{ width: 96 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {photo ? <img src={photo} alt="" draggable={false} style={{ width: 84, height: 63, objectFit: 'cover', borderRadius: 6 }} /> : <span className="muted small">нет фото</span>}
                </td>
                <td><Link href={`/crm/vehicles/${v.id}`} style={{ fontWeight: 600 }}>{v.title}</Link><div className="muted small">{v.year}</div></td>
                <td><span className={`tag ${v.isPublished ? 'ok' : ''}`}>{v.isPublished ? 'Размещён' : 'Скрыт'}</span></td>
                <td><span className={`tag ${v.condition === 'ready' ? 'ok' : v.condition === 'unavailable' ? 'warn' : ''}`}>{current?.kind === 'rental' ? 'В аренде' : COND_LABEL[v.condition]}</span>{v.damages.length ? <div className="warn small">повреждений: {v.damages.length}</div> : null}</td>
                <td className="small">{current ? <>{current.order ? <Link href={`/crm/orders/${current.orderId}`}>{current.order.number}</Link> : current.note} · до {fmtDateTime(current.endsAt)}{current.kind === 'rental' && current.endsAt < now ? <div className="warn">просрочка</div> : null}</> : <span className="muted">свободен</span>}</td>
                <td className="small">{next ? <>{next.order ? <Link href={`/crm/orders/${next.orderId}`}>{next.order.number}</Link> : next.note} · {fmtDateTime(next.startsAt)}</> : <span className="muted">—</span>}</td>
                <td className="num">{v.mileageKm.toLocaleString('ru-RU')} км</td>
                <td className="small">{expiring.length ? <span className="warn">{expiring.map((d) => d.title).join(', ')}</span> : null}{svc ? <div className="warn">ТО скоро</div> : null}{!expiring.length && !svc ? <span className="muted">в порядке</span> : null}</td>
                {can(user, 'vehicle.sensitive') ? <td className="small">{v.plate ?? <span className="muted">—</span>}</td> : null}
              </>
            ),
          };
        })}
      />
    </>
  );
}
