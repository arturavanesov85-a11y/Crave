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
    if (!l.trim()) continue; // пустые строки — отступы в тексте объявления, в списке комплектации не нужны
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
    photos: sitePhotos(c),
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

/** Фото для сайта, приложения и КП: если последнее фото — с госномером (только для Авито), его не показываем. */
export function sitePhotos(c: { photos: string | null; platePhoto?: boolean }): string[] {
  const all = json<string[]>(c.photos, []);
  return c.platePhoto && all.length > 1 ? all.slice(0, -1) : all;
}

/** Текст «Описание и комплектация», который подставляется в новое объявление. */
export const SALE_TEXT_TEMPLATE = [
  'CRAVE | DRIVE YOUR EMOTIONS', '',
  'Премиальные автомобили в наличии и под заказ', '',
  'CRAVE — продажа и индивидуальный подбор автомобилей премиум-класса с полным сопровождением сделки', '',
  '✓ Автомобили в наличии и поставка под заказ', '',
  '✓ Лизинг и автокредитование', '',
  '✓ Страхование ОСАГО и КАСКО', '',
  '✓ Прокат премиальных автомобилей', '',
  '✓ Сервисное обслуживание', '',
  'CRAVE — ваш автомобильный партнер', '',
  '━━━━━━━━━━━━━━━━━━━━', '',
  'ИНФОРМАЦИЯ ОБ АВТОМОБИЛЕ', '', '',
].join('\n');

/** Текст из поля в строки: пустые строки сохраняются (не больше одной подряд), по краям — убираются. */
export function textLines(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const l = raw.trimEnd();
    if (!l.trim() && (!out.length || !out[out.length - 1].trim())) continue;
    out.push(l.trim() ? l : '');
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out;
}
