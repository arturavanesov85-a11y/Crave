// Мини-приложение → выдача или возврат: та же форма осмотра, что в CRM, с возвратом в приложение.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { db, json } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
import { inspectionHints } from '@/lib/inspection';
import { rub } from '@/lib/money';
import { returnExtras, type QuoteOk, type Terms } from '@/lib/orders';
import { can } from '@/lib/permissions';
import { TgLogin } from '@/components/tg/TgLogin';
import { InspectionForm } from '@/app/crm/(app)/orders/[id]/inspection/InspectionForm';

export const dynamic = 'force-dynamic';

export default async function TgInspection({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await currentUser();
  if (!user) return <TgLogin />;
  if (!can(user, 'tg.rental') || !can(user, 'rental.inspect')) redirect('/tg/rental');
  const { id } = await params;
  const kind = (await searchParams).kind === 'return' ? 'return' : 'pickup';
  const o = await db.rentalOrder.findUnique({ where: { id }, include: { vehicle: true, customer: true, inspections: true } });
  if (!o) notFound();
  if (!can(user, 'rental.read') && o.handoverId !== user.id) redirect('/tg/rental');
  const expected = kind === 'pickup' ? 'confirmed' : 'issued';
  const damages = await db.damage.findMany({ where: { vehicleId: o.vehicleId, status: 'open' } });
  const pickup = o.inspections.find((i) => i.kind === 'pickup');
  const q = json<QuoteOk>(o.quoteSnapshot, null as never);
  const terms = json<Terms>(o.termsSnapshot, null as never);
  const late = kind === 'return' ? returnExtras(o, q, terms, pickup?.mileageKm ?? null, pickup?.mileageKm ?? 0, new Date()) : null;

  return (
    <div className="stack" style={{ gap: 12, padding: '12px 14px 32px' }}>
      <Link href={`/tg/rental/order/${id}`} className="small">← Заказ {o.number}</Link>
      <h1 style={{ fontSize: 22, fontWeight: 600 }}>{kind === 'pickup' ? 'Выдача' : 'Возврат'} · {o.vehicle.title}</h1>
      <div className="card pad stack" style={{ gap: 4 }}>
        <span className="text-2">{o.customer.fullName} · {kind === 'pickup' ? `выдача ${fmtDateTime(o.pickupAt)}` : `возврат по плану ${fmtDateTime(o.returnAt)}`}</span>
        {kind === 'return' && pickup ? <span className="text-2 small">При выдаче: {pickup.mileageKm.toLocaleString('ru-RU')} км, топливо {pickup.fuelPercent}%. Включено {q.includedKm} км, сверх — {rub(terms.tariff.overmileagePerKm)} / км.</span> : null}
        {late && late.lateDays ? <span className="warn small">Опоздание: {Math.round(late.lateMin / 60)} ч ≈ {rub(late.lateAmount)}</span> : null}
        {damages.length ? <span className="small">Уже отмечено: {damages.map((d) => d.location).join(', ')}</span> : null}
      </div>
      {o.status !== expected ? (
        <div className="notice warn">Сейчас {kind === 'pickup' ? 'выдача' : 'приём'} невозможен — статус заказа изменился.</div>
      ) : (
        <InspectionForm id={id} kind={kind} back={`/tg/rental/order/${id}`} mileage={kind === 'return' ? pickup?.mileageKm ?? o.vehicle.mileageKm : o.vehicle.mileageKm} {...(await inspectionHints(o.vehicleId))} />
      )}
    </div>
  );
}
