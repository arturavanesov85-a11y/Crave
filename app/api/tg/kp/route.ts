// КП из мини-приложения: собираем PDF и бот присылает его сотруднику в чат.
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { buildKp, kpFileName } from '@/lib/kp-pdf';
import { parseRub, rub } from '@/lib/money';
import { audit } from '@/lib/orders';
import { can } from '@/lib/permissions';
import { allow } from '@/lib/ratelimit';
import { sendDocument } from '@/lib/telegram';

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || !can(user, 'tg.app')) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  if (!allow(`tg-kp:${user.id}`, 20, 10 * 60000)) return NextResponse.json({ error: 'Слишком много КП подряд — подождите пару минут' }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { id?: string; price?: string; vat?: boolean } | null;
  const car = body?.id ? await db.saleCar.findUnique({ where: { id: body.id } }) : null;
  if (!car) return NextResponse.json({ error: 'Автомобиль не найден' }, { status: 404 });
  const raw = String(body?.price ?? '').trim();
  const price = raw ? parseRub(raw) : null;
  if (raw && !price) return NextResponse.json({ error: 'Стоимость — только цифры, в рублях' }, { status: 400 });
  const link = await db.telegramLink.findFirst({ where: { userId: user.id, status: 'approved' }, orderBy: { lastSeenAt: 'desc' } });
  if (!link) return NextResponse.json({ error: 'Аккаунт Telegram не привязан' }, { status: 400 });

  const pdf = await buildKp(car, { price, vat: !!body?.vat });
  const caption = `${car.title}, ${car.year} · ${price ? `${rub(price)}${body?.vat ? ' с НДС' : ''}` : 'цена по запросу'}`;
  const sent = await sendDocument(link.telegramId, pdf, kpFileName(car), caption);
  if (sent === 'ok') await audit(db, user.id, 'salecar.kp', 'salecar', car.id, { price, vat: !!body?.vat, via: 'telegram' });
  if (sent === 'ok') return NextResponse.json({ ok: true });
  if (sent === 'need_start') return NextResponse.json({ status: 'need_start' }, { status: 409 });
  return NextResponse.json({ error: `Не удалось отправить: ${sent}` }, { status: 502 });
}
