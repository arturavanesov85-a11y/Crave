'use server';

// Автосалон в CRM: автомобили в продаже и тексты сайта автосалона.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { db, json } from '@/lib/db';
import { parseRub } from '@/lib/money';
import { parseLocal } from '@/lib/dates';
import { can, Forbidden } from '@/lib/permissions';
import { audit, normalizePhone } from '@/lib/orders';
import { BUYER_FIELDS, type Buyer } from '@/lib/sales';
import { removePublicFolder, removePublicPhoto, savePublicPhotos } from '@/lib/public-media';
import { AUTO_FIELDS } from '@/lib/site-settings';

export type ActionState = { error?: string; ok?: string } | undefined;

const SALE_STATUSES = ['draft', 'published', 'reserved', 'sold'];
const TRANSLIT: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const slugify = (s: string) => s.toLowerCase().split('').map((c) => TRANSLIT[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'avto';
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

async function guard() {
  const user = await currentUser();
  if (!user) throw new Forbidden('Сессия истекла — войдите снова');
  if (!can(user, 'sales.catalog')) throw new Forbidden();
  return user;
}

async function run(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const ok = await fn();
    revalidatePath('/crm', 'layout');
    revalidatePath('/auto', 'layout');
    return { ok: ok || 'Готово' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось выполнить действие' };
  }
}

/** Фото удаляется с диска, только если его не использует другое объявление. */
async function dropPhotoIfUnused(url: string, exceptId: string) {
  const others = await db.saleCar.count({ where: { id: { not: exceptId }, photos: { contains: url } } });
  if (!others) await removePublicPhoto(url);
}

export async function saleCarSaveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let newId = '';
  const res = await run(async () => {
    const user = await guard();
    const id = str(fd, 'id');
    const existing = id ? await db.saleCar.findUnique({ where: { id } }) : null;
    if (id && !existing) throw new Error('Автомобиль не найден');

    // При создании можно взять характеристики и фото машины из автопарка проката.
    const src = !id && str(fd, 'copyFrom') ? await db.vehicle.findUnique({ where: { id: str(fd, 'copyFrom') } }) : null;
    const make = str(fd, 'make') || src?.make || '';
    const model = str(fd, 'model') || src?.model || '';
    if (!make || !model) throw new Error('Укажите марку и модель');
    const year = Number(str(fd, 'year') || src?.year);
    if (!Number.isInteger(year) || year < 1950 || year > 2100) throw new Error('Проверьте год выпуска');
    const mileageKm = Number(str(fd, 'mileageKm') || 0);
    if (!Number.isInteger(mileageKm) || mileageKm < 0) throw new Error('Пробег — целое число км');
    const priceRaw = str(fd, 'price');
    const price = priceRaw ? parseRub(priceRaw) : null;
    if (priceRaw && !price) throw new Error('Цена — только цифры, в рублях');
    // Бронь и продажу ставят только через «Сделку» (с клиентом и ценой) — форма меняет лишь черновик ↔ в продаже.
    const asked = str(fd, 'status') || 'draft';
    if (!SALE_STATUSES.includes(asked)) throw new Error('Неизвестный статус');
    const locked = existing && ['reserved', 'sold'].includes(existing.status);
    if (!locked && ['reserved', 'sold'].includes(asked)) throw new Error('Бронь и продажа оформляются кнопками «Забронировать» и «Продано» — с клиентом и ценой');
    const status = locked ? existing.status : asked;
    const powerRaw = str(fd, 'powerHp') || (src ? String(src.powerHp) : '');
    const eqText = str(fd, 'equipment');
    const equipment = eqText ? eqText.split('\n').map((l) => l.trim()).filter(Boolean) : src ? json<string[]>(src.equipment, []) : [];

    // Поля каталога Авито: модификация проверяется по каталогу, остальное — как выбрали.
    const { findModification } = await import('@/lib/avito');
    const extra = {
      generation: str(fd, 'generation'), modification: str(fd, 'modification'), complectation: str(fd, 'complectation'),
      owners: str(fd, 'owners'), accident: str(fd, 'accident') || 'Не битый', wheel: str(fd, 'wheel') || 'Левый',
      // номер объявления на Авито задаётся в блоке «Авито», форма карточки его не трогает
      avitoId: existing ? (JSON.parse(existing.avito || '{}') as { avitoId?: string }).avitoId : undefined,
    };
    if (extra.modification && !(await findModification(make, model, extra.generation, extra.modification))) throw new Error('Такой модификации нет в каталоге Авито — выберите марку, модель, поколение и модификацию из списков');
    const data = {
      make,
      model,
      title: str(fd, 'title').slice(0, 80) || [make, model, extra.complectation].filter(Boolean).join(' '),
      avito: JSON.stringify(extra),
      year,
      mileageKm,
      price,
      priceVat: fd.get('priceVat') === 'on',
      status,
      bodyType: str(fd, 'bodyType') || src?.bodyType || 'sedan',
      powerHp: powerRaw ? Number(powerRaw) || null : null,
      engine: str(fd, 'engine') || src?.fuel || null,
      transmission: str(fd, 'transmission') || (src ? 'автомат' : null),
      drive: str(fd, 'drive') || src?.drive || null,
      color: str(fd, 'color') || src?.colorExterior || null,
      colorInterior: str(fd, 'colorInterior') || src?.colorInterior || null,
      description: str(fd, 'description') || src?.description || null,
      equipment: equipment.length ? JSON.stringify(equipment) : null,
      vin: str(fd, 'vin') || null,
      note: str(fd, 'note') || null,
      supply: ['stock', 'transit', 'order'].includes(str(fd, 'supply')) ? str(fd, 'supply') : 'stock',
      etaAt: str(fd, 'etaAt') ? parseLocal(str(fd, 'etaAt') + 'T12:00') : null,
      etaNote: str(fd, 'etaNote').slice(0, 80) || null,
    };

    if (existing) {
      const uploaded = await savePublicPhotos(fd.getAll('photos') as File[], `sales/${existing.id}`);
      const photos = [...json<string[]>(existing.photos, []), ...uploaded];
      await db.saleCar.update({ where: { id: existing.id }, data: { ...data, photos: JSON.stringify(photos), updatedAt: new Date() } });
      await audit(db, user.id, 'salecar.update', 'salecar', existing.id, { status, uploaded: uploaded.length });
      return uploaded.length ? `Сохранено, добавлено фото: ${uploaded.length}` : 'Сохранено';
    }

    const base = slugify(`${make} ${model} ${year}`);
    let slug = base;
    for (let i = 2; await db.saleCar.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
    // Новая машина — первой в списке; дальше порядок меняют перетаскиванием.
    const top = await db.saleCar.aggregate({ _min: { sortOrder: true } });
    const sortOrder = (top._min.sortOrder ?? 1) - 1;
    const car = await db.saleCar.create({ data: { ...data, slug, sortOrder, createdById: user.id, photos: src?.photos ?? null } });
    const uploaded = await savePublicPhotos(fd.getAll('photos') as File[], `sales/${car.id}`);
    if (uploaded.length) await db.saleCar.update({ where: { id: car.id }, data: { photos: JSON.stringify([...json<string[]>(car.photos, []), ...uploaded]) } });
    await audit(db, user.id, 'salecar.create', 'salecar', car.id, { title: car.title, copyFrom: src?.slug });
    newId = car.id;
  });
  if (res?.error || !newId) return res;
  redirect(`/crm/sales-cars/${newId}`);
}

/** Новый порядок фото: тот же набор, что сейчас, иначе страница устарела. */
function reorder(current: string[], raw: string): string[] {
  let order: unknown;
  try { order = JSON.parse(raw); } catch { throw new Error('Не удалось прочитать порядок фото'); }
  if (!Array.isArray(order) || order.length !== current.length || !current.every((p) => order.includes(p))) throw new Error('Фото изменились — обновите страницу');
  return order as string[];
}

export async function saleCarPhotoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await guard();
    const car = await db.saleCar.findUniqueOrThrow({ where: { id: str(fd, 'id') } });
    const photos = json<string[]>(car.photos, []);
    if (str(fd, 'op') === 'reorder') {
      const order = reorder(photos, str(fd, 'order'));
      await db.saleCar.update({ where: { id: car.id }, data: { photos: JSON.stringify(order), updatedAt: new Date() } });
      return 'Порядок сохранён';
    }
    const url = str(fd, 'photo');
    const i = photos.indexOf(url);
    if (i < 0) throw new Error('Фото не найдено');
    const op = str(fd, 'op');
    if (op === 'remove') {
      photos.splice(i, 1);
      await dropPhotoIfUnused(url, car.id);
    } else if (op === 'cover') photos.unshift(...photos.splice(i, 1));
    else if (op === 'left' && i > 0) [photos[i - 1], photos[i]] = [photos[i], photos[i - 1]];
    else if (op === 'right' && i < photos.length - 1) [photos[i + 1], photos[i]] = [photos[i], photos[i + 1]];
    await db.saleCar.update({ where: { id: car.id }, data: { photos: JSON.stringify(photos), updatedAt: new Date() } });
    return op === 'remove' ? 'Фото удалено' : 'Порядок обновлён';
  });
}

