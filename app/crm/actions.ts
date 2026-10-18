'use server';

// Серверные действия CRM. Каждое проверяет права заново: скрытая кнопка — не защита.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSession, currentUser, destroySession, hashPassword, verifyPassword } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseLocal } from '@/lib/dates';
import { BookingConflict, occupy, withBookingLock } from '@/lib/booking';
import { orderMoney, post, reverse } from '@/lib/ledger';
import { parseRub } from '@/lib/money';
import { can, directionsOf, Forbidden, ROLE_CODES, type Perm, type SessionUser } from '@/lib/permissions';
import { audit, cancelOrder, completeOrder, confirmOrder, createCrmOrder, event, extendHold, extendOrder, issueOrder, normalizePhone, replaceVehicle, returnOrder, takeOrder } from '@/lib/orders';
import { saveImages } from '@/lib/files';
import { allow } from '@/lib/ratelimit';

export type ActionState = { error?: string; ok?: string } | undefined;

async function guard(perm: Perm | Perm[]): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new Forbidden('Сессия истекла — войдите снова');
  const list = Array.isArray(perm) ? perm : [perm];
  if (!list.some((p) => can(user, p))) throw new Forbidden();
  return user;
}

/** Доступ к заказу: все заказы проката или только назначенные (сотрудник выдачи). */
async function orderAccess(user: SessionUser, orderId: string) {
  const o = await db.rentalOrder.findUnique({ where: { id: orderId }, select: { handoverId: true } });
  if (!o) throw new Error('Заказ не найден');
  if (can(user, 'rental.read')) return;
  if (can(user, 'rental.read.assigned') && o.handoverId === user.id) return;
  throw new Forbidden();
}

async function run(fn: () => Promise<string | void>, paths: string[] = ['/crm']): Promise<ActionState> {
  try {
    const ok = await fn();
    for (const p of paths) revalidatePath(p, 'layout');
    return { ok: ok || 'Готово' };
  } catch (e) {
    if (e instanceof BookingConflict) return { error: e.message };
    if (e && typeof e === 'object' && 'digest' in e && String((e as { digest: string }).digest).startsWith('NEXT_REDIRECT')) throw e;
    return { error: e instanceof Error ? e.message : 'Не удалось выполнить действие' };
  }
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
function money(fd: FormData, k = 'amount') {
  const v = parseRub(fd.get(k));
  if (v == null || v <= 0) throw new Error('Укажите сумму в рублях');
  return v;
}
function dt(fd: FormData, k: string) {
  const d = parseLocal(str(fd, k));
  if (!d) throw new Error('Укажите дату и время');
  return d;
}

// ---------- Вход ----------

export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, 'email').toLowerCase();
  if (!allow(`login:${email}`, 8, 15 * 60000)) return { error: 'Слишком много попыток. Подождите 15 минут.' };
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !verifyPassword(str(fd, 'password'), user.passwordHash)) return { error: 'Неверный e-mail или пароль' };
  await createSession(user.id);
  redirect(can({ ...user }, 'rental.read') || can({ ...user }, 'rental.read.assigned') ? '/crm' : directionsOf({ ...user }).length ? '/crm/leads' : '/crm/settings');
}

export async function logout() {
  await destroySession();
  redirect('/crm/login');
}

// ---------- Заказы ----------

export async function createOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = '';
  const res = await run(async () => {
    const user = await guard('rental.write');
    const phone = normalizePhone(str(fd, 'phone'));
    if (!phone) throw new Error('Проверьте телефон клиента');
    const name = str(fd, 'name');
    if (name.length < 2) throw new Error('Укажите имя клиента');
    const hours = Number(fd.get('driverHours') || 0);
    const o = await createCrmOrder(user, {
      vehicleId: str(fd, 'vehicleId'),
      pickupAt: dt(fd, 'from'),
      returnAt: dt(fd, 'to'),
      name,
      phone,
      email: str(fd, 'email') || null,
      services: hours > 0 ? [{ code: 'driver', qty: hours }] : [],
      leadId: str(fd, 'leadId') || null,
    });
    id = o.id;
  });
  if (res?.error) return res;
  redirect(`/crm/orders/${id}`);
}

