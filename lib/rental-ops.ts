// Операции проката, которые вызываются и из CRM, и кнопками в Telegram.
import { withBookingLock } from './booking';
import { db } from './db';
import { orderMoney, post } from './ledger';
import { audit, event } from './orders';
import type { SessionUser } from './permissions';

/** Решение по запросу на удержание из залога. Возвращает запрос с суммой и заказом. */
export async function decideWithhold(user: SessionUser, requestId: string, approve: boolean) {
  const r = await db.withholdRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (r.status !== 'pending') throw new Error(`Запрос уже рассмотрен: ${r.status === 'approved' ? 'подтверждён' : 'отклонён'}`);
  await withBookingLock(async (tx) => {
    if (approve) {
      const m = await orderMoney(tx, r.orderId);
      if (r.amount > m.depositBalance) throw new Error('Остаток залога меньше суммы удержания');
      const o = await tx.rentalOrder.findUniqueOrThrow({ where: { id: r.orderId } });
      await post(tx, { kind: 'charge.extra', amount: r.amount, basis: `Удержание: ${r.basis}`, createdById: r.requestedBy, approvedById: user.id, orderId: r.orderId, vehicleId: o.vehicleId, customerId: o.customerId });
      await post(tx, { kind: 'deposit.withhold', amount: r.amount, basis: r.basis, createdById: r.requestedBy, approvedById: user.id, orderId: r.orderId, vehicleId: o.vehicleId, customerId: o.customerId });
    }
    await tx.withholdRequest.update({ where: { id: r.id }, data: { status: approve ? 'approved' : 'rejected', decidedBy: user.id, decidedAt: new Date() } });
    await event(tx, r.orderId, 'withhold', `Удержание ${r.amount / 100} ₽ ${approve ? 'подтверждено' : 'отклонено'}.`, user.id);
    await audit(tx, user.id, approve ? 'deposit.withhold.approve' : 'deposit.withhold.reject', 'order', r.orderId, { amount: r.amount });
  });
  return r;
}
