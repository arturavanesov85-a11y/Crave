// Заказ аренды: статусы, переходы, бронь, продление, замена машины, отмена.

import type { Prisma } from '@prisma/client';
import { db, json } from './db';
import { addMinutes, daysWord, fmtDateTime } from './dates';
import { BookingConflict, findConflict, occupy, orderOccupancy, releaseOrder, withBookingLock, availableVehicleIds } from './booking';
import { orderMoney, post } from './ledger';
import { quote, type Discount, type Quote, type ServiceSelection, type Tariff } from './pricing';
import { activeTariff, loadExtras, loadSettings } from './rules';
import type { SessionUser } from './permissions';

type Tx = Prisma.TransactionClient;

export const STATUS_LABEL: Record<string, string> = {
  new: 'Новая заявка',
  negotiation: 'Согласование',
  confirmed: 'Подтверждённая бронь',
  issued: 'Автомобиль выдан',
  returned: 'Автомобиль возвращён',
  closed: 'Заказ закрыт',
  cancelled: 'Отменён',
  no_show: 'Неявка',
};

const TRANSITIONS: Record<string, string[]> = {
  new: ['negotiation', 'confirmed', 'cancelled'],
  negotiation: ['confirmed', 'cancelled'],
  confirmed: ['issued', 'cancelled', 'no_show'],
  issued: ['returned'],
  returned: ['closed'],
  closed: [],
  cancelled: [],
  no_show: [],
};

export function canTransition(from: string, to: string) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

function assertTransition(from: string, to: string) {
  if (!canTransition(from, to)) throw new Error(`Нельзя перевести заказ из «${STATUS_LABEL[from]}» в «${STATUS_LABEL[to]}»`);
}

export type Terms = { tariffId: string; tariff: Tariff; graceMinutes: number; prepBufferMinutes: number; assumptions: string[]; capturedAt: string };
export type QuoteOk = Extract<Quote, { ok: true }>;

export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;
  return /^7\d{10}$/.test(d) ? d : null;
}

export function formatPhone(d: string) {
  return d.length === 11 ? `+${d[0]} (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}` : d;
}

export async function event(tx: Tx | typeof db, orderId: string, type: string, text: string, actorId?: string | null) {
  await tx.orderEvent.create({ data: { orderId, type, text, actorId: actorId ?? null } });
}

export async function audit(tx: Tx | typeof db, actorId: string | null, action: string, entity: string, entityId: string, details?: unknown) {
  await tx.auditLog.create({ data: { actorId, action, entity, entityId, details: details == null ? null : JSON.stringify(details) } });
}

async function nextNumber(tx: Tx) {
  const year = new Date().getFullYear();
  const prefix = `R-${year}-`;
  const last = await tx.rentalOrder.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, select: { number: true } });
  const n = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
  return prefix + String(n).padStart(6, '0');
}

export async function upsertCustomer(tx: Tx, c: { name: string; phone: string; email?: string | null }, direction: string) {
  const customer = await tx.customer.upsert({
    where: { phone: c.phone },
    update: c.email ? { email: c.email } : {},
    create: { fullName: c.name, phone: c.phone, email: c.email ?? null },
  });
  await tx.customerDirection.upsert({ where: { customerId_direction: { customerId: customer.id, direction } }, update: {}, create: { customerId: customer.id, direction } });
  return customer;
}

/** Расчёт по текущему тарифу машины. */
export async function quoteFor(vehicleId: string, pickupAt: Date, returnAt: Date, services: ServiceSelection[] = [], discount: Discount = null) {
  const [tariff, settings, extras] = await Promise.all([activeTariff(vehicleId), loadSettings(), loadExtras()]);
  if (!tariff) return { quote: { ok: false, error: 'Для автомобиля не задан тариф' } as Quote, tariff: null, settings, extras };
  const q = quote({ pickupAt, returnAt, tariff, rules: settings.rules, services, extras, discount });
  return { quote: q, tariff, settings, extras };
}

function termsOf(tariff: Tariff & { id: string }, settings: Awaited<ReturnType<typeof loadSettings>>): Terms {
  const { id, ...t } = tariff;
  return { tariffId: id, tariff: t, graceMinutes: settings.rules.graceMinutes, prepBufferMinutes: settings.prepBufferMinutes, assumptions: settings.rules.assumptions, capturedAt: new Date().toISOString() };
}

