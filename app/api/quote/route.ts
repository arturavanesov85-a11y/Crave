// Публичный расчёт стоимости. Сайт считает только через этот эндпоинт.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { parseLocal } from '@/lib/dates';
import { quoteFor } from '@/lib/orders';
import { findConflict } from '@/lib/booking';
import { addMinutes } from '@/lib/dates';
import { currentUser } from '@/lib/auth';

const Body = z.object({
  slug: z.string().min(1),
  from: z.string(),
  to: z.string(),
  services: z.array(z.object({ code: z.string(), qty: z.number().int().min(0).max(240) })).max(10).default([]),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Некорректный запрос' }, { status: 400 });
  const { slug, from, to, services } = parsed.data;
  const pickupAt = parseLocal(from), returnAt = parseLocal(to);
  if (!pickupAt || !returnAt) return NextResponse.json({ ok: false, error: 'Укажите даты получения и возврата' });
  const v = await db.vehicle.findUnique({ where: { slug } });
  // Неопубликованные машины считаются только для сотрудников CRM.
  if (!v || (!v.isPublished && !(await currentUser()))) return NextResponse.json({ ok: false, error: 'Автомобиль не найден' }, { status: 404 });

  const { quote, settings } = await quoteFor(v.id, pickupAt, returnAt, services);
  if (!quote.ok) return NextResponse.json(quote);
  // Только «свободно / занято», без деталей чужих броней.
  const busy = v.condition === 'unavailable' || !!(await findConflict(db, v.id, pickupAt, addMinutes(returnAt, settings.prepBufferMinutes), settings.prepBufferMinutes));
  return NextResponse.json({ ...quote, available: !busy, pastPickup: pickupAt < new Date() });
}
