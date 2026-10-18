# 02. Архитектура и схема данных

## 1. Структура монорепозитория

Модульный монолит: один серверный API и одна база данных, четыре клиентских приложения. Сохраняем уже заданную структуру npm workspaces.

```
apps/
  rental/     Next.js — crave-rental.ru (публичный сайт проката)
  sales/      Next.js — auto.crave-rental.ru (CRAVE Auto, рабочее название)
  service/    Next.js — service.crave-rental.ru (CRAVE Service)
  crm/        Next.js — crm.crave-rental.ru (закрытая система)
  api/        Fastify — общий серверный API + фоновые задачи
packages/
  ui/         дизайн-токены, общие компоненты, переключатель направлений
  pricing/    расчёт стоимости — чистые функции, вызываются ТОЛЬКО из api
  db/         схема Drizzle, SQL-миграции, сиды
  contracts/  zod-схемы запросов/ответов API, общие типы
  config/     адреса сайтов, часовой пояс, общие eslint/tsconfig
infra/
  docker-compose.yml   PostgreSQL 16, MinIO (S3), Mailpit — для разработки
docs/
```

### Почему так

| Решение | Причина |
|---|---|
| TypeScript везде | Один язык для сайтов, CRM и API; общие типы контрактов |
| Next.js для публичных сайтов | Серверный рендеринг для SEO, статическая генерация карточек машин |
| Next.js для CRM | Одна технология для команды; CRM работает как клиентское приложение поверх API |
| Fastify отдельно от сайтов | Бизнес-логика, права и транзакции в одном месте; сайты и CRM — только клиенты API |
| PostgreSQL 16 | Ограничение исключения (`EXCLUDE USING gist`) гарантирует отсутствие пересечений на уровне БД |
| Drizzle ORM + ручные SQL-миграции | Типобезопасные запросы и полный контроль над ограничениями, триггерами, индексами |
| pg-boss для фоновых задач | Очередь в той же PostgreSQL, без Redis; истечение резервов, уведомления, напоминания |
| S3-совместимое хранилище | Документы и фото осмотров в закрытом бакете; выдача только через API по временной ссылке после проверки прав |

Адреса всех сайтов задаются переменными окружения (`SITE_URL_RENTAL`, `SITE_URL_AUTO`, `SITE_URL_SERVICE`, `SITE_URL_CRM`), переключатель направлений читает их из `packages/config`.

## 2. Модули API

| Модуль | Ответственность |
|---|---|
| `identity` | Пользователи, сессии, роли, разрешения, ограничение по направлению |
| `leads` | Обращения со всех сайтов, дедупликация, источник рекламы (UTM), антиспам |
| `customers` | Клиенты, контакты, документы клиента (доступ по разрешению) |
| `fleet` | Автомобили, документы машины, ТО, блокировки на обслуживание, состояние |
| `pricing` | Тарифы, услуги, правила; эндпоинт расчёта стоимости |
| `booking` | Доступность, резервы, брони; единственное место создания интервалов занятости |
| `orders` | Заказ аренды, статусы, продление, замена авто, отмена, снимок условий |
| `inspections` | Осмотры выдачи/возврата, повреждения, фото |
| `finance` | Начисления, платежи, обеспечительные платежи, удержания, расходы, сторно |
| `tasks` | Задачи и экран «Сегодня» |
| `notifications` | Правила уведомлений, дедупликация, адаптеры каналов (тестовый режим по умолчанию) |
| `audit` | Журнал критичных изменений |
| `sales`, `service` | Только обращения в первой версии |

Публичные эндпоинты (`/public/*`) — каталог, доступность, расчёт, приём заявок; без персональных данных и без деталей чужих броней (доступность отдаётся как «свободно/занято» без причины).
Закрытые (`/crm/*`) — каждый обработчик объявляет требуемое разрешение и направление; проверка в общем middleware и повторно в сервисном слое для выборок «по строкам».

## 3. Схема данных

Все суммы — `bigint` в копейках. Все времена — `timestamptz`. Первичные ключи — `uuid` (v7). Номера заказов — отдельная последовательность, человекочитаемые (`R-2026-000123`).

### 3.1 Доступ

```
direction            enum: rental | sales | service
users                id, email, phone, full_name, password_hash, is_active, created_at
roles                id, code (owner, rental_head, rental_manager, handover, finance, sales_staff, service_staff, tech_admin), name
permissions          code (discount.apply, tariff.edit, refund.issue, deposit.withhold.approve,
                     customer.docs.view, export.run, finance.view_expenses, finance.view_result, users.manage, ...)
role_permissions     role_id, permission_code
user_roles           user_id, role_id, direction NULL   -- NULL = все направления (только для owner)
sessions             id, user_id, token_hash, expires_at, ip, user_agent
```

### 3.2 Клиенты и обращения

```
customers            id, full_name, phone (нормализованный E.164), email, birth_date, driving_since,
                     is_foreign, notes, created_at
customer_directions  customer_id, direction, first_seen_at   -- видимость клиента по направлению
customer_documents   id, customer_id, kind (passport, license, other), file_id, expires_at, created_by
leads                id, direction, site, kind (booking_request, callback, purchase, service_request),
                     customer_id NULL, name, phone, payload jsonb, utm jsonb, referrer,
                     idempotency_key UNIQUE, status (new, in_progress, converted, rejected, spam),
                     assignee_id, order_id NULL, created_at
```