// ---------- Создание ----------

export async function createSiteRequest(input: {
  vehicleSlug: string;
  pickupAt: Date;
  returnAt: Date;
  name: string;
  phone: string;
  comment?: string;
  services: ServiceSelection[];
  idempotencyKey: string;
  utm?: Record<string, string>;
}) {
  const vehicle = await db.vehicle.findUnique({ where: { slug: input.vehicleSlug } });
  if (!vehicle || !vehicle.isPublished) throw new Error('Автомобиль не найден');
  const { quote: q, tariff, settings } = await quoteFor(vehicle.id, input.pickupAt, input.returnAt, input.services);
  if (!q.ok || !tariff) throw new Error(q.ok ? 'Нет тарифа' : q.error);
  if (input.pickupAt < new Date()) throw new Error('Время получения уже прошло');

  return withBookingLock(async (tx) => {
    const dup = await tx.lead.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (dup) return { leadId: dup.id, orderId: dup.orderId, duplicate: true };

    const customer = await upsertCustomer(tx, { name: input.name, phone: input.phone }, 'rental');
    const order = await tx.rentalOrder.create({
      data: {
        number: await nextNumber(tx),
        status: 'new',
        customerId: customer.id,
        vehicleId: vehicle.id,
        pickupAt: input.pickupAt,
        returnAt: input.returnAt,
        termsSnapshot: JSON.stringify(termsOf(tariff, settings)),
        quoteSnapshot: JSON.stringify(q),
        services: JSON.stringify(input.services),
        source: 'site',
      },
    });
    // Временный резерв: простая заявка не занимает машину надолго.
    await occupy(tx, { vehicleId: vehicle.id, kind: 'hold', startsAt: input.pickupAt, endsAt: input.returnAt, bufferMin: settings.prepBufferMinutes, orderId: order.id, expiresAt: addMinutes(new Date(), settings.holdTtlMinutes) });
    const lead = await tx.lead.create({
      data: {
        direction: 'rental',
        site: 'rental',
        kind: 'booking_request',
        name: input.name,
        phone: input.phone,
        message: input.comment || null,
        payload: JSON.stringify({ vehicle: vehicle.title, pickupAt: input.pickupAt, returnAt: input.returnAt, total: q.total }),
        utm: input.utm ? JSON.stringify(input.utm) : null,
        idempotencyKey: input.idempotencyKey,
        customerId: customer.id,
        orderId: order.id,
      },
    });
    await tx.rentalOrder.update({ where: { id: order.id }, data: { leadId: lead.id } });
    await event(tx, order.id, 'created', `Заявка с сайта: ${vehicle.title}, ${fmtDateTime(input.pickupAt)} — ${fmtDateTime(input.returnAt)}. Резерв на ${settings.holdTtlMinutes} мин.`);
    return { leadId: lead.id, orderId: order.id, duplicate: false };
  });
}

export async function createCrmOrder(user: SessionUser, input: { vehicleId: string; pickupAt: Date; returnAt: Date; name: string; phone: string; email?: string | null; services: ServiceSelection[]; leadId?: string | null }) {
  const { quote: q, tariff, settings } = await quoteFor(input.vehicleId, input.pickupAt, input.returnAt, input.services);
  if (!q.ok || !tariff) throw new Error(q.ok ? 'Нет тарифа' : q.error);
  return withBookingLock(async (tx) => {
    const customer = await upsertCustomer(tx, { name: input.name, phone: input.phone, email: input.email }, 'rental');
    const order = await tx.rentalOrder.create({
      data: {
        number: await nextNumber(tx),
        status: 'negotiation',
        customerId: customer.id,
        vehicleId: input.vehicleId,
        pickupAt: input.pickupAt,
        returnAt: input.returnAt,
        assigneeId: user.id,
        leadId: input.leadId ?? null,
        termsSnapshot: JSON.stringify(termsOf(tariff, settings)),
        quoteSnapshot: JSON.stringify(q),
        services: JSON.stringify(input.services),
      },
    });
    await occupy(tx, { vehicleId: input.vehicleId, kind: 'hold', startsAt: input.pickupAt, endsAt: input.returnAt, bufferMin: settings.prepBufferMinutes, orderId: order.id, expiresAt: addMinutes(new Date(), settings.holdTtlMinutes), createdById: user.id });
    if (input.leadId) await tx.lead.update({ where: { id: input.leadId }, data: { status: 'converted', orderId: order.id, customerId: customer.id } });
    await event(tx, order.id, 'created', `Заказ создан в CRM. Резерв на ${settings.holdTtlMinutes} мин.`, user.id);
    return order;
  });
}

