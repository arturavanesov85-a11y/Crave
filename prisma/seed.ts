// Начальные данные. Запускается при каждом `npm run dev`, но заполняет базу только один раз.
// Тестовые учётные записи — ниже в USERS, общий пароль — SEED_PASSWORD (по умолчанию см. README).

import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';
import tariffs from '../docs/data/current-site-tariffs.json' with { type: 'json' };

const db = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD || 'crave-test';

const USERS = [
  { email: 'owner@crave.test', fullName: 'Владелец (тест)', role: 'owner' },
  { email: 'head@crave.test', fullName: 'Руководитель проката (тест)', role: 'rental_head' },
  { email: 'manager@crave.test', fullName: 'Менеджер проката (тест)', role: 'rental_manager' },
  { email: 'handover@crave.test', fullName: 'Сотрудник выдачи (тест)', role: 'handover' },
  { email: 'finance@crave.test', fullName: 'Финансист (тест)', role: 'finance' },
  { email: 'sales@crave.test', fullName: 'Сотрудник автосалона (тест)', role: 'sales_staff' },
  { email: 'service@crave.test', fullName: 'Сотрудник сервиса (тест)', role: 'service_staff' },
  { email: 'admin@crave.test', fullName: 'Тех. администратор (тест)', role: 'tech_admin' },
];

// Характеристики — с карточек текущего сайта (docs/00-audit.md).
const SPECS: Record<string, { make: string; model: string; year: number; bodyType: string; powerHp: number; accel: string; fuel: string; seats: number | null; ext: string; int: string; description: string; equipment: string[] }> = {
  'bmw-m5-f90-competition': { make: 'BMW', model: 'M5 F90 Competition Stage 1', year: 2020, bodyType: 'sedan', powerHp: 750, accel: '2,8', fuel: 'бензин', seats: 5, ext: 'тёмно-серый', int: 'белый', description: 'Самый быстрый седан BMW в версии Stage 1: мощность после калибровки — 750 л.с.', equipment: ['Чип-тюнинг Stage 1', 'Титановый выхлоп Deikin', 'Обвес в стиле M5 CS', 'Звёздное небо', 'Harman Kardon', 'Проекция на лобовое стекло', 'Люк', 'Доводчики дверей', 'Apple CarPlay'] },
  'mercedes-amg-gt63-s': { make: 'Mercedes-AMG', model: 'GT63 S 4-door', year: 2020, bodyType: 'coupe', powerHp: 740, accel: '2,8', fuel: 'бензин', seats: 4, ext: 'красный', int: 'красный', description: 'Четырёхдверное купе с битурбированным V8 4.0 и карбоно-керамическими тормозами.', equipment: ['Чип-тюнинг Stage 1', 'Выхлоп Capristo', 'Карбоно-керамические тормоза', 'Сиденья-ковши AMG с подогревом и вентиляцией', 'Burmester 3D', 'Кованые диски R21', 'Подруливающая задняя ось', 'Проекция на лобовое стекло'] },
  'porsche-cayenne-s-iii': { make: 'Porsche', model: 'Cayenne S III Stage 1', year: 2020, bodyType: 'suv', powerHp: 530, accel: '4,4', fuel: 'бензин', seats: 5, ext: 'серый металлик', int: 'чёрный', description: 'Cayenne третьего поколения с программным пакетом Stage 1.', equipment: ['Чип-тюнинг Stage 1', 'Спортивный выхлоп', 'Усиленная тормозная система', 'Лазерные фары', 'Люк', 'Apple CarPlay'] },
  'mercedes-benz-g63-first-edition': { make: 'Mercedes-Benz', model: 'G63 First Edition', year: 2018, bodyType: 'suv', powerHp: 750, accel: '3,9', fuel: 'бензин', seats: 5, ext: 'матовый чёрный', int: 'чёрный', description: 'Специальная версия Edition 1 с битурбо V8 и тремя блокируемыми дифференциалами.', equipment: ['Чип-тюнинг Stage 1', 'Обвес TopCar Design (частичный)', 'Полная защита бронеплёнкой', 'Выхлоп на спорткатах', 'Burmester Surround', 'Widescreen Cockpit', 'Люк', 'Проекция на лобовое стекло'] },
  'bmw-540i': { make: 'BMW', model: '540i', year: 2020, bodyType: 'sedan', powerHp: 340, accel: '4,8', fuel: 'бензин', seats: 5, ext: 'тёмно-синий', int: 'ярко-коричневый', description: 'Пятая серия с рядной «шестёркой» B58 3.0.', equipment: ['M Performance элементы экстерьера', 'Спортивный выхлоп', 'Карбоновый руль с алькантарой', 'Цифровая приборная панель', 'Harman Kardon', 'Люк', 'Проекция на лобовое стекло', 'Apple CarPlay'] },
  'bmw-m340i-xdrive-lci': { make: 'BMW', model: 'M340i xDrive LCI', year: 2024, bodyType: 'sedan', powerHp: 387, accel: '4,1', fuel: 'бензин', seats: 5, ext: 'зелёный металлик', int: 'ярко-коричневый', description: 'Седан бизнес-класса с полным приводом xDrive и рядной «шестёркой» B58.', equipment: ['M-пакет', 'Адаптивная M-подвеска', 'Дифференциал M Sport', 'Фары Laserlight', 'Тормоза Brembo', 'BMW Curved Display', 'Harman Kardon', 'Люк', 'Apple CarPlay'] },
  'dodge-ram-trx': { make: 'Dodge', model: 'RAM TRX', year: 2022, bodyType: 'pickup', powerHp: 900, accel: '3,5', fuel: 'бензин', seats: 5, ext: 'синий', int: 'чёрный', description: 'Пикап с компрессорным Hellcat V8 6.2.', equipment: ['Двигатель 6.2 supercharged, прошивка до 900 л.с.', 'Спортивный выхлоп', 'Launch control', 'Панорамная крыша', 'Apple CarPlay'] },
  'toyota-land-cruiser-300-70th-anniversary': { make: 'Toyota', model: 'Land Cruiser 300 70th Anniversary', year: 2022, bodyType: 'suv', powerHp: 360, accel: '5,9', fuel: 'дизель', seats: 5, ext: 'чёрный', int: 'чёрный', description: 'Лимитированная версия к 70-летию Land Cruiser.', equipment: ['Прошивка Stage 1 (~360 л.с.)', 'Двойные стёкла', 'Обогрев и вентиляция сидений', 'Холодильник в подлокотнике', 'Круиз-контроль', 'Люк', 'Apple CarPlay'] },
};

