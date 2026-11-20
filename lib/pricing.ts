// Расчёт стоимости аренды. Чистые функции, единый механизм для сайта и CRM:
// сайт получает расчёт только через сервер (/api/quote), CRM — через те же функции.

export type Tier = { minDays: number; dailyRate: number };

export type Tariff = {
  tiers: Tier[];
  deposit: number;
  includedKmPerDay: number;
  overmileagePerKm: number;
  driverPerHour: number | null;
  /** Только почасово с водителем: посуточных ставок и пробега нет. */
  driverOnly?: boolean;
};

/** Минимальный заказ с водителем, часов. */
export const DRIVER_MIN_HOURS = 4;

export type Prepayment = { type: 'none' } | { type: 'percent'; value: number } | { type: 'fixed'; value: number } | { type: 'first_day' };

export type Rules = {
  graceMinutes: number;
  prepayment: Prepayment | null; // null — правило не утверждено
  minDays: number;
  assumptions: string[]; // названия правил со статусом «предположение»
};

export type ExtraServiceDef = { code: string; name: string; pricing: 'fixed' | 'per_day' | 'per_hour'; amount: number | null };
export type ServiceSelection = { code: string; qty: number };
export type Discount = { amount: number; reason: string } | null;

export type QuoteLine = { code: string; name: string; qty: number; unit: string; unitAmount: number; amount: number };

export type Quote =
  | { ok: false; error: string }
  | {
      ok: true;
      minutes: number;
      days: number;
      /** Для почасовой аренды с водителем — оплачиваемые часы и ставка; иначе null. */
      hours: number | null;
      hourlyRate: number | null;
      tier: { minDays: number; label: string };
      dailyRate: number;
      rent: number;
      services: QuoteLine[];
      servicesTotal: number;
      discount: number;
      discountReason: string | null;
      total: number;
      payNow: number | null;
      remainder: number | null;
      deposit: number;
      includedKm: number;
      overmileagePerKm: number;
      assumptions: string[];
    };

export function tierLabel(minDays: number, tiers: Tier[]): string {
  const sorted = [...tiers].sort((a, b) => a.minDays - b.minDays);
  const idx = sorted.findIndex((t) => t.minDays === minDays);
  const next = sorted[idx + 1];
  if (minDays === 1 && next) return `1–${next.minDays - 1} суток`;
  return `от ${minDays} суток`;
}

/** Оплачиваемые сутки: блоки по 24 часа, остаток сверх льготных минут — ещё одни сутки. */
export function billableDays(minutes: number, graceMinutes: number): number {
  const full = Math.floor(minutes / 1440);
  const rest = minutes % 1440;
  const days = rest > graceMinutes ? full + 1 : full;
  return Math.max(1, days);
}

export function pickTier(days: number, tiers: Tier[]): Tier {
  const sorted = [...tiers].sort((a, b) => b.minDays - a.minDays);
  return sorted.find((t) => days >= t.minDays) ?? sorted[sorted.length - 1];
}

export function quote(input: {
  pickupAt: Date;
  returnAt: Date;
  tariff: Tariff;
  rules: Rules;
  services?: ServiceSelection[];
  extras?: ExtraServiceDef[];
  discount?: Discount;
}): Quote {
  const { pickupAt, returnAt, tariff, rules } = input;
  const minutes = Math.round((returnAt.getTime() - pickupAt.getTime()) / 60000);
  if (!(minutes > 0)) return { ok: false, error: 'Время возврата должно быть позже времени получения' };
  if (tariff.driverOnly) return hourlyQuote(input, minutes);
  if (!tariff.tiers.length) return { ok: false, error: 'Для автомобиля не задан тариф' };

  const days = billableDays(minutes, rules.graceMinutes);
  if (days < rules.minDays) return { ok: false, error: `Минимальный срок аренды — ${rules.minDays} сут.` };

  const tier = pickTier(days, tariff.tiers);
  const rent = tier.dailyRate * days;

  const lines: QuoteLine[] = [];
  for (const sel of input.services ?? []) {
    const qty = Math.max(0, Math.floor(sel.qty));
    if (!qty) continue;
    if (sel.code === 'driver') {
      if (tariff.driverPerHour == null) return { ok: false, error: 'Аренда с водителем для этого автомобиля — по согласованию с менеджером' };
      lines.push({ code: 'driver', name: 'С водителем', qty, unit: 'ч', unitAmount: tariff.driverPerHour, amount: tariff.driverPerHour * qty });
      continue;
    }
    const def = input.extras?.find((e) => e.code === sel.code);
    if (!def) return { ok: false, error: `Неизвестная услуга: ${sel.code}` };
    if (def.amount == null) return { ok: false, error: `Цена услуги «${def.name}» не утверждена — уточните у менеджера` };
    const q = def.pricing === 'per_day' ? days : def.pricing === 'fixed' ? 1 : qty;
    lines.push({ code: def.code, name: def.name, qty: q, unit: def.pricing === 'per_day' ? 'сут' : def.pricing === 'per_hour' ? 'ч' : 'шт', unitAmount: def.amount, amount: def.amount * q });
  }
  const servicesTotal = lines.reduce((s, l) => s + l.amount, 0);

  const gross = rent + servicesTotal;
  const discount = Math.min(Math.max(0, input.discount?.amount ?? 0), gross);
  const total = gross - discount;

  let payNow: number | null = null;
  const p = rules.prepayment;
  if (p) {
    if (p.type === 'none') payNow = 0;
    else if (p.type === 'percent') payNow = Math.round((total * p.value) / 100);
    else if (p.type === 'fixed') payNow = Math.min(total, p.value);
    else if (p.type === 'first_day') payNow = Math.min(total, tier.dailyRate);
  }

  return {
    ok: true,
    minutes,
    days,
    hours: null,
    hourlyRate: null,
    tier: { minDays: tier.minDays, label: tierLabel(tier.minDays, tariff.tiers) },
    dailyRate: tier.dailyRate,
    rent,
    services: lines,
    servicesTotal,
    discount,
    discountReason: discount ? input.discount?.reason ?? null : null,
    total,
    payNow,
    remainder: payNow == null ? null : total - payNow,
    deposit: tariff.deposit,
    includedKm: tariff.includedKmPerDay * days,
    overmileagePerKm: tariff.overmileagePerKm,
    assumptions: rules.assumptions,
  };
}

