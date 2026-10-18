// Проверка клиента по опубликованным требованиям к арендатору (условия аренды на сайте).
export const MIN_AGE_YEARS = 20;
export const MIN_EXPERIENCE_YEARS = 1.5;

function yearsBetween(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / (365.2425 * 86400000);
}

export function eligibility(c: { birthDate: Date | null; drivingSince: Date | null; isForeign: boolean }, at = new Date()) {
  const age = c.birthDate ? Math.floor(yearsBetween(c.birthDate, at)) : null;
  const exp = c.drivingSince ? yearsBetween(c.drivingSince, at) : null;
  const issues: string[] = [];
  if (age != null && age < MIN_AGE_YEARS) issues.push(`возраст ${age} — меньше ${MIN_AGE_YEARS} лет`);
  if (exp != null && exp < MIN_EXPERIENCE_YEARS) issues.push(`стаж ${exp.toFixed(1).replace('.', ',')} — меньше ${String(MIN_EXPERIENCE_YEARS).replace('.', ',')} лет`);
  const unknown: string[] = [];
  if (age == null) unknown.push('дата рождения');
  if (exp == null) unknown.push('начало стажа');
  return { age, exp, issues, unknown, foreign: c.isForeign };
}

export function experienceText(exp: number | null) {
  if (exp == null) return '—';
  const y = Math.floor(exp);
  const m = Math.floor((exp - y) * 12);
  return `${y} г.${m ? ` ${m} мес.` : ''}`;
}