const RULES = [
  { key: 'day_rounding', title: 'Округление суток', value: { graceMinutes: 0 } },
  { key: 'tier_mode', title: 'Весь срок по ставке ступени', value: { mode: 'whole' } },
  { key: 'prep_buffer', title: 'Подготовка между заказами', value: { minutes: 180 } },
  { key: 'hold_ttl', title: 'Срок временного резерва', value: { minutes: 30 } },
  { key: 'prepayment', title: 'Предоплата', value: { type: null } },
  { key: 'min_days', title: 'Минимальный срок аренды', value: { days: 1 } },
  { key: 'late_return', title: 'Опоздание с возвратом', value: { chargeFullDay: true } },
];

function hash(p: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(p, salt, 64).toString('hex')}`;
}

async function ensureTriggers() {
  // Журнал операций — только добавление.
  await db.$executeRawUnsafe(`CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON LedgerEntry BEGIN SELECT RAISE(ABORT, 'Журнал операций нельзя изменять — используйте сторно'); END;`);
  await db.$executeRawUnsafe(`CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON LedgerEntry BEGIN SELECT RAISE(ABORT, 'Журнал операций нельзя удалять — используйте сторно'); END;`);
}

async function main() {
  await ensureTriggers();
  if ((await db.user.count()) > 0) {
    console.log('База уже заполнена.');
    return;
  }

  for (const u of USERS) await db.user.create({ data: { ...u, passwordHash: hash(PASSWORD) } });

  let i = 0;
  for (const t of tariffs.vehicles) {
    const slug = t.slug;
    const s = SPECS[slug];
    if (!s) throw new Error(`Нет характеристик для ${slug}`);
    const v = await db.vehicle.create({
      data: {
        slug,
        make: s.make,
        model: s.model,
        title: `${s.make} ${s.model}`,
        year: s.year,
        bodyType: s.bodyType,
        powerHp: s.powerHp,
        accel: s.accel,
        drive: 'полный',
        fuel: s.fuel,
        seats: s.seats,
        colorExterior: s.ext,
        colorInterior: s.int,
        description: s.description,
        equipment: JSON.stringify(s.equipment),
        sortOrder: i++,
        legacyPath: t.legacyUrl,
        mileageKm: 0,
      },
    });
    const d = t.daily as Record<string, number>;
    await db.tariffPlan.create({
      data: {
        vehicleId: v.id,
        tiers: JSON.stringify([
          { minDays: 1, dailyRate: d.d1_2 * 100 },
          { minDays: 3, dailyRate: d.d3 * 100 },
          { minDays: 7, dailyRate: d.d7 * 100 },
          { minDays: 14, dailyRate: d.d14 * 100 },
          { minDays: 30, dailyRate: d.d30 * 100 },
        ]),
        deposit: t.depositFrom * 100,
        includedKmPerDay: tariffs.includedKmPerDay,
        overmileagePerKm: t.overmileagePerKm * 100,
        driverPerHour: t.driverPerHour ? t.driverPerHour * 100 : null,
        note: 'Перенесено с crave-rental.ru, требует проверки владельцем',
      },
    });
  }

  for (const r of RULES) await db.pricingRule.create({ data: { key: r.key, title: r.title, value: JSON.stringify(r.value), status: 'assumption' } });
  await db.extraService.create({ data: { code: 'extra_driver', name: 'Дополнительный водитель', pricing: 'fixed', amount: null } });

  if (process.env.SEED_DEMO !== '0') await seedDemo();
  console.log(`Готово. Пользователи: ${USERS.map((u) => u.email).join(', ')}`);
}

// Демо-заказы для проверки календаря и CRM. Клиенты помечены как демо.
async function seedDemo() {
  const { createCrmOrder, createSiteRequest, confirmOrder, issueOrder } = await import('../lib/orders');
  const { post } = await import('../lib/ledger');
  const { withBookingLock, occupy } = await import('../lib/booking');
  const manager = await db.user.findUniqueOrThrow({ where: { email: 'manager@crave.test' } });
  const owner = await db.user.findUniqueOrThrow({ where: { email: 'owner@crave.test' } });
  const su = { id: manager.id, email: manager.email, fullName: manager.fullName, role: manager.role };
  const v = async (slug: string) => db.vehicle.findUniqueOrThrow({ where: { slug } });
  const at = (days: number, hour: number) => {
    const d = new Date();
    const msk = new Date(d.getTime() + 3 * 3600000);
    msk.setUTCDate(msk.getUTCDate() + days);
    msk.setUTCHours(hour, 0, 0, 0);
    return new Date(msk.getTime() - 3 * 3600000);
  };

  // 1. Новая заявка с сайта.
  await createSiteRequest({ vehicleSlug: 'bmw-m340i-xdrive-lci', pickupAt: at(1, 12), returnAt: at(4, 12), name: 'Демо-клиент 1', phone: '79990000001', services: [], idempotencyKey: 'demo-1', utm: { utm_source: 'demo' } });

  // 2. Подтверждённая бронь с частичной оплатой.
  const o2 = await createCrmOrder(su, { vehicleId: (await v('bmw-m5-f90-competition')).id, pickupAt: at(2, 10), returnAt: at(5, 10), name: 'Демо-клиент 2', phone: '79990000002', services: [] });
  await confirmOrder(su, o2.id);
  await post(db, { kind: 'payment.in', amount: 5000000, basis: 'Предоплата (демо)', method: 'transfer', createdById: manager.id, orderId: o2.id, customerId: o2.customerId });

  // 3. Машина в аренде.
  const o3 = await createCrmOrder(su, { vehicleId: (await v('dodge-ram-trx')).id, pickupAt: at(-1, 10), returnAt: at(1, 18), name: 'Демо-клиент 3', phone: '79990000003', services: [] });
  await confirmOrder(su, o3.id);
  await post(db, { kind: 'payment.in', amount: 10000000, basis: 'Оплата аренды (демо)', method: 'card', createdById: manager.id, orderId: o3.id, customerId: o3.customerId });
  await post(db, { kind: 'deposit.in', amount: 10000000, basis: 'Залог (демо)', method: 'card', createdById: manager.id, orderId: o3.id, customerId: o3.customerId });
  await issueOrder(su, o3.id, { mileageKm: 18250, fuelPercent: 100, checklist: { docs: true, keys: true, clean: true }, damages: [], photos: [] });

  // 4. Плановое ТО.
  const cayenne = await v('porsche-cayenne-s-iii');
  await withBookingLock((tx) => occupy(tx, { vehicleId: cayenne.id, kind: 'maintenance', startsAt: at(3, 9), endsAt: at(3, 18), bufferMin: 0, note: 'Плановое ТО (демо)', createdById: owner.id }));
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
