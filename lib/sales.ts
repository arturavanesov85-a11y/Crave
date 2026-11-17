// Автомобили в продаже (сайт автосалона).
import { db, json } from './db';

export const SALE_STATUS: Record<string, string> = { draft: 'Черновик', published: 'В продаже', reserved: 'Забронирован', sold: 'Продан' };
export const SUPPLY: Record<string, string> = { stock: 'В наличии', transit: 'В пути', order: 'Под заказ' };
export const DEAL_KIND: Record<string, string> = { reserved: 'Бронь', sold: 'Продажа' };

/** Паспортные данные покупателя для ДКП. */
export const BUYER_FIELDS = [
  ['fullName', 'ФИО полностью'],
  ['birthDate', 'Дата рождения'],
  ['birthPlace', 'Место рождения'],
  ['passport', 'Паспорт: серия и номер'],
  ['issuedBy', 'Кем выдан'],
  ['issuedAt', 'Дата выдачи'],
  ['divisionCode', 'Код подразделения'],
  ['address', 'Адрес регистрации'],
] as const;
export type Buyer = Partial<Record<(typeof BUYER_FIELDS)[number][0], string>>;

/** Комплектация: строка, которая заканчивается двоеточием, — заголовок группы («Салон и комфорт:»). */
export function equipmentGroups(lines: string[]): { title: string | null; items: string[] }[] {
  const out: { title: string | null; items: string[] }[] = [];
  for (const l of lines) {
    if (/:\s*$/.test(l)) out.push({ title: l.replace(/:\s*$/, ''), items: [] });
    else {
      if (!out.length) out.push({ title: null, items: [] });
      out[out.length - 1].items.push(l);
    }
  }
  return out.filter((g) => g.items.length);
}

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
    priceVat: c.priceVat,
    bodyType: c.bodyType,
    powerHp: c.powerHp,
    engine: c.engine,
    transmission: c.transmission,
    drive: c.drive,
    color: c.color,
    colorInterior: c.colorInterior,
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