export async function orderStepAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard('rental.write');
    const id = str(fd, 'id');
    const step = str(fd, 'step');
    if (step === 'take') await takeOrder(user, id);
    else if (step === 'hold') await extendHold(user, id);
    else if (step === 'confirm') await confirmOrder(user, id);
    else throw new Error('Неизвестное действие');
  });
}

export async function completeOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard('rental.write');
    const amount = (k: string) => {
      const v = str(fd, k);
      if (!v) return 0;
      const r = parseRub(v);
      if (r == null) throw new Error('Проверьте суммы — только цифры');
      return r;
    };
    const method = (k: string) => {
      const m = str(fd, k) || 'transfer';
      if (!['cash', 'card', 'transfer'].includes(m)) throw new Error('Выберите способ');
      return m;
    };
    const pay = amount('payment');
    if (pay && !can(user, 'payment.accept')) throw new Forbidden('Нет права принимать оплату');
    const m = await completeOrder(user, str(fd, 'id'), {
      payment: pay ? { amount: pay, method: method('paymentMethod') } : null,
      overpayRefund: amount('overpay') ? { amount: amount('overpay'), method: method('overpayMethod') } : null,
      depositRefund: amount('depositRefund') ? { amount: amount('depositRefund'), method: method('depositMethod') } : null,
      holdDays: Number(str(fd, 'holdDays') || 21),
      allowDebt: fd.get('allowDebt') === 'on',
      canRefund: can(user, 'refund.issue'),
    });
    return m.depositBalance > 0 ? 'Заказ завершён. Остаток залога ждёт возврата после проверки штрафов.' : 'Заказ завершён';
  });
}

export async function cancelOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard('rental.write');
    await cancelOrder(user, str(fd, 'id'), str(fd, 'reason'), str(fd, 'status') === 'no_show' ? 'no_show' : 'cancelled');
  });
}

export async function extendOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard('rental.write');
    await extendOrder(user, str(fd, 'id'), dt(fd, 'returnAt'));
    return 'Заказ продлён';
  });
}

export async function replaceVehicleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard('rental.write');
    await replaceVehicle(user, str(fd, 'id'), str(fd, 'vehicleId'), str(fd, 'reason'));
    return 'Автомобиль заменён';
  });
}

export async function assignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard('rental.write');
    const id = str(fd, 'id');
    const assigneeId = str(fd, 'assigneeId') || null;
    const handoverId = str(fd, 'handoverId') || null;
    await db.rentalOrder.update({ where: { id }, data: { assigneeId, handoverId } });
    const names = await db.user.findMany({ where: { id: { in: [assigneeId, handoverId].filter(Boolean) as string[] } } });
    const n = (uid: string | null) => names.find((u) => u.id === uid)?.fullName ?? '—';
    await event(db, id, 'assign', `Ответственный: ${n(assigneeId)}. Выдача: ${n(handoverId)}.`, user.id);
  });
}

export async function commentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard(['rental.read', 'rental.read.assigned']);
    const id = str(fd, 'id');
    await orderAccess(user, id);
    const body = str(fd, 'body');
    if (!body) throw new Error('Пустой комментарий');
    await db.orderComment.create({ data: { orderId: id, authorId: user.id, body: body.slice(0, 2000) } });
    return 'Добавлено';
  });
}

// ---------- Деньги по заказу ----------