/** Почасовая аренда с водителем: часы округляются вверх, минимум DRIVER_MIN_HOURS. Пробег и сутки не считаются. */
function hourlyQuote(input: Parameters<typeof quote>[0], minutes: number): Quote {
  const { tariff, rules } = input;
  const rate = tariff.driverPerHour;
  if (!rate) return { ok: false, error: 'Для автомобиля не задана ставка с водителем' };
  const hours = Math.ceil(minutes / 60);
  if (hours < DRIVER_MIN_HOURS) return { ok: false, error: `Аренда с водителем — от ${DRIVER_MIN_HOURS} часов` };
  const rent = rate * hours;

  const lines: QuoteLine[] = [];
  for (const sel of input.services ?? []) {
    const qty = Math.max(0, Math.floor(sel.qty));
    if (!qty || sel.code === 'driver') continue; // водитель уже в цене
    const def = input.extras?.find((e) => e.code === sel.code);
    if (!def) return { ok: false, error: `Неизвестная услуга: ${sel.code}` };
    if (def.amount == null) return { ok: false, error: `Цена услуги «${def.name}» не утверждена — уточните у менеджера` };
    const q = def.pricing === 'per_hour' ? hours : def.pricing === 'fixed' || def.pricing === 'per_day' ? 1 : qty;
    lines.push({ code: def.code, name: def.name, qty: q, unit: def.pricing === 'per_hour' ? 'ч' : 'шт', unitAmount: def.amount, amount: def.amount * q });
  }
  const servicesTotal = lines.reduce((s, l) => s + l.amount, 0);
  const gross = rent + servicesTotal;
  const discount = Math.min(Math.max(0, input.discount?.amount ?? 0), gross);
  const total = gross - discount;

  let payNow: number | null = null;
  const p = rules.prepayment;
  if (p) {
    if (p.type === 'none') payNow = 0;
    else if (p.type === 'percent') payNow = Math.round((total * p.value) / 100);
    else if (p.type === 'fixed') payNow = Math.min(total, p.value);
    else if (p.type === 'first_day') payNow = Math.min(total, rate * DRIVER_MIN_HOURS);
  }

  return {
    ok: true,
    minutes,
    days: 0,
    hours,
    hourlyRate: rate,
    tier: { minDays: 0, label: `с водителем, от ${DRIVER_MIN_HOURS} ч` },
    dailyRate: 0,
    rent,
    services: lines,
    servicesTotal,
    discount,
    discountReason: discount ? input.discount?.reason ?? null : null,
    total,
    payNow,
    remainder: payNow == null ? null : total - payNow,
    deposit: tariff.deposit,
    includedKm: 0,
    overmileagePerKm: 0,
    assumptions: rules.assumptions,
  };
}

/** «2026-11-20T10:00» по Москве + N часов → в том же формате (для почасовой аренды в формах). */
export function addHoursLocal(s: string, h: number): string {
  const d = new Date(new Date(s + ':00+03:00').getTime() + (h + 3) * 3600000);
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 16);
}

/** Минимальная ставка — для «от N ₽ / сутки при аренде от M суток». */
export function fromPrice(tiers: Tier[]): { dailyRate: number; minDays: number } | null {
  if (!tiers.length) return null;
  const t = [...tiers].sort((a, b) => a.dailyRate - b.dailyRate)[0];
  return { dailyRate: t.dailyRate, minDays: t.minDays };
}
