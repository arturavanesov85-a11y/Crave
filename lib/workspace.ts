// Рабочие зоны продаж и сервиса: этапы заявок и правила переходов.
import type { Perm } from './permissions';

export type WsDirection = 'sales' | 'service';
export type Stage = { code: string; label: string; closed?: 'won' | 'lost' };

export const STAGES: Record<WsDirection, Stage[]> = {
  sales: [
    { code: 'new', label: 'Новая' },
    { code: 'contacted', label: 'Связались' },
    { code: 'offer', label: 'Подбор и предложение' },
    { code: 'negotiation', label: 'Переговоры' },
    { code: 'deal', label: 'Сделка', closed: 'won' },
    { code: 'lost', label: 'Отказ', closed: 'lost' },
  ],
  service: [
    { code: 'new', label: 'Новая' },
    { code: 'contacted', label: 'Связались' },
    { code: 'booked', label: 'Записан' },
    { code: 'in_work', label: 'В работе' },
    { code: 'done', label: 'Выполнено', closed: 'won' },
    { code: 'lost', label: 'Отказ', closed: 'lost' },
  ],
};

export const WS: Record<WsDirection, { title: string; path: string; perm: Perm; amountLabel: string }> = {
  sales: { title: 'Продажи', path: '/crm/sales', perm: 'leads.sales', amountLabel: 'Сумма сделки' },
  service: { title: 'Сервис', path: '/crm/service-desk', perm: 'leads.service', amountLabel: 'Оценка работ' },
};

export function stageOf(direction: WsDirection, code: string): Stage {
  return STAGES[direction].find((s) => s.code === code) ?? STAGES[direction][0];
}

/** Старый статус заявки синхронизируется с этапом (для общих отчётов и счётчиков). */
export function statusForStage(direction: WsDirection, code: string) {
  const s = stageOf(direction, code);
  if (s.closed === 'won') return 'converted';
  if (s.closed === 'lost') return 'rejected';
  return code === 'new' ? 'new' : 'in_progress';
}

export const LEAD_KIND: Record<string, string> = {
  booking_request: 'Бронирование',
  callback: 'Обратный звонок',
  purchase: 'Покупка',
  custom_order: 'Авто под заказ',
  service_request: 'Запись в сервис',
  manual: 'Создана в CRM',
};
