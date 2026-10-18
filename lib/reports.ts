// Финансовые отчёты. Формулы описаны рядом с расчётом.
import { db } from './db';
import { summarize } from './ledger';

export async function periodReport(from: Date, to: Date) {
  const entries = await db.ledgerEntry.findMany({ where: { occurredAt: { gte: from, lt: to } } });
  const sum = (k: string) => entries.filter((e) => e.kind === k).reduce((s, e) => s + e.amount, 0);
  const charges = entries.filter((e) => e.kind.startsWith('charge.')).reduce((s, e) => s + e.amount, 0);
  return {
    // Движение денег (касса): поступления и выплаты.
    paymentsIn: sum('payment.in'),
    paymentsRefund: sum('payment.refund'),
    depositsIn: sum('deposit.in'),
    depositsOut: sum('deposit.refund'),
    depositsWithheld: sum('deposit.withhold'),
    expensesVehicle: sum('expense.vehicle'),
    expensesGeneral: sum('expense.general'),
    // Начисления (заработано) — по дате начисления, без залогов.
    charges,
    count: entries.length,
  };
}

export async function debtsAndDeposits() {
  const orders = await db.rentalOrder.findMany({ where: { status: { in: ['confirmed', 'issued', 'returned', 'closed', 'cancelled', 'no_show'] } }, include: { customer: true, vehicle: true, ledger: { select: { kind: true, amount: true } } } });
  const rows = orders.map((o) => ({ o, m: summarize(o.ledger) }));
  return {
    debts: rows.filter((r) => r.m.debt > 0 && ['issued', 'returned'].includes(r.o.status) || (r.m.debt > 0 && r.o.status === 'confirmed' && r.o.pickupAt < new Date())),
    deposits: rows.filter((r) => r.m.depositBalance > 0 && ['returned', 'closed', 'cancelled', 'no_show'].includes(r.o.status)),
    overpaid: rows.filter((r) => r.m.debt < 0),
  };
}

/**
 * Загрузка = занятое время (бронь + аренда) / доступное для аренды время,
 * где доступное = длина периода − обслуживание − ручные блокировки.
 * Простой на обслуживании показывается отдельно.
 */
export async function utilization(from: Date, to: Date) {
  const [vehicles, occ, ledger] = await Promise.all([
    db.vehicle.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.occupancy.findMany({ where: { startsAt: { lt: to }, endsAt: { gt: from }, kind: { in: ['booking', 'rental', 'maintenance', 'block'] } } }),
    db.ledgerEntry.findMany({ where: { occurredAt: { gte: from, lt: to }, vehicleId: { not: null } } }),
  ]);
  const periodH = (to.getTime() - from.getTime()) / 3600000;
  const now = new Date();
  return vehicles.map((v) => {
    let busy = 0, maint = 0;
    for (const o of occ.filter((x) => x.vehicleId === v.id)) {
      // Снятая бронь (отмена) не считается; завершённая аренда считается по факту.
      if (o.releasedAt && o.kind !== 'rental') continue;
      const end = o.releasedAt && o.releasedAt < o.endsAt ? o.releasedAt : o.endsAt;
      const s = Math.max(from.getTime(), o.startsAt.getTime());
      const e = Math.min(to.getTime(), end.getTime());
      if (e <= s) continue;
      const h = (e - s) / 3600000;
      if (o.kind === 'maintenance' || o.kind === 'block') maint += h;
      else busy += h;
    }
    const available = Math.max(0, periodH - maint);
    const income = ledger.filter((e) => e.vehicleId === v.id && e.kind.startsWith('charge.')).reduce((s, e) => s + e.amount, 0);
    const expenses = ledger.filter((e) => e.vehicleId === v.id && e.kind === 'expense.vehicle').reduce((s, e) => s + e.amount, 0);
    return { v, busyH: busy, maintH: maint, availableH: available, util: available ? busy / available : 0, income, expenses, result: income - expenses, future: from > now };
  });
}
