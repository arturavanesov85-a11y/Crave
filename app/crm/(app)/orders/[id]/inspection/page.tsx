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
          <InspectionForm id={id} kind={kind} mileage={kind === 'return' ? pickup?.mileageKm ?? o.vehicle.mileageKm : o.vehicle.mileageKm} />
        </>
      )}
    </div>
  );
}