/** Порядок машин в каталоге (сайт и мини-приложение): список id сверху вниз. */
export async function saleCarOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard();
    let order: unknown;
    try { order = JSON.parse(str(fd, 'order')); } catch { throw new Error('Не удалось прочитать порядок'); }
    const ids = (await db.saleCar.findMany({ select: { id: true } })).map((c) => c.id);
    if (!Array.isArray(order) || order.length !== ids.length || !ids.every((id) => order.includes(id))) throw new Error('Список изменился — обновите страницу');
    await db.$transaction((order as string[]).map((id, i) => db.saleCar.update({ where: { id }, data: { sortOrder: i } })));
    await audit(db, user.id, 'salecar.order', 'salecar', 'all', { count: ids.length });
    return 'Порядок сохранён';
  });
}

function dealFields(fd: FormData) {
  const clientName = str(fd, 'clientName').slice(0, 120);
  if (!clientName) throw new Error('Укажите имя клиента');
  const clientPhone = normalizePhone(str(fd, 'clientPhone'));
  if (!clientPhone) throw new Error('Телефон клиента — 10 цифр, например +7 999 123-45-67');
  const price = parseRub(str(fd, 'price'));
  if (!price) throw new Error('Укажите стоимость, ₽');
  return { clientName, clientPhone, price, priceVat: fd.get('priceVat') === 'on', note: str(fd, 'note').slice(0, 500) || null };
}