export async function moneyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const kind = str(fd, 'kind');
    const perm: Record<string, Perm> = { 'payment.in': 'payment.accept', 'deposit.in': 'payment.accept', 'payment.refund': 'refund.issue', 'deposit.refund': 'refund.issue' };
    if (!perm[kind]) throw new Error('Неизвестная операция');
    const user = await guard(perm[kind]);
    const id = str(fd, 'id');
    const amount = money(fd);
    const method = str(fd, 'method');
    if (!['cash', 'card', 'transfer'].includes(method)) throw new Error('Выберите способ');
    const o = await db.rentalOrder.findUniqueOrThrow({ where: { id } });
    await withBookingLock(async (tx) => {
      const m = await orderMoney(tx, id);
      if (kind === 'payment.refund' && amount > m.paid) throw new Error('Возврат больше полученной оплаты');
      if (kind === 'deposit.refund' && amount > m.depositBalance) throw new Error(`Возврат больше остатка залога (${m.depositBalance / 100} ₽)`);
      await post(tx, { kind, amount, method, basis: str(fd, 'basis') || (kind.startsWith('deposit') ? 'Залог' : 'Оплата аренды'), createdById: user.id, orderId: id, vehicleId: o.vehicleId, customerId: o.customerId, idempotencyKey: str(fd, 'key') || null });
      await event(tx, id, 'money', `${kind === 'payment.in' ? 'Получена оплата' : kind === 'payment.refund' ? 'Возврат оплаты' : kind === 'deposit.in' ? 'Получен залог' : 'Возвращён залог'}: ${amount / 100} ₽`, user.id);
    });
    return 'Операция проведена';
  });
}

export async function chargeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const isDiscount = str(fd, 'type') === 'discount';
    const user = await guard(isDiscount ? 'discount.apply' : 'rental.write');
    const id = str(fd, 'id');
    const amount = money(fd);
    const basis = str(fd, 'basis');
    if (!basis) throw new Error(isDiscount ? 'Укажите причину скидки' : 'Укажите основание');
    const o = await db.rentalOrder.findUniqueOrThrow({ where: { id } });
    if (!['confirmed', 'issued', 'returned'].includes(o.status)) throw new Error('Начисления — после подтверждения брони');
    await post(db, { kind: isDiscount ? 'charge.discount' : 'charge.extra', amount: isDiscount ? -amount : amount, basis: isDiscount ? `Скидка: ${basis}` : basis, createdById: user.id, orderId: id, vehicleId: o.vehicleId, customerId: o.customerId });
    await event(db, id, 'money', `${isDiscount ? 'Скидка' : 'Начисление'} ${amount / 100} ₽: ${basis}`, user.id);
    await audit(db, user.id, isDiscount ? 'ledger.discount' : 'ledger.charge', 'order', id, { amount, basis });
  });
}

export async function withholdRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard('deposit.withhold.request');
    const id = str(fd, 'id');
    await orderAccess(user, id);
    const amount = money(fd);
    const basis = str(fd, 'basis');
    if (basis.length < 5) throw new Error('Опишите основание удержания');
    const m = await orderMoney(db, id);
    if (amount > m.depositBalance) throw new Error(`Сумма больше остатка залога (${m.depositBalance / 100} ₽)`);
    await db.withholdRequest.create({ data: { orderId: id, amount, basis, requestedBy: user.id } });
    await event(db, id, 'withhold', `Запрошено удержание ${amount / 100} ₽: ${basis}. Ждёт подтверждения.`, user.id);
    return 'Запрос отправлен на подтверждение';
  });
}

export async function withholdDecisionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard('deposit.withhold.approve');
    const r = await db.withholdRequest.findUniqueOrThrow({ where: { id: str(fd, 'requestId') } });
    if (r.status !== 'pending') throw new Error('Запрос уже рассмотрен');
    const approve = str(fd, 'decision') === 'approve';
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
  });
}

export async function reverseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard('ledger.reverse');
    const basis = str(fd, 'basis');
    if (basis.length < 3) throw new Error('Укажите причину возврата');
    const e = await reverse(db, str(fd, 'entryId'), basis, user.id);
    if (e.orderId) await event(db, e.orderId, 'money', `Возврат операции: ${basis}`, user.id);
    await audit(db, user.id, 'ledger.reverse', 'ledger', e.reversesId!, { basis });
    return 'Возврат проведён';
  });
}

