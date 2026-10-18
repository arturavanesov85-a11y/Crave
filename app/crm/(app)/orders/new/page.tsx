import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { addMinutes, parseLocal, toLocalInput } from '@/lib/dates';
import { NewOrderForm } from './NewOrderForm';

export const metadata = { title: 'Новый заказ' };

export default async function NewOrder({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser('rental.write');
  const sp = await searchParams;
  const vehicles = await db.vehicle.findMany({ orderBy: { sortOrder: 'asc' }, include: { tariffs: { where: { status: 'active' }, take: 1 } } });
  const lead = sp.lead ? await db.lead.findUnique({ where: { id: sp.lead } }) : null;
  const from = sp.from && parseLocal(sp.from) ? sp.from : toLocalInput(addMinutes(new Date(), 24 * 60)).slice(0, 11) + '10:00';
  const to = toLocalInput(addMinutes(parseLocal(from)!, 3 * 24 * 60));
  return (
    <>
      <h1>Новый заказ</h1>
      <NewOrderForm
        vehicles={vehicles.map((v) => ({ id: v.id, slug: v.slug, title: v.title, published: v.isPublished, driverPerHour: v.tariffs[0]?.driverPerHour ?? null }))}
        initial={{ vehicleId: sp.vehicle ?? vehicles[0]?.id ?? '', from, to, name: lead?.name ?? '', phone: lead?.phone ?? '', leadId: lead?.id ?? '' }}
      />
    </>
  );
}
