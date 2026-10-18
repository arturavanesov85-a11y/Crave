import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { db, json } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
import { can } from '@/lib/permissions';
import { returnExtras, type QuoteOk, type Terms } from '@/lib/orders';
import { rub } from '@/lib/money';
import { InspectionForm } from './InspectionForm';

export const metadata = { title: 'Осмотр' };

/** Подсказки из ранее введённых повреждений и заметок: сначала по этой машине, затем частые. */
async function inspectionHints(vehicleId: string) {
  const [damages, notes] = await Promise.all([
    db.damage.findMany({ orderBy: { createdAt: 'desc' }, take: 300, select: { vehicleId: true, location: true, description: true } }),
    db.inspection.findMany({ where: { notes: { not: null } }, orderBy: { performedAt: 'desc' }, take: 200, select: { notes: true } }),
  ]);
  const rank = (items: { key: string; own: boolean }[], limit: number) => {
    const score = new Map<string, number>();
    for (const i of items) if (i.key) score.set(i.key, (score.get(i.key) ?? 0) + (i.own ? 5 : 1));
    return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k]) => k);
  };
  return {
    damageHints: rank(damages.map((d) => ({ key: d.description && d.description !== d.location ? `${d.location} — ${d.description}` : d.location, own: d.vehicleId === vehicleId })), 10),
    locationHints: rank(damages.map((d) => ({ key: d.location, own: d.vehicleId === vehicleId })), 30),
    descriptionHints: rank(damages.map((d) => ({ key: d.description, own: false })), 30),
    noteHints: rank(notes.map((n) => ({ key: (n.notes ?? '').trim().slice(0, 80), own: false })), 8),
  };
}

export default async function Inspection({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser('rental.inspect');
  const { id } = await params;
  const kind = (await searchParams).kind === 'return' ? 'return' : 'pickup';
  const o = await db.rentalOrder.findUnique({ where: { id }, include: { vehicle: true, customer: true, inspections: true } });
  if (!o) notFound();
  if (!can(user, 'rental.read') && o.handoverId !== user.id) redirect('/crm/no-access');
  const expected = kind === 'pickup' ? 'confirmed' : 'issued';
  const damages = await db.damage.findMany({ where: { vehicleId: o.vehicleId, status: 'open' } });
  const pickup = o.inspections.find((i) => i.kind === 'pickup');
  const q = json<QuoteOk>(o.quoteSnapshot, null as never);
  const terms = json<Terms>(o.termsSnapshot, null as never);
  const late = kind === 'return' ? returnExtras(o, q, terms, pickup?.mileageKm ?? null, pickup?.mileageKm ?? 0, new Date()) : null;

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <Link href={`/crm/orders/${id}?tab=handover`} className="small">← Заказ {o.number}</Link>
      <h1>{kind === 'pickup' ? 'Выдача автомобиля' : 'Возврат автомобиля'}</h1>
      <div className="card pad stack" style={{ gap: 4 }}>
        <strong>{o.vehicle.title}</strong>
        <span className="text-2">{o.customer.fullName} · {kind === 'pickup' ? `выдача ${fmtDateTime(o.pickupAt)}` : `возврат по плану ${fmtDateTime(o.returnAt)}`}</span>
        {kind === 'return' && pickup ? <span className="text-2 small">При выдаче: {pickup.mileageKm.toLocaleString('ru-RU')} км, топливо {pickup.fuelPercent}%. Включено {q.includedKm} км, сверх — {rub(terms.tariff.overmileagePerKm)} / км.</span> : null}
        {late && late.lateDays ? <span className="warn small">Опоздание: {Math.round(late.lateMin / 60)} ч — по правилу (не утверждено) это {late.lateDays} сут. ≈ {rub(late.lateAmount)}</span> : null}
      </div>
      {o.status !== expected ? (
        <div className="notice warn">Заказ в статусе, где {kind === 'pickup' ? 'выдача' : 'возврат'} невозможен. Вернитесь в карточку заказа.</div>
      ) : (
        <>
          <div className="card pad stack" style={{ gap: 6 }}>
            <h2>Уже зафиксированные повреждения</h2>
            {damages.length ? damages.map((d) => <div key={d.id} className="small"><strong>{d.location}</strong> — {d.description} <span className="muted">({fmtDateTime(d.createdAt)})</span></div>) : <span className="muted small">Нет</span>}
          </div>
          <InspectionForm id={id} kind={kind} mileage={kind === 'return' ? pickup?.mileageKm ?? o.vehicle.mileageKm : o.vehicle.mileageKm} {...(await inspectionHints(o.vehicleId))} />
        </>
      )}
    </div>
  );
}