// ---------- Переходы ----------

async function loadOrder(tx: Tx, id: string) {
  const o = await tx.rentalOrder.findUnique({ where: { id }, include: { vehicle: true } });
  if (!o) throw new Error('Заказ не найден');
  return o;
}

export async function takeOrder(user: SessionUser, id: string) {
  return withBookingLock(async (tx) => {
    const o = await loadOrder(tx, id);
    assertTransition(o.status, 'negotiation');
    const settings = await loadSettings();
    const occ = await orderOccupancy(tx, id);
    if (occ?.kind === 'hold') {
      await tx.occupancy.update({ where: { id: occ.id }, data: { expiresAt: addMinutes(new Date(), settings.holdTtlMinutes) } });
    } else if (!occ) {
      const terms = json<Terms>(o.termsSnapshot, null as never);
      await occupy(tx, { vehicleId: o.vehicleId, kind: 'hold', startsAt: o.pickupAt, endsAt: o.returnAt, bufferMin: terms.prepBufferMinutes, orderId: id, expiresAt: addMinutes(new Date(), settings.holdTtlMinutes), createdById: user.id });
    }
    await tx.rentalOrder.update({ where: { id }, data: { status: 'negotiation', assigneeId: o.assigneeId ?? user.id } });
    if (o.leadId) await tx.lead.update({ where: { id: o.leadId }, data: { status: 'in_progress', assigneeId: user.id } });
    await event(tx, id, 'status', `Взято в работу. Резерв продлён на ${settings.holdTtlMinutes} мин.`, user.id);
  });
}

export async function extendHold(user: SessionUser, id: string) {
  return withBookingLock(async (tx) => {
    const o = await loadOrder(tx, id);
    if (!['new', 'negotiation'].includes(o.status)) throw new Error('Резерв продлевается только до подтверждения брони');
    const settings = await loadSettings();
    const terms = json<Terms>(o.termsSnapshot, null as never);
    const occ = await orderOccupancy(tx, id);
    if (occ) await tx.occupancy.update({ where: { id: occ.id }, data: { expiresAt: addMinutes(new Date(), settings.holdTtlMinutes) } });
    else await occupy(tx, { vehicleId: o.vehicleId, kind: 'hold', startsAt: o.pickupAt, endsAt: o.returnAt, bufferMin: terms.prepBufferMinutes, orderId: id, expiresAt: addMinutes(new Date(), settings.holdTtlMinutes), createdById: user.id });
    await event(tx, id, 'hold', `Резерв продлён на ${settings.holdTtlMinutes} мин.`, user.id);
  });
}

export async function confirmOrder(user: SessionUser, id: string) {
  return withBookingLock(async (tx) => {
    const o = await loadOrder(tx, id);
    assertTransition(o.status, 'confirmed');
    const terms = json<Terms>(o.termsSnapshot, null as never);
    const q = json<QuoteOk>(o.quoteSnapshot, null as never);
    const occ = await orderOccupancy(tx, id);
    if (occ?.kind === 'hold') {
      await tx.occupancy.update({ where: { id: occ.id }, data: { kind: 'booking', expiresAt: null } });
    } else {
      // Резерв истёк — машину нужно занять заново, если она свободна.
      await occupy(tx, { vehicleId: o.vehicleId, kind: 'booking', startsAt: o.pickupAt, endsAt: o.returnAt, bufferMin: terms.prepBufferMinutes, orderId: id, createdById: user.id });
    }
    await post(tx, { kind: 'charge.rental', amount: q.rent, basis: `Аренда: ${daysWord(q.days)} × ${q.dailyRate / 100} ₽ (${q.tier.label})`, createdById: user.id, orderId: id, vehicleId: o.vehicleId, customerId: o.customerId, idempotencyKey: `confirm:${id}:rent` });
    for (const s of q.services) {
      await post(tx, { kind: 'charge.service', amount: s.amount, basis: `${s.name}: ${s.qty} ${s.unit}`, createdById: user.id, orderId: id, vehicleId: o.vehicleId, customerId: o.customerId, idempotencyKey: `confirm:${id}:svc:${s.code}` });
    }
    if (q.discount) {
      await post(tx, { kind: 'charge.discount', amount: -q.discount, basis: `Скидка: ${q.discountReason ?? ''}`, createdById: user.id, orderId: id, customerId: o.customerId, idempotencyKey: `confirm:${id}:discount` });
    }
    await tx.rentalOrder.update({ where: { id }, data: { status: 'confirmed', assigneeId: o.assigneeId ?? user.id } });
    if (o.leadId) await tx.lead.update({ where: { id: o.leadId }, data: { status: 'converted' } });
    await event(tx, id, 'status', 'Бронь подтверждена. Начислена стоимость аренды по снимку условий.', user.id);
    await audit(tx, user.id, 'order.confirm', 'order', id);
  });
}

