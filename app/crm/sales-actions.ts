'use server';

// Автосалон в CRM: автомобили в продаже и тексты сайта автосалона.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { db, json } from '@/lib/db';
import { parseRub } from '@/lib/money';
import { parseLocal } from '@/lib/dates';
import { can, Forbidden } from '@/lib/permissions';
import { audit } from '@/lib/orders';
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
    const status = str(fd, 'status') || 'draft';
    if (!SALE_STATUSES.includes(status)) throw new Error('Неизвестный статус');
    const powerRaw = str(fd, 'powerHp') || (src ? String(src.powerHp) : '');
    const eqText = str(fd, 'equipment');
    const equipment = eqText ? eqText.split('\n').map((l) => l.trim()).filter(Boolean) : src ? json<string[]>(src.equipment, []) : [];

    const data = {
      make,
      model,
      title: `${make} ${model}`,
      year,
      mileageKm,
      price,
      status,
      bodyType: str(fd, 'bodyType') || src?.bodyType || 'sedan',
      powerHp: powerRaw ? Number(powerRaw) || null : null,
      engine: str(fd, 'engine') || src?.fuel || null,
      transmission: str(fd, 'transmission') || (src ? 'автомат' : null),
      drive: str(fd, 'drive') || src?.drive || null,
      color: str(fd, 'color') || src?.colorExterior || null,
      description: str(fd, 'description') || src?.description || null,
      equipment: equipment.length ? JSON.stringify(equipment) : null,
      vin: str(fd, 'vin') || null,
      note: str(fd, 'note') || null,
      sortOrder: Number(str(fd, 'sortOrder') || 0) || 0,
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
    const car = await db.saleCar.create({ data: { ...data, slug, createdById: user.id, photos: src?.photos ?? null } });
    const uploaded = await savePublicPhotos(fd.getAll('photos') as File[], `sales/${car.id}`);
    if (uploaded.length) await db.saleCar.update({ where: { id: car.id }, data: { photos: JSON.stringify([...json<string[]>(car.photos, []), ...uploaded]) } });
    await audit(db, user.id, 'salecar.create', 'salecar', car.id, { title: car.title, copyFrom: src?.slug });
    newId = car.id;
  });
  if (res?.error || !newId) return res;
  redirect(`/crm/sales-cars/${newId}`);
}

export async function saleCarPhotoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await guard();
    const car = await db.saleCar.findUniqueOrThrow({ where: { id: str(fd, 'id') } });
    const photos = json<string[]>(car.photos, []);
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