/** Клиент сделки попадает в общую базу клиентов (направление «Продажи»). */
async function saleCustomer(name: string, phone: string) {
  const c = await db.customer.upsert({ where: { phone }, update: {}, create: { fullName: name, phone } });
  await db.customerDirection.upsert({ where: { customerId_direction: { customerId: c.id, direction: 'sales' } }, update: {}, create: { customerId: c.id, direction: 'sales' } });
  return c.id;
}

/**
 * Бронь и продажа. op: reserve | sell — новая сделка (имя, телефон, цена обязательны);
 * update — поправить клиента и цену; buyer — паспортные данные для ДКП; release — вернуть в продажу.
 */
export async function saleDealAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard();
    const car = await db.saleCar.findUniqueOrThrow({ where: { id: str(fd, 'id') } });
    const active = await db.saleDeal.findFirst({ where: { saleCarId: car.id, status: 'active' }, orderBy: { createdAt: 'desc' } });
    const op = str(fd, 'op');

    if (op === 'reserve' || op === 'sell') {
      const kind = op === 'reserve' ? 'reserved' : 'sold';
      if (active?.kind === 'sold') throw new Error('Машина уже продана');
      if (active && kind === 'reserved') throw new Error('Машина уже забронирована');
      const f = dealFields(fd);
      const customerId = await saleCustomer(f.clientName, f.clientPhone);
      await db.$transaction(async (tx) => {
        if (active) await tx.saleDeal.update({ where: { id: active.id }, data: { status: 'done', closedAt: new Date(), closedById: user.id } });
        await tx.saleDeal.create({ data: { ...f, kind, saleCarId: car.id, customerId, managerId: user.id, buyer: active?.buyer ?? null } });
        await tx.saleCar.update({ where: { id: car.id }, data: { status: kind, updatedAt: new Date() } });
        await audit(tx, user.id, `salecar.${kind}`, 'salecar', car.id, { client: f.clientName, price: f.price });
      });
      return kind === 'reserved' ? 'Забронировано' : 'Отмечено как продано';
    }

    if (op === 'release') {
      // Машины, забронированные до появления сделок, могут быть без записи — тогда просто меняем статус.
      await db.$transaction(async (tx) => {
        if (active) await tx.saleDeal.update({ where: { id: active.id }, data: { status: 'cancelled', closedAt: new Date(), closedById: user.id } });
        await tx.saleCar.update({ where: { id: car.id }, data: { status: 'published', updatedAt: new Date() } });
        await audit(tx, user.id, 'salecar.release', 'salecar', car.id, { was: active?.kind ?? car.status });
      });
      return 'Машина снова в продаже';
    }
    if (!active) throw new Error('Активной брони или продажи нет — обновите страницу');
    if (op === 'update') {
      const f = dealFields(fd);
      const customerId = await saleCustomer(f.clientName, f.clientPhone);
      await db.saleDeal.update({ where: { id: active.id }, data: { ...f, customerId } });
      await audit(db, user.id, 'salecar.deal.update', 'salecar', car.id, { client: f.clientName, price: f.price });
      return 'Сохранено';
    }
    if (op === 'buyer') {
      const buyer: Buyer = {};
      for (const [k] of BUYER_FIELDS) {
        const v = str(fd, k).slice(0, 300);
        if (v) buyer[k] = v;
      }
      await db.saleDeal.update({ where: { id: active.id }, data: { buyer: Object.keys(buyer).length ? JSON.stringify(buyer) : null } });
      await audit(db, user.id, 'salecar.deal.buyer', 'salecar', car.id);
      return 'Данные покупателя сохранены';
    }
    throw new Error('Неизвестное действие');
  });
}

