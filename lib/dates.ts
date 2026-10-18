// Часовой пояс компании. Москва — UTC+3 без перехода на летнее время.
export const TZ = 'Europe/Moscow';
const OFFSET_MIN = 180;

/** '2026-10-23T10:00' (время Москвы) → Date */
export function parseLocal(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const d = new Date(value.slice(0, 16) + ':00+03:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → '2026-10-23T10:00' во времени Москвы (для input type=datetime-local) */
export function toLocalInput(d: Date): string {
  const m = new Date(d.getTime() + OFFSET_MIN * 60000);
  return m.toISOString().slice(0, 16);
}

/** Начало суток по Москве */
export function startOfLocalDay(d: Date): Date {
  return parseLocal(toLocalInput(d).slice(0, 10) + 'T00:00')!;
}

export function addHours(d: Date, h: number): Date {
  return new Date(d.getTime() + h * 3600000);
}

export function addMinutes(d: Date, m: number): Date {
  return new Date(d.getTime() + m * 60000);
}

const dtf = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const df = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
const tf = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const wdf = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });

export const fmtDateTime = (d: Date | null | undefined) => (d ? dtf.format(d) : '—');
export const fmtDate = (d: Date | null | undefined) => (d ? df.format(d) : '—');
export const fmtTime = (d: Date) => tf.format(d);
export const fmtWeekday = (d: Date) => wdf.format(d);

export function daysWord(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  return `${n} ${m10 === 1 && m100 !== 11 ? 'сутки' : 'суток'}`;
}