// ---------- Выдача и возврат ----------

function inspectionFrom(fd: FormData) {
  const mileageKm = Number(str(fd, 'mileageKm'));
  const fuelPercent = Number(str(fd, 'fuelPercent'));
  if (!Number.isInteger(mileageKm) || mileageKm < 0) throw new Error('Укажите пробег');
  if (!Number.isInteger(fuelPercent) || fuelPercent < 0 || fuelPercent > 100) throw new Error('Топливо — от 0 до 100%');
  const checklist: Record<string, boolean> = {};
  for (const k of ['docs', 'keys', 'clean', 'kit', 'tires', 'lights']) checklist[k] = fd.get(`c_${k}`) === 'on';
  const damages = str(fd, 'damages')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [location, ...rest] = l.split('—');
      return { location: location.trim().slice(0, 120), description: (rest.join('—').trim() || location.trim()).slice(0, 500) };
    });
  return { mileageKm, fuelPercent, checklist, notes: str(fd, 'notes'), damages };
}

export async function inspectionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = '';
  const res = await run(async () => {
    const user = await guard('rental.inspect');
    id = str(fd, 'id');
    await orderAccess(user, id);
    const data = inspectionFrom(fd);
    const photos = await saveImages(fd.getAll('photos') as File[], `inspections/${id}`);
    if (photos.length < 1) throw new Error('Добавьте хотя бы одну фотографию');
    if (str(fd, 'kind') === 'pickup') await issueOrder(user, id, { ...data, photos });
    else await returnOrder(user, id, { ...data, photos, chargeOvermileage: fd.get('chargeOver') === 'on', chargeLate: fd.get('chargeLate') === 'on' });
  });
  if (res?.error) return res;
  redirect(`/crm/orders/${id}?tab=handover`);
}

// ---------- Автопарк ----------

export async function vehicleConditionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const condition = str(fd, 'condition');
    const v = await db.vehicle.findUniqueOrThrow({ where: { id: str(fd, 'vehicleId') } });
    // Готовность после подготовки подтверждает сотрудник выдачи или менеджер.
    const user = await guard(v.condition === 'preparing' && condition === 'ready' ? ['rental.inspect', 'fleet.write'] : 'fleet.write');
    if (!['ready', 'preparing', 'maintenance', 'unavailable'].includes(condition)) throw new Error('Неизвестное состояние');
    await db.vehicle.update({ where: { id: v.id }, data: { condition } });
    await audit(db, user.id, 'vehicle.condition', 'vehicle', v.id, { from: v.condition, to: condition });
  });
}

export async function vehicleBlockAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard('fleet.write');
    const kind = str(fd, 'kind') === 'block' ? 'block' : 'maintenance';
    const note = str(fd, 'note');
    if (!note) throw new Error('Укажите причину');
    await withBookingLock((tx) => occupy(tx, { vehicleId: str(fd, 'vehicleId'), kind, startsAt: dt(fd, 'from'), endsAt: dt(fd, 'to'), bufferMin: 0, note, createdById: user.id }));
    return 'Блокировка добавлена';
  });
}

export async function releaseBlockAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard('fleet.write');
    const o = await db.occupancy.findUniqueOrThrow({ where: { id: str(fd, 'occupancyId') } });
    if (!['maintenance', 'block'].includes(o.kind)) throw new Error('Снять можно только блокировку или ТО');
    await db.occupancy.update({ where: { id: o.id }, data: { releasedAt: new Date() } });
    await audit(db, user.id, 'vehicle.unblock', 'vehicle', o.vehicleId, { occupancyId: o.id });
  });
}