async function reverseCharges(tx: Tx, user: SessionUser, orderId: string, reason: string) {
  const charges = await tx.ledgerEntry.findMany({ where: { orderId, kind: { startsWith: 'charge.' }, reversesId: null } });
  for (const c of charges) {
    const rev = await tx.ledgerEntry.findUnique({ where: { reversesId: c.id } });
    if (rev) continue;
    await tx.ledgerEntry.create({ data: { kind: c.kind, amount: -c.amount, basis: `Сторно: ${reason}`, createdById: user.id, orderId, vehicleId: c.vehicleId, customerId: c.customerId, reversesId: c.id } });
  }
}

export async function cancelOrder(user: SessionUser, id: string, reason: string, status: 'cancelled' | 'no_show' = 'cancelled') {
  if (!reason.trim()) throw new Error('Укажите причину');
  return withBookingLock(async (tx) => {
    const o = await loadOrder(tx, id);
    assertTransition(o.status, status);
    await releaseOrder(tx, id);
    await reverseCharges(tx, user, id, status === 'no_show' ? 'неявка' : 'отмена заказа');
    await tx.rentalOrder.update({ where: { id }, data: { status, cancelReason: reason.trim() } });
    if (o.leadId && o.status === 'new') await tx.lead.update({ where: { id: o.leadId }, data: { status: 'rejected' } });
    await event(tx, id, 'status', `${STATUS_LABEL[status]}: ${reason.trim()}. Начисления сторнированы; полученные деньги и залог — решение в разделе «Оплаты».`, user.id);
    await audit(tx, user.id, `order.${status}`, 'order', id, { reason });
  });
}

// ---------- Продление и замена ----------

export async function extendOrder(user: SessionUser, id: string, newReturnAt: Date) {
  return withBookingLock(async (tx) => {
    const o = await loadOrder(tx, id);
    if (!['negotiation', 'confirmed', 'issued'].includes(o.status)) throw new Error('Продление недоступно в этом статусе');
    if (newReturnAt <= o.returnAt) throw new Error('Новая дата возврата должна быть позже текущей');
    const terms = json<Terms>(o.termsSnapshot, null as never);
    const old = json<QuoteOk>(o.quoteSnapshot, null as never);
    const occ = await orderOccupancy(tx, id);
    if (!occ) throw new Error('У заказа нет активной брони — сначала подтвердите её');

    const blockedUntil = addMinutes(newReturnAt, terms.prepBufferMinutes);
    const c = await findConflict(tx, o.vehicleId, occ.startsAt, blockedUntil, terms.prepBufferMinutes, [occ.id]);
    if (c) throw new BookingConflict(c);

    // Пересчёт по снимку тарифа заказа, а не по текущему прайсу.
    const services = json<ServiceSelection[]>(o.services, []);
    const extras = await loadExtras();
    const q = quote({ pickupAt: o.pickupAt, returnAt: newReturnAt, tariff: terms.tariff, rules: { graceMinutes: terms.graceMinutes, minDays: 1, prepayment: null, assumptions: terms.assumptions }, services, extras, discount: old.discount ? { amount: old.discount, reason: old.discountReason ?? '' } : null });
    if (!q.ok) throw new Error(q.error);

    await tx.occupancy.update({ where: { id: occ.id }, data: { endsAt: newReturnAt, blockedUntil } });
    await tx.rentalOrder.update({ where: { id }, data: { returnAt: newReturnAt, quoteSnapshot: JSON.stringify(q) } });
    const diff = q.total - old.total;
    if (['confirmed', 'issued'].includes(o.status) && diff !== 0) {
      await post(tx, { kind: 'charge.rental', amount: diff, basis: `Продление до ${fmtDateTime(newReturnAt)}: ${daysWord(q.days)} по тарифу «${q.tier.label}»`, createdById: user.id, orderId: id, vehicleId: o.vehicleId, customerId: o.customerId });
    }
    await event(tx, id, 'extend', `Продление до ${fmtDateTime(newReturnAt)}. Новый итог ${q.total / 100} ₽ (было ${old.total / 100} ₽).`, user.id);
    await audit(tx, user.id, 'order.extend', 'order', id, { from: o.returnAt, to: newReturnAt });
  });
}

