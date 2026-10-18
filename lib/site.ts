// Адреса направлений и контакты. Адреса задаются переменными окружения,
// чтобы позже вынести сайты на отдельные домены без изменения кода.

export const DIRECTION_URLS = {
  rental: process.env.NEXT_PUBLIC_URL_RENTAL || '/',
  sales: process.env.NEXT_PUBLIC_URL_AUTO || '/auto',
  service: process.env.NEXT_PUBLIC_URL_SERVICE || '/service',
};

export const CONTACTS = {
  phone: '+7 (910) 421-02-22',
  phoneHref: 'tel:+79104210222',
  telegram: 'https://t.me/crave_rental',
  address: 'Москва, Коровинское шоссе, 10',
  hours: 'Круглосуточно, без выходных',
};

export const BODY_LABEL: Record<string, string> = { sedan: 'Седан', suv: 'Внедорожник', coupe: 'Купе', pickup: 'Пикап' };

export const COND_LABEL: Record<string, string> = { ready: 'Готов', preparing: 'Подготовка', maintenance: 'Обслуживание', unavailable: 'Недоступен' };
