// Автомобили в продаже (сайт автосалона).
import { db, json } from './db';

export const SALE_STATUS: Record<string, string> = { draft: 'Черновик', published: 'В продаже', reserved: 'Забронирован', sold: 'Продан' };

export function toPublic(c: Awaited<ReturnType<typeof db.saleCar.findFirstOrThrow>>) {
  return {
    id: c.id,
    slug: c.slug,
    status: c.status,
    title: c.title,
    make: c.make,
    model: c.model,
    year: c.year,
    mileageKm: c.mileageKm,
    price: c.price,
    bodyType: c.bodyType,
    powerHp: c.powerHp,
    engine: c.engine,
    transmission: c.transmission,
    drive: c.drive,
    color: c.color,
    description: c.description,
    equipment: json<string[]>(c.equipment, []),
    photos: json<string[]>(c.photos, []),
  };
}

/** На сайте показываются машины в продаже и забронированные; черновики и проданные — нет. */
export async function publicSaleCars() {
  const rows = await db.saleCar.findMany({ where: { status: { in: ['published', 'reserved'] } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
  return rows.map(toPublic);
}

export async function publicSaleCar(slug: string) {
  const c = await db.saleCar.findUnique({ where: { slug } });
  return c && ['published', 'reserved'].includes(c.status) ? toPublic(c) : null;
}
