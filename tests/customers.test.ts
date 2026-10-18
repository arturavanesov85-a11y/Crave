import { describe, expect, it } from 'vitest';
import { eligibility } from '@/lib/customers';

const at = new Date('2026-10-18T12:00:00Z');
const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe('требования к арендатору', () => {
  it('подходит: 25 лет, стаж 3 года', () => {
    expect(eligibility({ birthDate: d('2001-05-01'), drivingSince: d('2023-09-01'), isForeign: false }, at).issues).toEqual([]);
  });
  it('моложе 20 лет и стаж меньше 1,5 лет', () => {
    const r = eligibility({ birthDate: d('2007-01-01'), drivingSince: d('2025-10-01'), isForeign: false }, at);
    expect(r.age).toBe(19);
    expect(r.issues).toHaveLength(2);
  });
  it('граница: ровно 20 лет — подходит', () => {
    expect(eligibility({ birthDate: d('2006-10-18'), drivingSince: null, isForeign: false }, at).issues).toEqual([]);
  });
  it('незаполненные данные перечисляются', () => {
    expect(eligibility({ birthDate: null, drivingSince: null, isForeign: false }, at).unknown).toEqual(['дата рождения', 'начало стажа']);
  });
});