export async function replaceVehicle(user: SessionUser, id: string, newVehicleId: string, reason: string) {
  if (!reason.trim()) throw new Error('Укажите причину замены');
  return withBookingLock(async (tx) => {
    const o = await loadOrder(tx, id);
    if (!['new', 'negotiation', 'confirmed'].includes(o.status)) throw new Error('Замена возможна только до выдачи');
    if (newVehicleId === o.vehicleId) throw new Error('Выберите другой автомобиль');
    const terms = json<Terms>(o.termsSnapshot, null as never);
    const occ = await orderOccupancy(tx, id);
    const kind = occ?.kind ?? 'hold';
    const settings = await loadSettings();
    await releaseOrder(tx, id);
    await occupy(tx, { vehicleId: newVehicleId, kind, startsAt: o.pickupAt, endsAt: o.returnAt, bufferMin: terms.prepBufferMinutes, orderId: id, expiresAt: kind === 'hold' ? addMinutes(new Date(), settings.holdTtlMinutes) : null, createdById: user.id });
    const nv = await tx.vehicle.findUniqueOrThrow({ where: { id: newVehicleId } });
    await tx.rentalOrder.update({ where: { id }, data: { vehicleId: newVehicleId } });
    await event(tx, id, 'vehicle', `Замена автомобиля: ${o.vehicle.title} → ${nv.title}. Причина: ${reason.trim()}. Условия и цена сохранены по снимку.`, user.id);
    await audit(tx, user.id, 'order.replace_vehicle', 'order', id, { from: o.vehicleId, to: newVehicleId, reason });
  });
}

// ---------- Выдача и возврат ----------

export type InspectionInput = { mileageKm: number; fuelPercent: number; checklist: Record<string, boolean>; notes?: string; damages: { location: string; description: string }[]; photos: { path: string; mime: string }[] };

export async function issueOrder(user: SessionUser, id: string, insp: InspectionInput) {
  return withBookingLock(async (tx) => {
    const o = await loadOrder(tx, id);
    assertTransition(o.status, 'issued');
    const occ = await orderOccupancy(tx, id);
    if (!occ) throw new Error('Нет активной брони');
    const now = new Date();
    const inspection = await tx.inspection.create({
      data: { orderId: id, kind: 'pickup', performedBy: user.id, mileageKm: insp.mileageKm, fuelPercent: insp.fuelPercent, checklist: JSON.stringify(insp.checklist), notes: insp.notes || null, photos: { create: insp.photos } },
    });
    for (const d of insp.damages) await tx.damage.create({ data: { vehicleId: o.vehicleId, inspectionId: inspection.id, location: d.location, description: d.description } });
    await tx.occupancy.update({ where: { id: occ.id }, data: { kind: 'rental' } });
    await tx.rentalOrder.update({ where: { id }, data: { status: 'issued', actualPickupAt: now, handoverId: user.id } });
    await tx.vehicle.update({ where: { id: o.vehicleId }, data: { mileageKm: insp.mileageKm } });
    await event(tx, id, 'status', `Автомобиль выдан. Пробег ${insp.mileageKm} км, топливо ${insp.fuelPercent}%, фото: ${insp.photos.length}.`, user.id);
  });
}

