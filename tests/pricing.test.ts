import { describe, expect, it } from 'vitest';
import { billableDays, quote, type Rules, type Tariff } from '@/lib/pricing';

const tariff: Tariff = {
  tiers: [
    { minDays: 1, dailyRate: 4000000 },
    { minDays: 3, dailyRate: 3800000 },
    { minDays: 7, dailyRate: 3600000 },
    { minDays: 14, dailyRate: 3200000 },
    { minDays: 30, dailyRate: 2800000 },
  ],
  deposit: 5000000,
  includedKmPerDay: 250,
  overmileagePerKm: 15000,
  driverPerHour: 700000,
};
const rules: Rules = { graceMinutes: 0, prepayment: null, minDays: 1, assumptions: [] };
const at = (d: number, h = 10) => new Date(Date.UTC(2026, 10, d, h - 3));

describe('расчёт стоимости', () => {
  it('ступени тарифа на границах 2/3, 6/7, 13/14, 29/30 суток', () => {
    const rate = (days: number) => {
      const q = quote({ pickupAt: at(1), returnAt: at(1 + days), tariff, rules });
      if (!q.ok) throw new Error(q.error);
      return q.dailyRate;
    };
    expect([rate(1), rate(2), rate(3), rate(6), rate(7), rate(13), rate(14), rate(29), rate(30)]).toEqual([4000000, 4000000, 3800000, 3800000, 3600000, 3600000, 3200000, 3200000, 2800000]);
  });

  it('M5 на 3 суток = 114 000 ₽, залог не входит в итог', () => {
    const q = quote({ pickupAt: at(10), returnAt: at(13), tariff, rules });
    expect(q.ok && q.total).toBe(11400000);
    expect(q.ok && q.deposit).toBe(5000000);
    expect(q.ok && q.includedKm).toBe(750);
  });

  it('округление суток: лишний час — ещё сутки, льготные минуты — нет', () => {
    expect(billableDays(3 * 1440 + 60, 0)).toBe(4);
    expect(billableDays(3 * 1440 + 60, 120)).toBe(3);
    expect(billableDays(30, 0)).toBe(1);
  });

  it('водитель и скидка, предоплата не утверждена → к оплате сейчас неизвестно', () => {
    const q = quote({ pickupAt: at(10), returnAt: at(13), tariff, rules, services: [{ code: 'driver', qty: 4 }], discount: { amount: 400000, reason: 'постоянный клиент' } });
    if (!q.ok) throw new Error(q.error);
    expect(q.servicesTotal).toBe(2800000);
    expect(q.total).toBe(11400000 + 2800000 - 400000);
    expect(q.payNow).toBeNull();
  });

  it('предоплата процентом', () => {
    const q = quote({ pickupAt: at(10), returnAt: at(13), tariff, rules: { ...rules, prepayment: { type: 'percent', value: 30 } } });
    expect(q.ok && q.payNow).toBe(3420000);
    expect(q.ok && q.remainder).toBe(7980000);
  });

  it('ошибки: возврат раньше получения, водитель недоступен, цена услуги не утверждена', () => {
    expect(quote({ pickupAt: at(13), returnAt: at(10), tariff, rules }).ok).toBe(false);
    expect(quote({ pickupAt: at(10), returnAt: at(13), tariff: { ...tariff, driverPerHour: null }, rules, services: [{ code: 'driver', qty: 2 }] }).ok).toBe(false);
    expect(quote({ pickupAt: at(10), returnAt: at(13), tariff, rules, services: [{ code: 'extra_driver', qty: 1 }], extras: [{ code: 'extra_driver', name: 'Доп. водитель', pricing: 'fixed', amount: null }] }).ok).toBe(false);
  });
});
