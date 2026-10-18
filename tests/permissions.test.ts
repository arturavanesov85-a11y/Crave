import { describe, expect, it } from 'vitest';
import { can, directionsOf, type Perm } from '@/lib/permissions';

const u = (role: string) => ({ id: 'x', email: 'x', fullName: 'x', role });

describe('права ролей', () => {
  const cases: [string, Perm, boolean][] = [
    ['owner', 'users.manage', true],
    ['rental_manager', 'rental.write', true],
    ['rental_manager', 'discount.apply', false],
    ['rental_manager', 'refund.issue', false],
    ['rental_manager', 'deposit.withhold.approve', false],
    ['rental_manager', 'finance.view', false],
    ['rental_head', 'deposit.withhold.approve', true],
    ['handover', 'rental.read', false],
    ['handover', 'rental.read.assigned', true],
    ['handover', 'rental.inspect', true],
    ['finance', 'refund.issue', true],
    ['finance', 'customers.write', false],
    ['rental_manager', 'customers.write', true],
    ['handover', 'customers.write', false],
    ['sales_staff', 'customers.write', true],
    ['finance', 'rental.write', false],
    ['sales_staff', 'leads.rental', false],
    ['sales_staff', 'leads.sales', true],
    ['service_staff', 'rental.read', false],
    ['tech_admin', 'customer.docs.view', false],
    ['tech_admin', 'customers.read', false],
    ['tech_admin', 'users.manage', true],
  ];
  it.each(cases)('%s: %s → %s', (role, perm, expected) => {
    expect(can(u(role), perm)).toBe(expected);
  });

  it('направления: сотрудник автосалона не видит прокат и сервис', () => {
    expect(directionsOf(u('sales_staff'))).toEqual(['sales']);
    expect(directionsOf(u('tech_admin'))).toEqual([]);
  });

  it('неизвестная роль не получает ничего', () => {
    expect(can(u('hacker'), 'rental.read')).toBe(false);
  });
});