export async function vehicleUpdateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard('fleet.write');
    const id = str(fd, 'vehicleId');
    const num = (k: string) => (str(fd, k) ? Number(str(fd, k)) : null);
    const data: Record<string, unknown> = {
      mileageKm: num('mileageKm') ?? 0,
      nextServiceKm: num('nextServiceKm'),
      nextServiceAt: str(fd, 'nextServiceAt') ? parseLocal(str(fd, 'nextServiceAt') + 'T00:00') : null,
      isPublished: fd.get('isPublished') === 'on',
      description: str(fd, 'description') || null,
    };
    if (can(user, 'vehicle.sensitive')) {
      data.vin = str(fd, 'vin') || null;
      data.plate = str(fd, 'plate') || null;
    }
    await db.vehicle.update({ where: { id }, data });
    await audit(db, user.id, 'vehicle.update', 'vehicle', id);
    return 'Сохранено';
  });
}

const TRANSLIT: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
function slugify(s: string) {
  return s.toLowerCase().split('').map((c) => TRANSLIT[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'avto';
}

export async function vehicleCreateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = '';
  const res = await run(async () => {
    const user = await guard('fleet.write');
    const make = str(fd, 'make'), model = str(fd, 'model');
    if (!make || !model) throw new Error('Укажите марку и модель');
    const year = Number(str(fd, 'year')), powerHp = Number(str(fd, 'powerHp'));
    if (!Number.isInteger(year) || year < 1990 || year > 2100) throw new Error('Проверьте год выпуска');
    if (!Number.isInteger(powerHp) || powerHp <= 0) throw new Error('Проверьте мощность');
    if (!str(fd, 'accel')) throw new Error('Укажите разгон до 100 км/ч');

    // Тариф — только с правом изменения тарифов; без тарифа машина не видна на сайте.
    let tariff: { tiers: { minDays: number; dailyRate: number }[]; deposit: number; km: number; over: number; driver: number | null } | null = null;
    const anyRate = [1, 3, 7, 14, 30].some((d) => str(fd, `t${d}`));
    if (anyRate) {
      if (!can(user, 'tariff.edit')) throw new Forbidden('Тариф задаёт руководитель');
      const tiers = [1, 3, 7, 14, 30].map((minDays) => {
        const rate = parseRub(fd.get(`t${minDays}`));
        if (!rate) throw new Error(`Укажите ставку «${minDays === 1 ? '1–2 сут' : `от ${minDays} сут`}» или оставьте все ставки пустыми`);
        return { minDays, dailyRate: rate };
      });
      const km = Number(str(fd, 'km'));
      if (!Number.isInteger(km) || km <= 0) throw new Error('Км в сутки — целое число');
      tariff = { tiers, deposit: money(fd, 'deposit'), km, over: money(fd, 'overmileage'), driver: str(fd, 'driver') ? parseRub(fd.get('driver')) : null };
    }

    const base = slugify(`${make} ${model}`);
    let slug = base;
    for (let i = 2; await db.vehicle.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
    const last = await db.vehicle.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const equipment = str(fd, 'equipment').split('\n').map((l) => l.trim()).filter(Boolean);

    const v = await db.$transaction(async (tx) => {
      const v = await tx.vehicle.create({
        data: {
          slug, make, model, title: `${make} ${model}`, year, powerHp,
          bodyType: str(fd, 'bodyType') || 'sedan', accel: str(fd, 'accel'), drive: str(fd, 'drive') || 'полный', fuel: str(fd, 'fuel') || 'бензин',
          seats: str(fd, 'seats') ? Number(str(fd, 'seats')) : null, mileageKm: Number(str(fd, 'mileageKm')) || 0,
          colorExterior: str(fd, 'colorExterior') || null, colorInterior: str(fd, 'colorInterior') || null,
          description: str(fd, 'description') || null, equipment: equipment.length ? JSON.stringify(equipment) : null,
          vin: can(user, 'vehicle.sensitive') ? str(fd, 'vin') || null : null, plate: can(user, 'vehicle.sensitive') ? str(fd, 'plate') || null : null,
          isPublished: fd.get('isPublished') === 'on', sortOrder: (last?.sortOrder ?? 0) + 1,
        },
      });
      if (tariff) await tx.tariffPlan.create({ data: { vehicleId: v.id, tiers: JSON.stringify(tariff.tiers), deposit: tariff.deposit, includedKmPerDay: tariff.km, overmileagePerKm: tariff.over, driverPerHour: tariff.driver, createdById: user.id } });
      await audit(tx, user.id, 'vehicle.create', 'vehicle', v.id, { title: v.title });
      return v;
    });
    id = v.id;
  });
  if (res?.error) return res;
  redirect(`/crm/vehicles/${id}`);
}

export async function vehicleDocAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await guard('fleet.write');
    const title = str(fd, 'title');
    if (!title) throw new Error('Название документа');
    await db.vehicleDocument.create({ data: { vehicleId: str(fd, 'vehicleId'), kind: str(fd, 'kind') || 'other', title, validUntil: str(fd, 'validUntil') ? parseLocal(str(fd, 'validUntil') + 'T00:00') : null } });
    return 'Документ добавлен';
  });
}