### 3.3 Автопарк и тарифы

```
vehicles             id, slug UNIQUE, make, model, trim, year, body_type, class, color_exterior, color_interior,
                     power_hp, accel_0_100, drive, transmission, seats, fuel,
                     vin (доступ по разрешению), plate_number (доступ по разрешению),
                     mileage_km, condition (ready, preparing, maintenance, unavailable),
                     is_published, sort_order, legacy_url
vehicle_photos       id, vehicle_id, file_id, kind (exterior, interior), sort_order, is_public
vehicle_documents    id, vehicle_id, kind (sts, osago, kasko, diagnostic_card, other), file_id, valid_until
maintenance_plans    id, vehicle_id, every_km, every_days, last_done_at, last_done_km

tariff_plans         id, vehicle_id, valid_from, valid_to NULL, deposit_amount, included_km_per_day,
                     overmileage_per_km, driver_per_hour NULL, status (draft, active, archived), approved_by
tariff_tiers         tariff_plan_id, min_days, daily_rate
extra_services       id, code, name, pricing (fixed, per_day, per_hour), amount, is_active
pricing_rules        id, key (day_rounding, grace_minutes, hold_ttl_minutes, prep_buffer_minutes,
                     late_return, early_return, cancellation, prepayment), value jsonb,
                     status (assumption, approved), approved_by
```

Изменение тарифа = новая запись `tariff_plans` с новым `valid_from`; старые не редактируются.

### 3.4 Бронирование — защита от пересечений

Единая таблица интервалов занятости — единственный источник правды для доступности:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE vehicle_occupancy (
  id            uuid PRIMARY KEY,
  vehicle_id    uuid NOT NULL REFERENCES vehicles(id),
  kind          text NOT NULL CHECK (kind IN ('hold','booking','rental','maintenance','manual_block')),
  order_id      uuid NULL REFERENCES rental_orders(id),
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,          -- плановый конец
  blocked_until timestamptz NOT NULL,          -- ends_at + буфер подготовки, вычисляет сервис booking
  expires_at    timestamptz NULL,              -- только для hold
  released_at   timestamptz NULL,              -- отмена / истечение / завершение
  created_by    uuid NULL,
  CHECK (ends_at > starts_at),
  CHECK (blocked_until >= ends_at),
  EXCLUDE USING gist (vehicle_id WITH =, tstzrange(starts_at, blocked_until, '[)') WITH &&)
    WHERE (released_at IS NULL)
);
```

`blocked_until` хранится явно: выражение `timestamptz + interval` в PostgreSQL не является IMMUTABLE и не может использоваться в сгенерированном столбце.

- Ограничение исключения гарантирует: два активных интервала одной машины не пересекаются, включая буфер. Второй из двух одновременных запросов получает ошибку `23P01` → API возвращает `409 Conflict` с предложением альтернатив.
- Истёкший резерв не может «сам» перестать блокировать (ограничение не зависит от `now()`), поэтому:
  1. фоновая задача каждую минуту проставляет `released_at` истёкшим `hold`;
  2. операция бронирования в своей транзакции сначала освобождает истёкшие `hold` по этой машине (`UPDATE ... SET released_at = now() WHERE kind='hold' AND expires_at < now()`), затем вставляет новый интервал.
- Подтверждение брони: в одной транзакции `hold` закрывается и создаётся `booking` (или `hold` меняет `kind` и сбрасывает `expires_at`).
- Продление: `UPDATE ends_at, blocked_until` того же интервала — ограничение само проверит следующую бронь; при `23P01` API возвращает конфликт с данными следующего заказа (для персонала) и подбирает свободные машины.
- Перенос/замена машины: в транзакции освобождается старый интервал и создаётся новый; история в `order_events`.
- Просрочка возврата: заказ в статусе «выдан» с `ends_at < now()` — вычисляемое предупреждение; задача проверяет ближайший следующий интервал этой машины и создаёт предупреждение по нему.

### 3.5 Заказы

```
rental_orders        id, number UNIQUE, customer_id, vehicle_id, lead_id NULL,
                     status (new, negotiation, confirmed, issued, returned, closed, cancelled, no_show),
                     pickup_at, return_at, actual_pickup_at, actual_return_at,
                     pickup_location, return_location, assignee_id, handover_staff_id,
                     terms_snapshot jsonb,     -- тариф, ступень, правила, услуги на момент согласования
                     quote_snapshot jsonb,     -- полная расшифровка расчёта
                     version int               -- оптимистичная блокировка
