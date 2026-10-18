// Выборки для CRM с учётом прав.
import type { Prisma } from '@prisma/client';
import { db } from './db';
import { can, type SessionUser } from './permissions';
import { isActive } from './booking';

/** Фильтр заказов: все заказы проката или только назначенные сотруднику выдачи. */
export function orderScope(user: SessionUser): Prisma.RentalOrderWhereInput {
  if (can(user, 'rental.read')) return {};
  if (can(user, 'rental.read.assigned')) return { handoverId: user.id };
  return { id: '__none__' };
}

export async function usersById() {
  const users = await db.user.findMany({ select: { id: true, fullName: true, role: true, isActive: true } });
  return new Map(users.map((u) => [u.id, u]));
}

/** Активный резерв заказа и время его истечения. */
export async function holdInfo(orderIds: string[]) {
  const occ = await db.occupancy.findMany({ where: { orderId: { in: orderIds }, releasedAt: null } });
  const map = new Map<string, { kind: string; expiresAt: Date | null; active: boolean }>();
  for (const o of occ) {
    if (!o.orderId) continue;
    const active = isActive(o);
    const prev = map.get(o.orderId);
    if (!prev || active) map.set(o.orderId, { kind: o.kind, expiresAt: o.expiresAt, active });
  }
  return map;
}