export async function damageRepairedAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard('fleet.write');
    const d = await db.damage.update({ where: { id: str(fd, 'damageId') }, data: { status: 'repaired' } });
    await audit(db, user.id, 'damage.repaired', 'vehicle', d.vehicleId, { damageId: d.id });
  });
}

export async function tariffAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard('tariff.edit');
    const vehicleId = str(fd, 'vehicleId');
    const tiers = [1, 3, 7, 14, 30].map((minDays) => {
      const rate = parseRub(fd.get(`t${minDays}`));
      if (!rate) throw new Error(`Укажите ставку для ступени от ${minDays} сут.`);
      return { minDays, dailyRate: rate };
    });
    const deposit = money(fd, 'deposit');
    const over = money(fd, 'overmileage');
    const km = Number(str(fd, 'km'));
    if (!Number.isInteger(km) || km <= 0) throw new Error('Включённый пробег — целое число км');
    const driver = str(fd, 'driver') ? parseRub(fd.get('driver')) : null;
    await db.$transaction(async (tx) => {
      await tx.tariffPlan.updateMany({ where: { vehicleId, status: 'active' }, data: { status: 'archived' } });
      await tx.tariffPlan.create({ data: { vehicleId, tiers: JSON.stringify(tiers), deposit, includedKmPerDay: km, overmileagePerKm: over, driverPerHour: driver, createdById: user.id, note: str(fd, 'note') || null } });
      await audit(tx, user.id, 'tariff.change', 'vehicle', vehicleId, { tiers, deposit });
    });
    return 'Новый тариф действует для новых расчётов. Существующие заказы не пересчитаны.';
  });
}

// ---------- Финансы ----------

export async function expenseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard('finance.expenses');
    const vehicleId = str(fd, 'vehicleId') || null;
    const basis = str(fd, 'basis');
    if (!basis) throw new Error('Укажите основание');
    const occurredAt = str(fd, 'date') ? parseLocal(str(fd, 'date') + 'T12:00') ?? new Date() : new Date();
    await post(db, { kind: vehicleId ? 'expense.vehicle' : 'expense.general', amount: money(fd), basis, method: str(fd, 'method') || null, vehicleId, createdById: user.id, occurredAt, direction: str(fd, 'direction') || 'rental' });
    return 'Расход записан';
  });
}

// ---------- Клиенты ----------

