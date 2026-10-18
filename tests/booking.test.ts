import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { addMinutes } from '@/lib/dates';
import { BookingConflict, occupy, withBookingLock } from '@/lib/booking';
import { cancelOrder, completeOrder, confirmOrder, createCrmOrder, extendOrder, issueOrder, returnOrder } from '@/lib/orders';
import { orderMoney, post, reverse } from '@/lib/ledger';
import type { SessionUser } from '@/lib/permissions';

let manager: SessionUser;
let vehicles: { id: string; slug: string }[];
const day = (n: number, h = 10) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(h - 3, 0, 0, 0);
  return d;
};
const client = (i: number) => ({ name: `Тест ${i}`, phone: `7999100${String(i).padStart(4, '0')}`, services: [] });

beforeAll(async () => {
  const u = await db.user.findUniqueOrThrow({ where: { email: 'manager@crave.test' } });
  manager = { id: u.id, email: u.email, fullName: u.fullName, role: u.role };
  vehicles = await db.vehicle.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, slug: true } });
});

describe('защита от двойного бронирования', () => {
  it('из 10 одновременных запросов на одну машину успешен ровно один', async () => {
    const v = vehicles[0].id;
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => createCrmOrder(manager, { vehicleId: v, pickupAt: day(20), returnAt: day(23), ...client(i) })));
    const ok = results.filter((r) => r.status === 'fulfilled');
    const conflicts = results.filter((r) => r.status === 'rejected' && r.reason instanceof BookingConflict);
    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(9);
    const active = await db.occupancy.count({ where: { vehicleId: v, releasedAt: null } });
    expect(active).toBe(1);
  });

  it('соседняя бронь допускается только после буфера подготовки (3 ч)', async () => {
    const v = vehicles[1].id;
    const a = await createCrmOrder(manager, { vehicleId: v, pickupAt: day(30), returnAt: day(32), ...client(20) });
    await confirmOrder(manager, a.id);
    await expect(createCrmOrder(manager, { vehicleId: v, pickupAt: addMinutes(day(32), 120), returnAt: day(34), ...client(21) })).rejects.toBeInstanceOf(BookingConflict);
    await expect(createCrmOrder(manager, { vehicleId: v, pickupAt: addMinutes(day(32), 180), returnAt: day(34), ...client(22) })).resolves.toBeTruthy();
  });

  it('истёкший временный резерв не блокирует машину', async () => {
    const v = vehicles[2].id;
    const a = await createCrmOrder(manager, { vehicleId: v, pickupAt: day(40), returnAt: day(42), ...client(30) });
    await db.occupancy.updateMany({ where: { orderId: a.id }, data: { expiresAt: addMinutes(new Date(), -1) } });
    await expect(createCrmOrder(manager, { vehicleId: v, pickupAt: day(40), returnAt: day(42), ...client(31) })).resolves.toBeTruthy();
    // Подтвердить заказ с истёкшим резервом нельзя — машину уже заняли.
    await expect(confirmOrder(manager, a.id)).rejects.toBeInstanceOf(BookingConflict);
  });

  it('продление упирается в следующую бронь', async () => {
    const v = vehicles[3].id;
    const a = await createCrmOrder(manager, { vehicleId: v, pickupAt: day(50), returnAt: day(52), ...client(40) });
    await confirmOrder(manager, a.id);
    const b = await createCrmOrder(manager, { vehicleId: v, pickupAt: day(53), returnAt: day(55), ...client(41) });
    await confirmOrder(manager, b.id);
    await expect(extendOrder(manager, a.id, day(53))).rejects.toBeInstanceOf(BookingConflict);
    await expect(extendOrder(manager, a.id, addMinutes(day(53), -180))).resolves.toBeUndefined();
    const m = await orderMoney(db, a.id);
    expect(m.charges).toBeGreaterThan(0);
  });

  it('обслуживание делает машину недоступной', async () => {
    const v = vehicles[4].id;
    await withBookingLock((tx) => occupy(tx, { vehicleId: v, kind: 'maintenance', startsAt: day(60, 9), endsAt: day(60, 18), bufferMin: 0, note: 'ТО' }));
    await expect(createCrmOrder(manager, { vehicleId: v, pickupAt: day(59), returnAt: day(61), ...client(50) })).rejects.toBeInstanceOf(BookingConflict);
  });

  it('отмена освобождает машину и сторнирует начисления', async () => {
    const v = vehicles[5].id;
    const a = await createCrmOrder(manager, { vehicleId: v, pickupAt: day(70), returnAt: day(72), ...client(60) });
    await confirmOrder(manager, a.id);
    await cancelOrder(manager, a.id, 'тест');
    expect((await orderMoney(db, a.id)).charges).toBe(0);
    await expect(createCrmOrder(manager, { vehicleId: v, pickupAt: day(70), returnAt: day(72), ...client(61) })).resolves.toBeTruthy();
  });
});

