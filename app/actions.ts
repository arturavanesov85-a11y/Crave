'use server';

// Приём заявок со всех публичных сайтов. Защита: скрытое поле, частота, ключ идемпотентности.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { parseLocal } from '@/lib/dates';
import { BookingConflict } from '@/lib/booking';
import { createSiteRequest, normalizePhone, upsertCustomer } from '@/lib/orders';
import { allow } from '@/lib/ratelimit';

export type FormState = { error?: string } | undefined;

async function ip() {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local';
}

function utmFrom(fd: FormData) {
  const utm: Record<string, string> = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const v = fd.get(k);
    if (typeof v === 'string' && v) utm[k] = v.slice(0, 120);
  }
  return Object.keys(utm).length ? utm : undefined;
}

const Rental = z.object({
  slug: z.string().min(1),
  from: z.string(),
  to: z.string(),
  name: z.string().trim().min(2, 'Укажите имя').max(80),
  phone: z.string().trim().min(5, 'Укажите телефон'),
  comment: z.string().trim().max(1000).optional(),
  driverHours: z.coerce.number().int().min(0).max(240).default(0),
  key: z.string().min(8),
  consent: z.literal('on', { errorMap: () => ({ message: 'Нужно согласие на обработку данных' }) }),
});

export async function submitRentalRequest(_: FormState, fd: FormData): Promise<FormState> {
  if (fd.get('website')) return { error: 'Не удалось отправить заявку' }; // ловушка для ботов
  const parsed = Rental.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const phone = normalizePhone(d.phone);
  if (!phone) return { error: 'Проверьте номер телефона' };
  const pickupAt = parseLocal(d.from), returnAt = parseLocal(d.to);
  if (!pickupAt || !returnAt) return { error: 'Укажите даты' };
  if (!allow(`ip:${await ip()}`) || !allow(`phone:${phone}`, 3)) return { error: 'Слишком много заявок. Позвоните нам или попробуйте позже.' };

  let orderId: string | null;
  try {
    const r = await createSiteRequest({
      vehicleSlug: d.slug,
      pickupAt,
      returnAt,
      name: d.name,
      phone,
      comment: d.comment,
      services: d.driverHours ? [{ code: 'driver', qty: d.driverHours }] : [],
      idempotencyKey: d.key,
      utm: utmFrom(fd),
    });
    orderId = r.orderId;
  } catch (e) {
    if (e instanceof BookingConflict) return { error: 'К сожалению, автомобиль уже занят на эти даты. Выберите другие даты или автомобиль.' };
    return { error: e instanceof Error ? e.message : 'Не удалось отправить заявку' };
  }
  const order = orderId ? await db.rentalOrder.findUnique({ where: { id: orderId }, select: { number: true } }) : null;
  redirect(`/zayavka-poluchena?n=${encodeURIComponent(order?.number ?? '')}`);
}

const Lead = z.object({
  direction: z.enum(['rental', 'sales', 'service']),
  kind: z.enum(['callback', 'purchase', 'service_request']),
  name: z.string().trim().min(2, 'Укажите имя').max(80),
  phone: z.string().trim().min(5, 'Укажите телефон'),
  message: z.string().trim().max(2000).optional(),
  car: z.string().trim().max(120).optional(),
  key: z.string().min(8),
  consent: z.literal('on', { errorMap: () => ({ message: 'Нужно согласие на обработку данных' }) }),
  back: z.string().startsWith('/').max(200),
});

export async function submitLead(_: FormState, fd: FormData): Promise<FormState> {
  if (fd.get('website')) return { error: 'Не удалось отправить' };
  const parsed = Lead.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const phone = normalizePhone(d.phone);
  if (!phone) return { error: 'Проверьте номер телефона' };
  if (!allow(`ip:${await ip()}`) || !allow(`phone:${phone}`, 3)) return { error: 'Слишком много обращений. Позвоните нам или попробуйте позже.' };

  const exists = await db.lead.findUnique({ where: { idempotencyKey: d.key } });
  if (!exists) {
    await db.$transaction(async (tx) => {
      const customer = await upsertCustomer(tx, { name: d.name, phone }, d.direction);
      await tx.lead.create({
        data: {
          direction: d.direction,
          site: d.direction,
          kind: d.kind,
          name: d.name,
          phone,
          message: d.message || null,
          payload: d.car ? JSON.stringify({ car: d.car }) : null,
          utm: utmFrom(fd) ? JSON.stringify(utmFrom(fd)) : null,
          idempotencyKey: d.key,
          customerId: customer.id,
        },
      });
    });
  }
  redirect(`${d.back}?sent=1`);
}
