// Финансы: начисления, движение денег и залоги — раздельно.
// Журнал только на добавление; исправление — сторно с историей.

import type { LedgerEntry, Prisma } from '@prisma/client';
import { db } from './db';

type Tx = Prisma.TransactionClient | typeof db;

export const KIND_LABEL: Record<string, string> = {
  'charge.rental': 'Начисление: аренда',
  'charge.service': 'Начисление: услуга',
  'charge.extra': 'Доп. начисление',
  'charge.discount': 'Скидка',
  'payment.in': 'Оплата получена',
  'payment.refund': 'Возврат оплаты',
  'deposit.in': 'Залог получен',
  'deposit.refund': 'Залог возвращён',
  'deposit.withhold': 'Удержание из залога',
  'expense.vehicle': 'Расход по автомобилю',
  'expense.general': 'Общий расход',
};

export const METHOD_LABEL: Record<string, string> = { cash: 'наличные', card: 'карта', transfer: 'перевод' };

export type OrderMoney = {
  charges: number;
  paid: number;
  debt: number;
  depositIn: number;
  depositRefunded: number;
  depositWithheld: number;
  depositBalance: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'overpaid';
  depositStatus: 'none' | 'held' | 'partially_returned' | 'returned';
};

export function summarize(entries: Pick<LedgerEntry, 'kind' | 'amount'>[], depositRequired = 0): OrderMoney {
  const sum = (pred: (k: string) => boolean) => entries.filter((e) => pred(e.kind)).reduce((s, e) => s + e.amount, 0);
  const charges = sum((k) => k.startsWith('charge.'));
  const depositIn = sum((k) => k === 'deposit.in');
  const depositRefunded = sum((k) => k === 'deposit.refund');
  const depositWithheld = sum((k) => k === 'deposit.withhold');
  // Удержание из залога закрывает начисление (например, за повреждение).
  const paid = sum((k) => k === 'payment.in') - sum((k) => k === 'payment.refund') + depositWithheld;
  const debt = charges - paid;
  const depositBalance = depositIn - depositRefunded - depositWithheld;
  return {
    charges,
    paid,
    debt,
    depositIn,
    depositRefunded,
    depositWithheld,
    depositBalance,
    paymentStatus: paid <= 0 ? 'unpaid' : debt > 0 ? 'partial' : debt < 0 ? 'overpaid' : 'paid',
    depositStatus: depositIn === 0 ? 'none' : depositBalance === 0 ? 'returned' : depositBalance < depositIn ? 'partially_returned' : 'held',
  };
}

export const PAYMENT_STATUS_LABEL = { unpaid: 'не оплачено', partial: 'частично', paid: 'оплачено', overpaid: 'переплата' } as const;
export const DEPOSIT_STATUS_LABEL = { none: 'не получен', held: 'получен', partially_returned: 'частично возвращён', returned: 'возвращён' } as const;

export async function orderMoney(tx: Tx, orderId: string, depositRequired = 0) {
  const entries = await tx.ledgerEntry.findMany({ where: { orderId }, select: { kind: true, amount: true } });
  return summarize(entries, depositRequired);
}

export async function post(
  tx: Tx,
  e: { kind: string; amount: number; basis: string; createdById: string; orderId?: string | null; vehicleId?: string | null; customerId?: string | null; method?: string | null; approvedById?: string | null; occurredAt?: Date; idempotencyKey?: string | null; direction?: string },
) {
  if (!e.basis.trim()) throw new Error('Укажите основание операции');
  if (!Number.isInteger(e.amount) || e.amount === 0) throw new Error('Сумма должна быть ненулевой');
  if (e.idempotencyKey) {
    const existing = await tx.ledgerEntry.findUnique({ where: { idempotencyKey: e.idempotencyKey } });
    if (existing) return existing;
  }
  return tx.ledgerEntry.create({
    data: {
      kind: e.kind,
      amount: e.amount,
      basis: e.basis.trim(),
      createdById: e.createdById,
      orderId: e.orderId ?? null,
      vehicleId: e.vehicleId ?? null,
      customerId: e.customerId ?? null,
      method: e.method ?? null,
      approvedById: e.approvedById ?? null,
      occurredAt: e.occurredAt ?? new Date(),
      idempotencyKey: e.idempotencyKey ?? null,
      direction: e.direction ?? 'rental',
    },
  });
}

/** Сторно: запись с обратным знаком и ссылкой на исходную. Повторное сторно невозможно. */
export async function reverse(tx: Tx, entryId: string, basis: string, userId: string) {
  const src = await tx.ledgerEntry.findUnique({ where: { id: entryId } });
  if (!src) throw new Error('Операция не найдена');
  if (src.reversesId) throw new Error('Возврат операции нельзя отменить повторно');
  const already = await tx.ledgerEntry.findUnique({ where: { reversesId: entryId } });
  if (already) throw new Error('По этой операции уже сделан возврат');
  return tx.ledgerEntry.create({
    data: {
      kind: src.kind,
      amount: -src.amount,
      basis: `Возврат: ${basis.trim()}`,
      createdById: userId,
      orderId: src.orderId,
      vehicleId: src.vehicleId,
      customerId: src.customerId,
      method: src.method,
      reversesId: src.id,
      direction: src.direction,
    },
  });
}
