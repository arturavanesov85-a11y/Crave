// Автомобили в продаже (сайт автосалона).
import { db, json } from './db';

export const SALE_STATUS: Record<string, string> = { draft: 'Черновик', published: 'В продаже', reserved: 'Забронирован', sold: 'Продан' };
export const SUPPLY: Record<string, string> = { stock: 'В наличии', transit: 'В пути', order: 'Под заказ' };

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
  // Сайт автосалона показывает только машины в наличии; «в пути» и «под заказ» — для сотрудников (мини-приложение).
  const rows = await db.saleCar.findMany({ where: { status: { in: ['published', 'reserved'] }, supply: 'stock' }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
  return rows.map(toPublic);
}

export async function publicSaleCar(slug: string) {
  const c = await db.saleCar.findUnique({ where: { slug } });
  return c && ['published', 'reserved'].includes(c.status) && c.supply === 'stock' ? toPublic(c) : null;
}