export async function returnOrder(user: SessionUser, id: string, insp: InspectionInput & { chargeOvermileage: boolean; chargeLate: boolean }) {
  return withBookingLock(async (tx) => {
    const o = await loadOrder(tx, id);
    assertTransition(o.status, 'returned');
    const pickup = await tx.inspection.findFirst({ where: { orderId: id, kind: 'pickup' } });
    if (pickup && insp.mileageKm < pickup.mileageKm) throw new Error('Пробег при возврате меньше, чем при выдаче');
    const terms = json<Terms>(o.termsSnapshot, null as never);
    const q = json<QuoteOk>(o.quoteSnapshot, null as never);
    const now = new Date();
    const inspection = await tx.inspection.create({
      data: { orderId: id, kind: 'return', performedBy: user.id, mileageKm: insp.mileageKm, fuelPercent: insp.fuelPercent, checklist: JSON.stringify(insp.checklist), notes: insp.notes || null, photos: { create: insp.photos } },
    });
    for (const d of insp.damages) await tx.damage.create({ data: { vehicleId: o.vehicleId, inspectionId: inspection.id, location: d.location, description: d.description } });

    const occ = await orderOccupancy(tx, id);
    if (occ) await tx.occupancy.update({ where: { id: occ.id }, data: { endsAt: now, blockedUntil: addMinutes(now, terms.prepBufferMinutes) } });

    const extra = returnExtras(o, q, terms, pickup?.mileageKm ?? null, insp.mileageKm, now);
    if (insp.chargeOvermileage && extra.overKm > 0) {
      await post(tx, { kind: 'charge.extra', amount: extra.overAmount, basis: `Перепробег ${extra.overKm} км × ${terms.tariff.overmileagePerKm / 100} ₽`, createdById: user.id, orderId: id, vehicleId: o.vehicleId, customerId: o.customerId });
    }
    if (insp.chargeLate && extra.lateDays > 0) {
      await post(tx, { kind: 'charge.extra', amount: extra.lateAmount, basis: `Опоздание с возвратом: ${daysWord(extra.lateDays)} по ${q.dailyRate / 100} ₽ (правило не утверждено)`, createdById: user.id, orderId: id, vehicleId: o.vehicleId, customerId: o.customerId });
    }
    await tx.rentalOrder.update({ where: { id }, data: { status: 'returned', actualReturnAt: now } });
    await tx.vehicle.update({ where: { id: o.vehicleId }, data: { mileageKm: insp.mileageKm, condition: 'preparing' } });
    await event(tx, id, 'status', `Автомобиль возвращён. Пробег ${insp.mileageKm} км, топливо ${insp.fuelPercent}%, новых повреждений: ${insp.damages.length}. Машина на подготовке.`, user.id);
  });
}

/** Предлагаемые доплаты при возврате. Не проводятся автоматически. */
export function returnExtras(o: { returnAt: Date }, q: QuoteOk, terms: Terms, pickupKm: number | null, returnKm: number, at: Date) {
  const driven = pickupKm == null ? 0 : returnKm - pickupKm;
  const overKm = Math.max(0, driven - q.includedKm);
  const lateMin = Math.max(0, Math.round((at.getTime() - o.returnAt.getTime()) / 60000));
  const lateDays = lateMin > terms.graceMinutes ? Math.ceil(lateMin / 1440) : 0;
  return { driven, overKm, overAmount: overKm * terms.tariff.overmileagePerKm, lateMin, lateDays, lateAmount: lateDays * q.dailyRate };
}

export async function closeOrder(user: SessionUser, id: string) {
  return withBookingLock(async (tx) => {
    const o = await loadOrder(tx, id);
    assertTransition(o.status, 'closed');
    const m = await orderMoney(tx, id);
    if (m.debt > 0) throw new Error(`Нельзя закрыть: задолженность ${m.debt / 100} ₽`);
    if (m.debt < 0) throw new Error(`Нельзя закрыть: переплата ${-m.debt / 100} ₽ — верните или зачтите`);
    if (m.depositBalance !== 0) throw new Error(`Нельзя закрыть: по залогу остаток ${m.depositBalance / 100} ₽ — верните или удержите`);
    const pending = await tx.withholdRequest.count({ where: { orderId: id, status: 'pending' } });
    if (pending) throw new Error('Есть неподтверждённый запрос на удержание');
    await tx.rentalOrder.update({ where: { id }, data: { status: 'closed' } });
    await event(tx, id, 'status', 'Заказ закрыт.', user.id);
  });
}

export async function freeAlternatives(o: { pickupAt: Date; returnAt: Date; vehicleId: string }) {
  const settings = await loadSettings();
  const free = await availableVehicleIds(o.pickupAt, o.returnAt, settings.prepBufferMinutes);
  free.delete(o.vehicleId);
  return db.vehicle.findMany({ where: { id: { in: [...free] } }, orderBy: { sortOrder: 'asc' } });
}
