'use server';

// Сайт сервиса в CRM: тексты страницы и перечень услуг.
import { revalidatePath } from 'next/cache';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseRub } from '@/lib/money';
import { can, Forbidden } from '@/lib/permissions';
import { audit } from '@/lib/orders';
import { SERVICE_FIELDS } from '@/lib/site-settings';

export type ActionState = { error?: string; ok?: string } | undefined;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

async function guard() {
  const u = await currentUser();
  if (!u) throw new Forbidden('Сессия истекла — войдите снова');
  if (!can(u, 'service.site')) throw new Forbidden();
  return u;
}

async function run(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const ok = await fn();
    revalidatePath('/crm', 'layout');
    revalidatePath('/service', 'layout');
    return { ok: ok || 'Сохранено' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось выполнить действие' };
  }
}

export async function serviceTextsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard();
    const changed: string[] = [];
    for (const f of SERVICE_FIELDS) {
      if (!fd.has(f.key)) continue;
      const value = String(fd.get(f.key) ?? '').trim().slice(0, 2000);
      const current = await db.siteSetting.findUnique({ where: { key: f.key } });
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
    if (changed.length) await audit(db, user.id, 'site.texts', 'site', 'service', { fields: changed });
    return changed.length ? 'Сохранено — изменения уже на сайте' : 'Изменений нет';
  });
}

export async function serviceItemSaveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard();
    const id = str(fd, 'id');
    const name = str(fd, 'name');
    if (name.length < 2) throw new Error('Укажите название услуги');
    const priceRaw = str(fd, 'priceFrom');
    const priceFrom = priceRaw ? parseRub(priceRaw) : null;
    if (priceRaw && !priceFrom) throw new Error('Цена — только цифры, в рублях');
    const data = { name: name.slice(0, 120), description: str(fd, 'description').slice(0, 1000) || null, priceFrom, isPublished: fd.get('isPublished') === 'on' };
    if (id) {
      await db.serviceItem.update({ where: { id }, data });
      await audit(db, user.id, 'service.item.update', 'service', id);
      return 'Услуга сохранена';
    }
    const last = await db.serviceItem.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const item = await db.serviceItem.create({ data: { ...data, sortOrder: (last?.sortOrder ?? 0) + 1 } });
    await audit(db, user.id, 'service.item.create', 'service', item.id, { name });
    return 'Услуга добавлена';
  });
}

export async function serviceItemMoveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await guard();
    const items = await db.serviceItem.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    const i = items.findIndex((x) => x.id === str(fd, 'id'));
    const j = str(fd, 'dir') === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= items.length) return 'Без изменений';
    [items[i], items[j]] = [items[j], items[i]];
    await db.$transaction(items.map((x, k) => db.serviceItem.update({ where: { id: x.id }, data: { sortOrder: k } })));
    return 'Порядок обновлён';
  });
}

export async function serviceItemDeleteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard();
    const item = await db.serviceItem.delete({ where: { id: str(fd, 'id') } });
    await audit(db, user.id, 'service.item.delete', 'service', item.id, { name: item.name });
    return 'Услуга удалена';
  });
}
