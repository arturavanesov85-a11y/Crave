import { db, json } from './db';
import { fromPrice, type Tier } from './pricing';
import { toTariff } from './rules';

export type PublicVehicle = Awaited<ReturnType<typeof publicVehicles>>[number];

/** Опубликованные машины с действующим тарифом. Без VIN, госномера и данных о бронях. */
export async function publicVehicles() {
  const rows = await db.vehicle.findMany({
    where: { isPublished: true },
    orderBy: { sortOrder: 'asc' },
    include: { tariffs: { where: { status: 'active' }, orderBy: { validFrom: 'desc' }, take: 1 } },
  });
  return rows
    .filter((v) => v.tariffs.length)
    .map((v) => {
      const t = toTariff(v.tariffs[0]);
      return {
        id: v.id,
        slug: v.slug,
        title: v.title,
        make: v.make,
        year: v.year,
        bodyType: v.bodyType,
        powerHp: v.powerHp,
        accel: v.accel,
        drive: v.drive,
        fuel: v.fuel,
        seats: v.seats,
        colorExterior: v.colorExterior,
        colorInterior: v.colorInterior,
        description: v.description,
        equipment: json<string[]>(v.equipment, []),
        tariff: t,
        from: fromPrice(t.tiers),
        shortRate: [...t.tiers].sort((a: Tier, b: Tier) => a.minDays - b.minDays)[0]?.dailyRate ?? 0,
      };
    });
}

export async function publicVehicle(slug: string) {
  return (await publicVehicles()).find((v) => v.slug === slug) ?? null;
}
