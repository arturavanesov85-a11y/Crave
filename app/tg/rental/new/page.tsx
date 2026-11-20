// Мини-приложение → «Новая бронь»: та же форма, что в CRM, после создания — карточка заказа в приложении.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { addMinutes, parseLocal, toLocalInput } from '@/lib/dates';
import { can } from '@/lib/permissions';
import { TgLogin } from '@/components/tg/TgLogin';
import { NewOrderForm } from '@/app/crm/(app)/orders/new/NewOrderForm';

export const dynamic = 'force-dynamic';

export default async function TgNewOrder({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await currentUser();
  if (!user) return <TgLogin />;
  if (!can(user, 'tg.rental') || !can(user, 'rental.write')) redirect('/tg/rental');
  const sp = await searchParams;
  const vehicles = await db.vehicle.findMany({ orderBy: { sortOrder: 'asc' }, include: { tariffs: { where: { status: 'active' }, take: 1 } } });
  const from = sp.from && parseLocal(sp.from) ? sp.from : toLocalInput(addMinutes(new Date(), 24 * 60)).slice(0, 11) + '10:00';
  const to = sp.to && parseLocal(sp.to) ? sp.to : toLocalInput(addMinutes(parseLocal(from)!, 3 * 24 * 60));
  return (
    <div className="stack" style={{ gap: 12, padding: '12px 14px 32px' }}>
      <Link href="/tg/rental" className="small">← Дела</Link>
      <h1 style={{ fontSize: 22, fontWeight: 600 }}>Новая бронь</h1>
      <NewOrderForm
        back="tg"
        vehicles={vehicles.map((v) => ({ id: v.id, slug: v.slug, title: v.title, published: v.isPublished, driverPerHour: v.tariffs[0]?.driverPerHour ?? null, driverOnly: v.tariffs[0]?.driverOnly ?? false }))}
        initial={{ vehicleId: sp.vehicle ?? vehicles[0]?.id ?? '', from, to, name: '', phone: '', leadId: '' }}
      />
    </div>
  );
}
