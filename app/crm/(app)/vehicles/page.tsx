import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { db, json } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
import { isActive } from '@/lib/booking';
import { can } from '@/lib/permissions';
import { rub } from '@/lib/money';
import { DRIVER_MIN_HOURS, type Tier } from '@/lib/pricing';
import { COND_LABEL, DIRECTION_URLS } from '@/lib/site';
import { vehicleOrderAction, vehiclePublishAction } from '../../actions';
import { VehiclesTable, type VehicleRow } from './VehiclesTable';

export const metadata = { title: 'Автомобили' };

export default async function Vehicles() {
  const user = await requireUser('fleet.read');
  const now = new Date();
  const vehicles = await db.vehicle.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      occupancies: { where: { releasedAt: null, blockedUntil: { gt: now } }, include: { order: true }, orderBy: { startsAt: 'asc' } },
      documents: true,
      damages: { where: { status: 'open' } },
      tariffs: { where: { status: 'active' }, orderBy: { validFrom: 'desc' }, take: 1 },
    },
  });

  const rows: VehicleRow[] = vehicles.map((v) => {
    const occ = v.occupancies.filter((o) => isActive(o, now));
    const current = occ.find((o) => o.startsAt <= now && o.endsAt > now) ?? occ.find((o) => o.kind === 'rental');
    const next = occ.find((o) => o.startsAt > now);
    const expiring = v.documents.filter((d) => d.validUntil && d.validUntil < new Date(now.getTime() + 30 * 86400000));
    const t = v.tariffs[0];
    const tiers = t ? json<Tier[]>(t.tiers, []) : [];
    const minRate = tiers.length ? Math.min(...tiers.map((x) => x.dailyRate)) : 0;
    const tariff = !t ? 'тариф не задан' : t.driverOnly ? `с водителем ${t.driverPerHour ? rub(t.driverPerHour) : '—'}/ч, от ${DRIVER_MIN_HOURS} ч` : `от ${rub(minRate)}/сут`;
    // Галочка «на сайте» стоит, но машину всё равно не видно — объясняем почему.
    const siteNote = v.isPublished && !t ? 'нет тарифа' : null;
    return {
      id: v.id,
      title: v.title,
      year: v.year,
      photo: json<string[]>(v.photos, [])[0] ?? null,
      published: v.isPublished,
      siteNote,
      tariff,
      state: current?.kind === 'rental' ? 'В аренде' : COND_LABEL[v.condition],
      stateTone: v.condition === 'ready' ? 'ok' : v.condition === 'unavailable' ? 'warn' : '',
      damages: v.damages.length,
      current: current ? { label: current.order?.number ?? current.note ?? '', href: current.orderId ? `/crm/orders/${current.orderId}` : null, until: fmtDateTime(current.endsAt), overdue: current.kind === 'rental' && current.endsAt < now } : null,
      next: next ? { label: next.order?.number ?? next.note ?? '', href: next.orderId ? `/crm/orders/${next.orderId}` : null, at: fmtDateTime(next.startsAt) } : null,
      mileage: `${v.mileageKm.toLocaleString('ru-RU')} км`,
      docs: expiring.length ? expiring.map((d) => d.title).join(', ') : null,
      service: !!((v.nextServiceKm != null && v.mileageKm >= v.nextServiceKm - 1000) || (v.nextServiceAt && v.nextServiceAt < new Date(now.getTime() + 14 * 86400000))),
      plate: v.plate,
    };
  });
  const shown = rows.filter((r) => r.published && !r.siteNote).length;

  return (
    <>
      <div className="toolbar">
        <h1>Автомобили</h1>
        <span className="muted small">на сайте {shown} из {rows.length}</span>
        <div className="grow" />
        <a className="btn btn-quiet btn-sm" href={`${DIRECTION_URLS.rental.replace(/\/$/, '')}/avtopark`} target="_blank" rel="noreferrer">Открыть сайт проката</a>
        {can(user, 'fleet.write') ? <Link className="btn btn-primary btn-sm" href="/crm/vehicles/new">Добавить автомобиль</Link> : null}
      </div>
      <VehiclesTable rows={rows} orderAction={vehicleOrderAction} publishAction={vehiclePublishAction} canWrite={can(user, 'fleet.write')} showPlate={can(user, 'vehicle.sensitive')} />
    </>
  );
}
