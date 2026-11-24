// Удаление заявок, заказов и клиентов руководителем (право records.delete).
// Запись исчезает из рабочих списков, а полная копия (со всеми комментариями и историей)
// остаётся в журнале изменений — раздел «Журнал» в CRM.
import { db } from './db';
import { can, directionsOf, Forbidden, type Perm, type SessionUser } from './permissions';
import { audit } from './orders';

export const DELETED_ENTITY: Record<string, string> = { lead: 'Заявка удалена', order: 'Заказ удалён', customer: 'Клиент удалён' };

function need(user: SessionUser, ...perms: Perm[]) {
  if (!can(user, 'records.delete')) throw new Forbidden('Удалять записи может только руководитель');
  for (const p of perms) if (!can(user, p)) throw new Forbidden();
}

export async function deleteLead(user: SessionUser, id: string) {
  const lead = await db.lead.findUniqueOrThrow({ where: { id }, include: { notes: { orderBy: { createdAt: 'asc' } }, customer: { select: { fullName: true } } } });
  need(user, `leads.${lead.direction}` as Perm);
  await db.$transaction(async (tx) => {
    await tx.lead.delete({ where: { id } });
    await audit(tx, user.id, 'lead.delete', 'lead', id, { title: `${lead.name}${lead.carInfo ? ` · ${lead.carInfo}` : ''}`, record: lead });
  });
  return lead;
}

export async function deleteOrder(user: SessionUser, id: string) {
  const o = await db.rentalOrder.findUniqueOrThrow({
    where: { id },
    include: { customer: { select: { fullName: true, phone: true } }, vehicle: { select: { title: true } }, events: { orderBy: { createdAt: 'asc' } }, comments: { orderBy: { createdAt: 'asc' } }, occupancies: true, _count: { select: { ledger: true, inspections: true } } },
  });
  need(user, 'rental.write');
  // Деньги и осмотры — учётные данные: такой заказ не удаляется, а отменяется.
  if (o._count.ledger) throw new Error('По заказу есть оплаты или начисления — удалить нельзя, его можно только отменить');
  if (o._count.inspections) throw new Error('По заказу проводились осмотры (машина выдавалась) — удалить нельзя, его можно только отменить');
  await db.$transaction(async (tx) => {
    await tx.occupancy.deleteMany({ where: { orderId: id } });
    await tx.withholdRequest.deleteMany({ where: { orderId: id } });
    await tx.lead.updateMany({ where: { orderId: id }, data: { orderId: null } });
    await tx.rentalOrder.delete({ where: { id } });
    await audit(tx, user.id, 'order.delete', 'order', id, { title: `${o.number} · ${o.vehicle.title} · ${o.customer.fullName}`, record: o });
  });
  return o;
}

export async function deleteCustomer(user: SessionUser, id: string) {
  const c = await db.customer.findUniqueOrThrow({ where: { id }, include: { directions: true, leads: { select: { id: true, direction: true, kind: true, createdAt: true } }, documents: true, _count: { select: { orders: true } } } });
  need(user, 'customers.write');
  const mine = directionsOf(user);
  if (user.role !== 'owner' && c.directions.some((d) => !mine.includes(d.direction as never))) throw new Error('Клиент работает и с другим направлением — удалить его может владелец');
  if (c._count.orders) throw new Error('У клиента есть заказы проката — сначала удалите или оставьте их');
  await db.$transaction(async (tx) => {
    // Заявки клиента остаются, просто без карточки.
    await tx.lead.updateMany({ where: { customerId: id }, data: { customerId: null } });
    await tx.customer.delete({ where: { id } });
    await audit(tx, user.id, 'customer.delete', 'customer', id, { title: c.fullName, record: c });
  });
  return c;
}
