// Все суммы хранятся в копейках (целые числа).

const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

/** 11400000 → «114 000 ₽» */
export function rub(kopecks: number | null | undefined): string {
  if (kopecks == null) return '—';
  return `${fmt.format(kopecks / 100)} ₽`;
}

/** «114 000,50» → 11400050. Возвращает null для некорректного ввода. */
export function parseRub(input: unknown): number | null {
  if (input == null) return null;
  const s = String(input).replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export const RUB = 100;
