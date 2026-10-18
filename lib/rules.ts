import { db, json } from './db';
import type { ExtraServiceDef, Prepayment, Rules, Tariff, Tier } from './pricing';

export type Settings = {
  rules: Rules;
  prepBufferMinutes: number;
  holdTtlMinutes: number;
};

/** Правила расчёта и бронирования из настроек. Неутверждённые помечаются как предположения. */
export async function loadSettings(): Promise<Settings> {
  const rows = await db.pricingRule.findMany();
  const get = <T,>(key: string, fallback: T) => json<T>(rows.find((r) => r.key === key)?.value, fallback);
  const assumptions = rows.filter((r) => r.status !== 'approved').map((r) => r.title);
  const prepay = get<{ type: string | null; value?: number }>('prepayment', { type: null });
  return {
    rules: {
      graceMinutes: get('day_rounding', { graceMinutes: 0 }).graceMinutes,
      minDays: get('min_days', { days: 1 }).days,
      prepayment: prepay.type ? (prepay as Prepayment) : null,
      assumptions,
    },
    prepBufferMinutes: get('prep_buffer', { minutes: 180 }).minutes,
    holdTtlMinutes: get('hold_ttl', { minutes: 30 }).minutes,
  };
}

export async function activeTariff(vehicleId: string): Promise<(Tariff & { id: string }) | null> {
  const t = await db.tariffPlan.findFirst({ where: { vehicleId, status: 'active' }, orderBy: { validFrom: 'desc' } });
  if (!t) return null;
  return toTariff(t);
}

export function toTariff(t: { id: string; tiers: string; deposit: number; includedKmPerDay: number; overmileagePerKm: number; driverPerHour: number | null }) {
  return {
    id: t.id,
    tiers: json<Tier[]>(t.tiers, []),
    deposit: t.deposit,
    includedKmPerDay: t.includedKmPerDay,
    overmileagePerKm: t.overmileagePerKm,
    driverPerHour: t.driverPerHour,
  };
}

export async function loadExtras(): Promise<ExtraServiceDef[]> {
  const rows = await db.extraService.findMany({ where: { isActive: true } });
  return rows.map((r) => ({ code: r.code, name: r.name, pricing: r.pricing as ExtraServiceDef['pricing'], amount: r.amount }));
}
