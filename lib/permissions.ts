// Роли и разрешения. Проверяются на сервере в каждом действии и при выдаче файлов.
// Роль — шаблон прав. Владелец может задать сотруднику индивидуальный набор прав и направлений.

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
  'sales.catalog', // автомобили в продаже и тексты сайта автосалона
  'service.site', // услуги и тексты сайта сервиса
  'users.manage', // сотрудники и их доступы (только владелец)
  'settings.manage',
] as const;
export type Perm = (typeof PERMS)[number];

/** Подписи прав для экрана «Сотрудники», по разделам. */
export const PERM_GROUPS: { title: string; perms: [Perm, string][] }[] = [
  { title: 'Прокат', perms: [['rental.read', 'Все заказы, календарь, «Сегодня»'], ['rental.read.assigned', 'Только назначенные выдачи и возвраты'], ['rental.write', 'Создание и изменение заказов, брони'], ['rental.inspect', 'Осмотры при выдаче и возврате'], ['leads.rental', 'Заявки проката']] },
  { title: 'Продажи и сервис', perms: [['leads.sales', 'Рабочая зона «Продажи»'], ['leads.service', 'Рабочая зона «Сервис»'], ['sales.catalog', 'Авто в продаже и сайт автосалона'], ['service.site', 'Сайт сервиса: услуги и тексты']] },
  { title: 'Клиенты', perms: [['customers.read', 'Просмотр клиентов'], ['customers.write', 'Редактирование клиентов'], ['customer.docs.view', 'Документы клиентов']] },
  { title: 'Автопарк', perms: [['fleet.read', 'Просмотр автомобилей'], ['fleet.write', 'Изменение автомобилей, блокировки, ТО'], ['vehicle.sensitive', 'VIN и госномер'], ['tariff.edit', 'Изменение тарифов']] },
  { title: 'Деньги', perms: [['payment.accept', 'Приём оплат и залогов'], ['refund.issue', 'Возвраты денег и залогов'], ['discount.apply', 'Скидки'], ['deposit.withhold.request', 'Запрос удержания из залога'], ['deposit.withhold.approve', 'Подтверждение удержаний'], ['ledger.reverse', 'Возврат (отмена) операций']] },
  { title: 'Финансы', perms: [['finance.view', 'Раздел «Финансы»'], ['finance.expenses', 'Расходы'], ['finance.result', 'Результат по автомобилям'], ['export.run', 'Экспорт']] },
  { title: 'Администрирование', perms: [['settings.manage', 'Правила расчёта'], ['users.manage', 'Сотрудники и доступы']] },
];

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
  sales_staff: { label: 'Сотрудник автосалона', directions: ['sales'], perms: ['leads.sales', 'customers.read', 'customers.write', 'sales.catalog'] },
  service_staff: { label: 'Сотрудник сервиса', directions: ['service'], perms: ['leads.service', 'customers.read', 'customers.write', 'service.site'] },
  tech_admin: { label: 'Технический администратор', directions: [], perms: ['settings.manage', 'fleet.read'] },
};

export const ROLE_CODES = Object.keys(ROLES);
export const DIRECTIONS: Direction[] = ['rental', 'sales', 'service'];

/** Права и направления пользователя. Если заданы индивидуально — берутся они, иначе — шаблон роли. */
export type SessionUser = { id: string; email: string; fullName: string; role: string; perms?: Perm[] | null; directions?: Direction[] | null };

export function roleLabel(role: string) {
  return ROLES[role]?.label ?? role;
}

export function roleDefaults(role: string): { perms: Perm[]; directions: Direction[] } {
  return { perms: [...(ROLES[role]?.perms ?? [])], directions: [...(ROLES[role]?.directions ?? [])] };
}

export function permsOf(user: SessionUser): Perm[] {
  // Владелец всегда имеет все права — его нельзя случайно лишить доступа.
  if (user.role === 'owner') return [...PERMS];
  return user.perms ?? ROLES[user.role]?.perms ?? [];
}

export function can(user: SessionUser | null | undefined, perm: Perm): boolean {
  if (!user) return false;
  return permsOf(user).includes(perm);
}

export function directionsOf(user: SessionUser): Direction[] {
  if (user.role === 'owner') return [...DIRECTIONS];
  return user.directions ?? ROLES[user.role]?.directions ?? [];
}

/** Первая доступная страница CRM для сотрудника. */
export function homePath(user: SessionUser): string {
  if (can(user, 'rental.read') || can(user, 'rental.read.assigned')) return '/crm';
  if (can(user, 'leads.sales')) return '/crm/sales';
  if (can(user, 'leads.service')) return '/crm/service-desk';
  if (can(user, 'leads.rental')) return '/crm/leads';
  if (can(user, 'sales.catalog')) return '/crm/sales-cars';
  if (can(user, 'service.site')) return '/crm/service-site';
  if (can(user, 'fleet.read')) return '/crm/vehicles';
  if (can(user, 'finance.view')) return '/crm/finance';
  return '/crm/settings';
}

export const DIRECTION_LABEL: Record<Direction, string> = { rental: 'Прокат', sales: 'Автосалон', service: 'Сервис' };

export class Forbidden extends Error {
  constructor(msg = 'Недостаточно прав') {
    super(msg);
  }
}
