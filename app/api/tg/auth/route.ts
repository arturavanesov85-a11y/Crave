// Вход в мини-приложение Telegram: проверяем подпись initData, находим привязанного сотрудника.
// Новый аккаунт Telegram попадает в запросы на доступ — их подтверждает владелец в CRM.
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createSession, toSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { can } from '@/lib/permissions';
import { allow } from '@/lib/ratelimit';
import { verifyInitData } from '@/lib/telegram';

export async function POST(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ status: 'not_configured' }, { status: 503 });
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!allow(`tg-auth:${ip}`, 30, 10 * 60000)) return NextResponse.json({ status: 'rate_limited' }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { initData?: string } | null;
  const tg = verifyInitData(String(body?.initData ?? ''), token);
  if (!tg) return NextResponse.json({ status: 'invalid' }, { status: 401 });

  const telegramId = String(tg.id);
  const link = await db.telegramLink.upsert({
    where: { telegramId },
    update: { username: tg.username ?? null, firstName: tg.first_name ?? null, lastName: tg.last_name ?? null, lastSeenAt: new Date() },
    create: { telegramId, username: tg.username ?? null, firstName: tg.first_name ?? null, lastName: tg.last_name ?? null, lastSeenAt: new Date() },
  });
  if (link.status === 'rejected') return NextResponse.json({ status: 'rejected' });
  if (link.status !== 'approved' || !link.userId) return NextResponse.json({ status: 'pending' });

  const user = await db.user.findUnique({ where: { id: link.userId } });
  if (!user || !user.isActive || user.deletedAt) return NextResponse.json({ status: 'blocked' });
  if (!can(toSessionUser(user), 'tg.app')) return NextResponse.json({ status: 'no_access' });
  await createSession(user.id, { embedded: true });
  return NextResponse.json({ status: 'ok' });
}