describe('тарифы, статусы и финансы', () => {
  it('изменение тарифа не меняет согласованный заказ', async () => {
    const v = vehicles[6].id;
    const a = await createCrmOrder(manager, { vehicleId: v, pickupAt: day(80), returnAt: day(83), ...client(70) });
    const before = JSON.parse(a.quoteSnapshot).total;
    await db.tariffPlan.updateMany({ where: { vehicleId: v, status: 'active' }, data: { status: 'archived' } });
    await db.tariffPlan.create({ data: { vehicleId: v, tiers: JSON.stringify([{ minDays: 1, dailyRate: 1 }]), deposit: 1, includedKmPerDay: 1, overmileagePerKm: 1 } });
    await confirmOrder(manager, a.id);
    expect((await orderMoney(db, a.id)).charges).toBe(before);
  });

  it('полный цикл: выдача, возврат, оплата, залог, закрытие', async () => {
    const v = vehicles[7].id;
    const a = await createCrmOrder(manager, { vehicleId: v, pickupAt: day(-1), returnAt: day(1), ...client(80) });
    await confirmOrder(manager, a.id);
    await expect(returnOrder(manager, a.id, { mileageKm: 100, fuelPercent: 100, checklist: {}, damages: [], photos: [], chargeOvermileage: false, chargeLate: false })).rejects.toThrow(/Нельзя перевести/);
    await issueOrder(manager, a.id, { mileageKm: 1000, fuelPercent: 100, checklist: {}, damages: [], photos: [] });
    await returnOrder(manager, a.id, { mileageKm: 1700, fuelPercent: 90, checklist: {}, damages: [{ location: 'Бампер', description: 'скол' }], photos: [], chargeOvermileage: true, chargeLate: false });
    const m1 = await orderMoney(db, a.id);
    expect(m1.charges).toBeGreaterThan(0);
    await post(db, { kind: 'deposit.in', amount: 5000000, basis: 'залог', createdById: manager.id, orderId: a.id });
    const opts = { holdDays: 21, allowDebt: false, canRefund: true };
    await expect(completeOrder(manager, a.id, opts)).rejects.toThrow(/Остался долг/);
    await expect(completeOrder(manager, a.id, { ...opts, canRefund: false, payment: { amount: m1.debt, method: 'card' }, depositRefund: { amount: 3000000, method: 'card' } })).rejects.toThrow(/руководитель или финансист/);
    // Доплата, возврат 30 000 залога сразу, 20 000 — на проверку штрафов.
    const m2 = await completeOrder(manager, a.id, { ...opts, payment: { amount: m1.debt, method: 'card' }, depositRefund: { amount: 3000000, method: 'card' } });
    expect(m2.debt).toBe(0);
    expect(m2.depositBalance).toBe(2000000);
    const o = await db.rentalOrder.findUniqueOrThrow({ where: { id: a.id } });
    expect(o.status).toBe('closed');
    expect(o.depositReleaseAt!.getTime()).toBeGreaterThan(Date.now() + 20 * 86400000);
    const veh = await db.vehicle.findUniqueOrThrow({ where: { id: v } });
    expect(veh.condition).toBe('preparing');
    expect(await db.damage.count({ where: { vehicleId: v, status: 'open' } })).toBe(1);
  });

  it('журнал нельзя изменить или удалить, сторно — один раз', async () => {
    const e = await post(db, { kind: 'expense.general', amount: 100, basis: 'тест', createdById: manager.id });
    await expect(db.ledgerEntry.update({ where: { id: e.id }, data: { amount: 5 } })).rejects.toThrow();
    await expect(db.ledgerEntry.delete({ where: { id: e.id } })).rejects.toThrow();
    const r = await reverse(db, e.id, 'ошибка', manager.id);
    expect(r.amount).toBe(-100);
    await expect(reverse(db, e.id, 'ещё раз', manager.id)).rejects.toThrow(/уже сделан возврат/);
  });

  it('повторное платёжное событие с тем же ключом не дублируется', async () => {
    const a = await post(db, { kind: 'expense.general', amount: 200, basis: 'тест', createdById: manager.id, idempotencyKey: 'pay-1' });
    const b = await post(db, { kind: 'expense.general', amount: 200, basis: 'тест', createdById: manager.id, idempotencyKey: 'pay-1' });
    expect(a.id).toBe(b.id);
  });
});
