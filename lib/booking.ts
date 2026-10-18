// Доступность и занятость автомобилей.
// Все изменения занятости идут через withBookingLock: проверка и запись выполняются
// атомарно (одна очередь + транзакция), поэтому два одновременных запроса
// не создадут пересекающиеся брони. При переходе на PostgreSQL дополнительно
// добавляется ограничение EXCLUDE (см. docs/02-architecture.md).

import type { Occupancy, Prisma } from '@prisma/client';
import { db } from './db';
import { addMinutes } from './dates';

type Tx = Prisma.TransactionClient;

let queue: Promise<unknown> = Promise.resolve();

/** Последовательное выполнение операций бронирования внутри транзакции. */
export function withBookingLock<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const run = queue.then(() => db.$transaction((tx) => fn(tx), { timeout: 20000 }));
  queue = run.catch(() => undefined);
  return run;
}

export class BookingConflict extends Error {
  constructor(public conflict: ConflictInfo) {
    super(conflictMessage(conflict));
  }
}

export type ConflictInfo = { kind: string; startsAt: Date; endsAt: Date; orderNumber: string | null; orderId: string | null };

export const KIND_LABEL: Record<string, string> = {
  hold: 'временный резерв',
  booking: 'подтверждённая бронь',
  rental: 'аренда',
  maintenance: 'обслуживание',
  block: 'блокировка',
};

function conflictMessage(c: ConflictInfo) {
  return `Автомобиль занят: ${KIND_LABEL[c.kind] ?? c.kind}${c.orderNumber ? ` ${c.orderNumber}` : ''} (с учётом времени подготовки)`;
}

/** Активна ли занятость сейчас (истёкший резерв уже не блокирует). */
export function isActive(o: Pick<Occupancy, 'releasedAt' | 'kind' | 'expiresAt'>, now = new Date()) {
  if (o.releasedAt) return false;
  if (o.kind === 'hold' && o.expiresAt && o.expiresAt <= now) return false;
  return true;
}

/**
 * Фактическая граница занятости. Просроченная аренда продолжает занимать машину
 * до текущего момента плюс подготовка.
 */
export function effectiveBlockedUntil(o: Pick<Occupancy, 'kind' | 'blockedUntil' | 'endsAt'>, bufferMin: number, now = new Date()) {
  if (o.kind === 'rental' && o.endsAt < now) return addMinutes(now, bufferMin);
  return o.blockedUntil;
}

export async function findConflict(
  tx: Tx | typeof db,
  vehicleId: string,
  startsAt: Date,
  blockedUntil: Date,
  bufferMin: number,
  excludeIds: string[] = [],
): Promise<ConflictInfo | null> {
  const now = new Date();
  const rows = await tx.occupancy.findMany({
    where: { vehicleId, releasedAt: null, id: { notIn: excludeIds }, startsAt: { lt: blockedUntil } },
    include: { order: { select: { number: true, id: true } } },
    orderBy: { startsAt: 'asc' },
  });
  for (const o of rows) {
    if (!isActive(o, now)) continue;
    if (startsAt < effectiveBlockedUntil(o, bufferMin, now)) {
      return { kind: o.kind, startsAt: o.startsAt, endsAt: o.endsAt, orderNumber: o.order?.number ?? null, orderId: o.order?.id ?? null };
    }
  }
  return null;
}

export async function occupy(
  tx: Tx,
  data: { vehicleId: string; kind: string; startsAt: Date; endsAt: Date; bufferMin: number; orderId?: string | null; expiresAt?: Date | null; note?: string | null; createdById?: string | null },
  excludeIds: string[] = [],
) {
  if (!(data.endsAt > data.startsAt)) throw new Error('Конец интервала должен быть позже начала');
  const blockedUntil = addMinutes(data.endsAt, data.bufferMin);
  const c = await findConflict(tx, data.vehicleId, data.startsAt, blockedUntil, data.bufferMin, excludeIds);
  if (c) throw new BookingConflict(c);
  return tx.occupancy.create({
    data: {
      vehicleId: data.vehicleId,
      kind: data.kind,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      blockedUntil,
      orderId: data.orderId ?? null,
      expiresAt: data.expiresAt ?? null,
      note: data.note ?? null,
      createdById: data.createdById ?? null,
    },
  });
}

/** Текущая активная занятость заказа (резерв, бронь или аренда). */
export async function orderOccupancy(tx: Tx | typeof db, orderId: string) {
  const rows = await tx.occupancy.findMany({ where: { orderId, releasedAt: null }, orderBy: { createdAt: 'desc' } });
  return rows.find((o) => isActive(o)) ?? null;
}

export async function releaseOrder(tx: Tx, orderId: string) {
  await tx.occupancy.updateMany({ where: { orderId, releasedAt: null }, data: { releasedAt: new Date() } });
}

/** Свободные машины на интервал. */
export async function availableVehicleIds(startsAt: Date, endsAt: Date, bufferMin: number): Promise<Set<string>> {
  const vehicles = await db.vehicle.findMany({ where: { condition: { not: 'unavailable' } }, select: { id: true } });
  const free = new Set<string>();
  const blockedUntil = addMinutes(endsAt, bufferMin);
  for (const v of vehicles) {
    if (!(await findConflict(db, v.id, startsAt, blockedUntil, bufferMin))) free.add(v.id);
  }
  return free;
}