export async function saleCarDeleteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await run(async () => {
    const user = await guard();
    const car = await db.saleCar.findUniqueOrThrow({ where: { id: str(fd, 'id') } });
    for (const p of json<string[]>(car.photos, [])) await dropPhotoIfUnused(p, car.id);
    await db.saleCar.delete({ where: { id: car.id } });
    await removePublicFolder(`sales/${car.id}`);
    await audit(db, user.id, 'salecar.delete', 'salecar', car.id, { title: car.title });
  });
  if (res?.error) return res;
  redirect('/crm/sales-cars');
}

export async function siteTextsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard();
    const changed: string[] = [];
    for (const f of AUTO_FIELDS) {
      if (!fd.has(f.key)) continue;
      const value = String(fd.get(f.key) ?? '').trim().slice(0, 2000);
      const current = await db.siteSetting.findUnique({ where: { key: f.key } });
      // Пустое поле или текст по умолчанию — храним как «по умолчанию».
      if (!value || value === f.default) {
        if (current) {
          await db.siteSetting.delete({ where: { key: f.key } });
          changed.push(f.key);
        }
        continue;
      }
      if (current?.value === value) continue;
      await db.siteSetting.upsert({ where: { key: f.key }, update: { value, updatedBy: user.id }, create: { key: f.key, value, updatedBy: user.id } });
      changed.push(f.key);
    }
    if (changed.length) await audit(db, user.id, 'site.texts', 'site', 'auto', { fields: changed });
    return changed.length ? 'Сохранено — изменения уже на сайте' : 'Изменений нет';
  });
}

/** Кнопка «Авито» в карточке машины: publish — в файл автозагрузки, unpublish — снять. Данные — из самой карточки. */
export async function saleCarAvitoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard();
    const { adFromCar, avitoProblems } = await import('@/lib/avito');
    const car = await db.saleCar.findUnique({ where: { id: str(fd, 'id') } });
    if (!car) throw new Error('Автомобиль не найден');
    if (str(fd, 'intent') === 'link') {
      const avitoId = str(fd, 'avitoId').replace(/\D/g, '');
      if (avitoId && avitoId.length < 6) throw new Error('Номер объявления — цифры из ссылки на Авито, например 8546030713');
      const cur = JSON.parse(car.avito || '{}');
      await db.saleCar.update({ where: { id: car.id }, data: { avito: JSON.stringify({ ...cur, avitoId: avitoId || undefined }) } });
      await audit(db, user.id, 'salecar.avito', 'salecar', car.id, { avitoId });
      return avitoId ? `Связано с объявлением №${avitoId}` : 'Связь с объявлением убрана';
    }
    if (str(fd, 'intent') === 'unpublish') {
      await db.saleCar.update({ where: { id: car.id }, data: { avitoStatus: 'draft', avitoSince: null } });
      await audit(db, user.id, 'salecar.avito', 'salecar', car.id, { status: 'draft' });
      return 'Убрано из файла для Авито — объявление снимется при следующей загрузке';
    }
    const problems = await avitoProblems(car, adFromCar(car));
    if (!['published', 'reserved'].includes(car.status)) problems.unshift('машина не опубликована на сайте');
    if (problems.length) throw new Error(`На Авито пока нельзя: ${problems.join('; ')}`);
    await db.saleCar.update({ where: { id: car.id }, data: { avitoStatus: 'live', avitoSince: new Date() } });
    await audit(db, user.id, 'salecar.avito', 'salecar', car.id, { status: 'live' });
    return 'Отправлено: объявление появится на Авито при ближайшей автозагрузке';
  });
}