export async function customerUpdateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard('customers.write');
    const id = str(fd, 'customerId');
    const c = await db.customer.findUnique({ where: { id }, include: { directions: true } });
    if (!c) throw new Error('Клиент не найден');
    // Редактировать можно только клиентов своего направления.
    const dirs = directionsOf(user);
    if (!c.directions.some((d) => dirs.includes(d.direction as never))) throw new Forbidden();

    const fullName = str(fd, 'fullName');
    if (fullName.length < 2) throw new Error('Укажите имя клиента');
    const phone = normalizePhone(str(fd, 'phone'));
    if (!phone) throw new Error('Проверьте телефон: нужен российский номер из 11 цифр');
    if (phone !== c.phone && (await db.customer.findUnique({ where: { phone } }))) throw new Error('Клиент с таким телефоном уже есть в базе');
    const email = str(fd, 'email');
    if (email && !z.string().email().safeParse(email).success) throw new Error('Проверьте e-mail');
    const date = (k: string, label: string) => {
      const v = str(fd, k);
      if (!v) return null;
      const d = parseLocal(`${v}T12:00`);
      if (!d) throw new Error(`Проверьте поле «${label}»`);
      if (d > new Date()) throw new Error(`«${label}» не может быть в будущем`);
      return d;
    };
    const birthDate = date('birthDate', 'Дата рождения');
    const drivingSince = date('drivingSince', 'Стаж с');
    if (birthDate && drivingSince && drivingSince < birthDate) throw new Error('Стаж не может начинаться раньше даты рождения');
    const notes = str(fd, 'notes').slice(0, 2000);

    const data = { fullName, phone, email: email || null, birthDate, drivingSince, isForeign: fd.get('isForeign') === 'on', notes: notes || null };
    const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => String(data[k] ?? '') !== String(c[k] ?? ''));
    if (!changed.length) return 'Изменений нет';
    await db.customer.update({ where: { id }, data: { ...data, updatedAt: new Date() } });
    // В журнал — только какие поля изменены, без самих персональных данных.
    await audit(db, user.id, 'customer.update', 'customer', id, { fields: changed });
    return 'Сохранено';
  });
}

// ---------- Заявки ----------

export async function leadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const lead = await db.lead.findUniqueOrThrow({ where: { id: str(fd, 'leadId') } });
    const user = await guard(`leads.${lead.direction}` as Perm);
    const status = str(fd, 'status');
    if (!['in_progress', 'rejected', 'spam', 'converted', 'new'].includes(status)) throw new Error('Неизвестный статус');
    await db.lead.update({ where: { id: lead.id }, data: { status, assigneeId: lead.assigneeId ?? user.id } });
    await audit(db, user.id, 'lead.status', 'lead', lead.id, { status });
  });
}

// ---------- Настройки ----------

export async function ruleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard('settings.manage');
    const key = str(fd, 'key');
    let value: unknown;
    try {
      value = JSON.parse(str(fd, 'value'));
    } catch {
      throw new Error('Значение должно быть в формате JSON');
    }
    const status = str(fd, 'status') === 'approved' ? 'approved' : 'assumption';
    await db.pricingRule.update({ where: { key }, data: { value: JSON.stringify(value), status } });
    await audit(db, user.id, 'settings.rule', 'rule', key, { value, status });
    return 'Сохранено';
  });
}

export async function userCreateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard('users.manage');
    const Body = z.object({ email: z.string().email('Некорректный e-mail'), fullName: z.string().min(2, 'Имя'), role: z.enum(ROLE_CODES as [string, ...string[]]), password: z.string().min(8, 'Пароль — от 8 символов') });
    const d = Body.parse({ email: str(fd, 'email').toLowerCase(), fullName: str(fd, 'fullName'), role: str(fd, 'role'), password: str(fd, 'password') });
    if (d.role === 'owner' && user.role !== 'owner') throw new Forbidden('Роль владельца назначает только владелец');
    const u = await db.user.create({ data: { email: d.email, fullName: d.fullName, role: d.role, passwordHash: hashPassword(d.password) } });
    await audit(db, user.id, 'user.create', 'user', u.id, { role: d.role });
    return 'Пользователь создан';
  });
}

export async function userToggleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await guard('users.manage');
    const id = str(fd, 'userId');
    if (id === user.id) throw new Error('Нельзя отключить себя');
    const u = await db.user.findUniqueOrThrow({ where: { id } });
    if (u.role === 'owner' && user.role !== 'owner') throw new Forbidden();
    await db.user.update({ where: { id }, data: { isActive: !u.isActive } });
    if (u.isActive) await db.session.deleteMany({ where: { userId: id } });
    await audit(db, user.id, u.isActive ? 'user.disable' : 'user.enable', 'user', id);
  });
}