order_services       order_id, service_code, quantity, unit_amount, total_amount
order_events         id, order_id, type, from_status, to_status, payload jsonb, actor_id, created_at
order_comments       id, order_id, author_id, body, created_at
```

Независимые состояния не хранятся в `status` заказа, а вычисляются: оплата — из `charges`/`payments`, обеспечительный платёж — из `deposit_movements`, машина — `vehicles.condition`.

Допустимые переходы задаются таблицей в коде модуля `orders` и покрываются тестами:

```
new → negotiation → confirmed → issued → returned → closed
new | negotiation | confirmed → cancelled
confirmed → no_show
```

### 3.6 Осмотры

```
inspections          id, order_id, kind (pickup, return), performed_by, performed_at,
                     mileage_km, fuel_level, checklist jsonb, signed_act_file_id NULL
inspection_photos    inspection_id, file_id, angle
damages              id, vehicle_id, found_in_inspection_id, location, description, severity,
                     photo_file_ids uuid[], status (open, repaired), repaired_at
```

Открытые повреждения машины показываются в форме следующей выдачи.

### 3.7 Финансы

```
ledger_entries       id, direction, kind, amount (bigint, со знаком), occurred_at,
                     order_id NULL, vehicle_id NULL, customer_id NULL,
                     method (cash, card, transfer, other) NULL, basis text NOT NULL,
                     reverses_entry_id NULL, created_by, approved_by NULL, idempotency_key UNIQUE NULL
```

`kind`:

| Группа | Виды |
|---|---|
| Начисления | `charge.rental`, `charge.service`, `charge.overmileage`, `charge.late`, `charge.damage`, `charge.discount` (отрицательное) |
| Деньги клиента | `payment.in`, `payment.refund` |
| Обеспечительный платёж | `deposit.in`, `deposit.refund`, `deposit.withhold` (требует `approved_by` с правом `deposit.withhold.approve`) |
| Расходы | `expense.vehicle`, `expense.general` |

- Таблица только на вставку: `UPDATE`/`DELETE` запрещены триггером; исправление — запись со ссылкой `reverses_entry_id` (сторно) и затем новая верная запись.
- Задолженность заказа = Σ начислений − Σ (оплаты − возвраты оплаты).
- Остаток обеспечительного платежа = Σ получено − Σ возвращено − Σ удержано. Удержание переводится в начисление `charge.damage` и закрывается из залога — выручкой становится только удержание с основанием.
- Отчёты: поступления/выплаты (по `payment.*`, `deposit.*`, `expense.*`), начисления (по `charge.*`), долги, залоги к возврату, загрузка, результат по машине.

**Формулы**

- Загрузка = Σ часов `rental`+`booking` / (часы периода − часы `maintenance` − часы `manual_block`). Простой на обслуживании — отдельной колонкой.
- Результат автомобиля = начисления по машине − прямые расходы по машине. Называется «результат по автомобилю», не «прибыль».

### 3.8 Прочее

```
files                id, bucket, key, mime, size, sha256, owner_entity, owner_id, access_scope, created_by
tasks                id, direction, kind, title, due_at, order_id NULL, vehicle_id NULL,
                     assignee_id NULL, status (open, done, cancelled), dedupe_key UNIQUE NULL
notifications        id, user_id, channel, template, payload, dedupe_key, sent_at, status, test_mode bool
audit_log            id, actor_id, action, entity, entity_id, before jsonb, after jsonb, ip, created_at
idempotency_keys     key, scope, response jsonb, created_at
```

## 4. Расчёт стоимости

`packages/pricing` — чистая функция `quote(input, tariffPlan, rules) → Quote`, без ввода-вывода. Вызывается только сервером:

- `POST /public/quote` — для сайта;
- внутренний вызов при создании/изменении заказа в CRM;
- результат сохраняется в `quote_snapshot` заказа.

`Quote` содержит: оплачиваемые сутки и правило округления, ступень и ставку, стоимость аренды, услуги, скидку, итог, «к оплате сейчас» и остаток, обеспечительный платёж отдельно, включённый пробег, `rulesVersion` и список правил со статусом `assumption`, если расчёт опирается на неутверждённые правила.

Пока правило имеет статус `assumption`, сайт показывает под расчётом пометку «предварительный расчёт, менеджер подтвердит стоимость».

## 5. Безопасность и эксплуатация

- Сессии в httpOnly-cookie, `SameSite=Lax`, CSRF-токен для CRM; пароли — argon2id; блокировка после неудачных попыток.
- Права проверяются в API; файлы отдаются только через `GET /crm/files/:id` → проверка прав → временная ссылка S3 на 60 секунд.
- Формы сайтов: honeypot + ограничение частоты по IP/телефону + Яндекс SmartCaptcha (при необходимости); `Idempotency-Key` от клиента — повторная отправка не создаёт дубль.
- Логи: структурные (pino) с маскированием телефонов, паспортных данных, токенов.
- Секреты — только в переменных окружения / менеджере секретов; `.env.example` в репозитории.
- Окружения: `local`, `staging`, `production`; отдельные базы и бакеты.
- Бэкапы: ежедневный `pg_dump` + WAL-архив, версионирование бакета; ежемесячная проверка восстановления по инструкции.

## 6. Переключатель направлений

Компонент `DirectionSwitcher` в `packages/ui`: «Прокат · Автосалон · Сервис», активное направление подсвечено золотом, ссылки из `packages/config`. Используется в шапке, мобильном меню и подвале всех трёх сайтов.
