// Адреса направлений и контакты. Адреса задаются переменными окружения,
// чтобы позже вынести сайты на отдельные домены без изменения кода.

export const DIRECTION_URLS = {
  rental: process.env.NEXT_PUBLIC_URL_RENTAL || '/',
  sales: process.env.NEXT_PUBLIC_URL_AUTO || '/auto',
  service: process.env.NEXT_PUBLIC_URL_SERVICE || '/service',
};

export const CONTACTS = {
  phone: '+7 495 141 02 20',
  phoneHref: 'tel:+74951410220',
  telegram: 'https://t.me/crave_rental',
  // Бот для клиентов проката: подтверждение брони, напоминание о выдаче и акты с фото.
  clientBot: 'https://t.me/Crave_rentalbot',
  address: 'Москва, Ярославское ш., 2В, стр. 4',
  hours: 'Круглосуточно, без выходных',
};

// Реквизиты владельца сайтов — в подвале всех направлений.
export const COMPANY = {
  name: 'ООО «КРЕЙВ»',
  fullName: 'Общество с ограниченной ответственностью «КРЕЙВ»',
  inn: '7743494031',
  kpp: '774301001',
};

export const BODY_LABEL: Record<string, string> = { sedan: 'Седан', suv: 'Внедорожник', coupe: 'Купе', pickup: 'Пикап', minivan: 'Минивен', wagon: 'Универсал' };
// Для фильтров на сайте: «Седаны», «Минивены»…
export const BODY_PLURAL: Record<string, string> = { sedan: 'Седаны', suv: 'Внедорожники', coupe: 'Купе', pickup: 'Пикапы', minivan: 'Минивены', wagon: 'Универсалы' };

export const COND_LABEL: Record<string, string> = { ready: 'Готов', preparing: 'Подготовка', maintenance: 'Обслуживание', unavailable: 'Недоступен' };
