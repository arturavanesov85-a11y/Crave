// Редактируемые из CRM тексты сайтов. Если значение не задано — используется текст по умолчанию.
import { db } from './db';

export const AUTO_FIELDS = [
  { key: 'auto.heroEyebrow', label: 'Надзаголовок первого экрана', default: 'CRAVE Auto · Москва' },
  { key: 'auto.heroTitle', label: 'Заголовок первого экрана', default: 'Покупка автомобиля' },
  { key: 'auto.heroText', label: 'Текст первого экрана', default: 'Автомобили в наличии и поставка под заказ. Расскажите, что ищете, — менеджер свяжется с вами.', multiline: true },
  { key: 'auto.stockTitle', label: 'Заголовок раздела «В наличии»', default: 'Автомобили в наличии' },
  { key: 'auto.stockEmpty', label: 'Текст, когда машин в наличии нет', default: 'Сейчас нет автомобилей в наличии. Оставьте заявку — подберём под заказ.', multiline: true },
  { key: 'auto.orderTitle', label: 'Заголовок раздела «Под заказ»', default: 'Авто под заказ' },
  { key: 'auto.orderText', label: 'Текст раздела «Под заказ»', default: 'Подберём и привезём автомобиль под ваши требования. Опишите марку, модель, комплектацию и бюджет — менеджер рассчитает варианты и сроки.', multiline: true },
  { key: 'auto.phone', label: 'Телефон автосалона', default: '' },
  { key: 'auto.address', label: 'Адрес автосалона', default: '' },
  { key: 'auto.hours', label: 'Часы работы', default: '' },
] as const;

export type AutoKey = (typeof AUTO_FIELDS)[number]['key'];

export async function autoTexts(): Promise<Record<AutoKey, string>> {
  const rows = await db.siteSetting.findMany({ where: { key: { startsWith: 'auto.' } } });
  const out = {} as Record<AutoKey, string>;
  for (const f of AUTO_FIELDS) out[f.key] = rows.find((r) => r.key === f.key)?.value ?? f.default;
  return out;
}
