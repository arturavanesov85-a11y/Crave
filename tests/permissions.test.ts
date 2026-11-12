import { describe, expect, it } from 'vitest';
import { can, directionsOf, homePath, type Perm } from '@/lib/permissions';

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
    ['sales_staff', 'sales.catalog', true],
    ['rental_manager', 'sales.catalog', false],
    ['service_staff', 'sales.catalog', false],
    ['finance', 'rental.write', false],
    ['sales_staff', 'leads.rental', false],
    ['sales_staff', 'leads.sales', true],
    ['service_staff', 'rental.read', false],
    ['tech_admin', 'customer.docs.view', false],
    ['tech_admin', 'customers.read', false],
    ['tech_admin', 'users.manage', false],
    ['service_staff', 'service.site', true],
    ['sales_staff', 'service.site', false],
    ['sales_staff', 'tg.app', true],
    ['rental_manager', 'tg.app', false],
  ];
  it.each(cases)('%s: %s → %s', (role, perm, expected) => {
    expect(can(u(role), perm)).toBe(expected);
  });

  it('направления: сотрудник автосалона не видит прокат и сервис', () => {
    expect(directionsOf(u('sales_staff'))).toEqual(['sales']);
    expect(directionsOf(u('tech_admin'))).toEqual([]);
  });

  it('индивидуальные права заменяют права роли, владелец всегда с полным доступом', () => {
    const m = { ...u('rental_manager'), perms: ['rental.read' as const], directions: ['rental' as const, 'sales' as const] };
    expect(can(m, 'rental.read')).toBe(true);
    expect(can(m, 'rental.write')).toBe(false);
    expect(directionsOf(m)).toEqual(['rental', 'sales']);
    const o = { ...u('owner'), perms: [] };
    expect(can(o, 'users.manage')).toBe(true);
  });

  it('первая страница зависит от прав', () => {
    expect(homePath(u('rental_manager'))).toBe('/crm');
    expect(homePath(u('sales_staff'))).toBe('/crm/sales');
    expect(homePath(u('service_staff'))).toBe('/crm/service-desk');
  });

  it('неизвестная роль не получает ничего', () => {
    expect(can(u('hacker'), 'rental.read')).toBe(false);
  });
});
