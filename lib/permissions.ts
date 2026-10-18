// Роли и разрешения. Проверяются на сервере в каждом действии и при выдаче файлов.

export type Direction = 'rental' | 'sales' | 'service';

export const PERMS = [
  'rental.read', // все заказы проката
  'rental.read.assigned', // только назначенные выдачи/возвраты
  'rental.write', // заявки, брони, изменение заказов
  'rental.inspect', // осмотры при выдаче и возврате
  'leads.rental',
  'leads.sales',
  'leads.service',
  'customers.read',
  'customers.write', // редактирование карточки клиента своего направления
  'customer.docs.view',
  'fleet.read',
  'fleet.write',
  'vehicle.sensitive', // VIN и госномер
  'tariff.edit',
  'discount.apply',
  'payment.accept',
  'refund.issue',
  'deposit.withhold.request',
  'deposit.withhold.approve',
  'ledger.reverse',
  'finance.view',
  'finance.expenses',
  'finance.result',
  'export.run',
  'users.manage',
  'settings.manage',
] as const;
export type Perm = (typeof PERMS)[number];

const ROLES: Record<string, { label: string; directions: Direction[]; perms: Perm[] }> = {
  owner: { label: 'Владелец', directions: ['rental', 'sales', 'service'], perms: [...PERMS] },
  rental_head: {
    label: 'Руководитель проката',
    directions: ['rental'],
    perms: ['rental.read', 'rental.write', 'rental.inspect', 'leads.rental', 'customers.read', 'customers.write', 'customer.docs.view', 'fleet.read', 'fleet.write', 'vehicle.sensitive', 'tariff.edit', 'discount.apply', 'payment.accept', 'refund.issue', 'deposit.withhold.request', 'deposit.withhold.approve', 'ledger.reverse', 'finance.view', 'export.run'],
  },
  rental_manager: {
    label: 'Менеджер проката',
    directions: ['rental'],
    perms: ['rental.read', 'rental.write', 'rental.inspect', 'leads.rental', 'customers.read', 'customers.write', 'fleet.read', 'payment.accept', 'deposit.withhold.request'],
  },
  handover: {
    label: 'Сотрудник выдачи',
    directions: ['rental'],
    perms: ['rental.read.assigned', 'rental.inspect', 'fleet.read', 'deposit.withhold.request'],
  },
  finance: {
    label: 'Финансист',
    directions: ['rental', 'sales', 'service'],
    perms: ['rental.read', 'customers.read', 'fleet.read', 'payment.accept', 'refund.issue', 'ledger.reverse', 'finance.view', 'finance.expenses', 'finance.result', 'export.run'],
  },
  sales_staff: { label: 'Сотрудник автосалона', directions: ['sales'], perms: ['leads.sales', 'customers.read', 'customers.write'] },
  service_staff: { label: 'Сотрудник сервиса', directions: ['service'], perms: ['leads.service', 'customers.read', 'customers.write'] },
  tech_admin: { label: 'Технический администратор', directions: [], perms: ['users.manage', 'settings.manage', 'fleet.read'] },
};

export const ROLE_CODES = Object.keys(ROLES);

export type SessionUser = { id: string; email: string; fullName: string; role: string };

export function roleLabel(role: string) {
  return ROLES[role]?.label ?? role;
}

export function can(user: SessionUser | null | undefined, perm: Perm): boolean {
  if (!user) return false;
  return ROLES[user.role]?.perms.includes(perm) ?? false;
}

export function directionsOf(user: SessionUser): Direction[] {
  return ROLES[user.role]?.directions ?? [];
}

export const DIRECTION_LABEL: Record<Direction, string> = { rental: 'Прокат', sales: 'Автосалон', service: 'Сервис' };

export class Forbidden extends Error {
  constructor(msg = 'Недостаточно прав') {
    super(msg);
  }
}
