// Вебхук бота сотрудников (@Crave_auto_bot): нажатия кнопок в уведомлениях и команда /start.
// Telegram присылает секрет в заголовке — без него запрос не принимается.
import { NextResponse } from 'next/server';
import { toSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { rub } from '@/lib/money';
import { takeOrder } from '@/lib/orders';
import { can } from '@/lib/permissions';
import { decideWithhold } from '@/lib/rental-ops';
import { answerCallback, appUrl, editMessage, esc, sendMessage } from '@/lib/telegram';

type Update = {
  message?: { chat: { id: number }; from?: { id: number }; text?: string };
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { chat: { id: number }; message_id: number; text?: string } };
};

async function staffUser(telegramId: number) {
  const link = await db.telegramLink.findUnique({ where: { telegramId: String(telegramId) } });
  if (!link || link.status !== 'approved' || !link.userId) return null;
  const u = await db.user.findUnique({ where: { id: link.userId } });
  if (!u || !u.isActive || u.deletedAt) return null;
  if (link.blockedAt) await db.telegramLink.update({ where: { id: link.id }, data: { blockedAt: null } });
  return toSessionUser(u);
}

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get('x-telegram-bot-api-secret-token') !== secret) return new NextResponse('forbidden', { status: 403 });
  const up = (await req.json().catch(() => null)) as Update | null;
  if (!up) return NextResponse.json({ ok: true });

  if (up.message?.text?.startsWith('/start')) {
    const user = up.message.from ? await staffUser(up.message.from.id) : null;
    await sendMessage('staff', String(up.message.chat.id), user ? `${esc(user.fullName)}, сюда будут приходить заявки, напоминания о выдачах и возвратах и КП.` : 'Это бот сотрудников CRAVE. Откройте приложение — владелец подтвердит доступ.', [[{ text: 'Открыть приложение', app: appUrl('/tg') }]]);
    return NextResponse.json({ ok: true });
  }

  const cb = up.callback_query;
  if (!cb?.data || !cb.message) return NextResponse.json({ ok: true });
  const user = await staffUser(cb.from.id);
  if (!user) {
    await answerCallback('staff', cb.id, 'Аккаунт не привязан к сотруднику CRM', true);
    return NextResponse.json({ ok: true });
  }
  const chat = String(cb.message.chat.id);
  const original = esc(cb.message.text ?? '');
  try {
    const [action, ...rest] = cb.data.split(':');
    if (action === 'take') {
      if (!can(user, 'rental.write')) throw new Error('Нет права работать с заказами');
      const id = rest[0];
      await takeOrder(user, id);
      await answerCallback('staff', cb.id, 'Заявка ваша — резерв продлён');
      await editMessage('staff', chat, cb.message.message_id, `${original}\n\n<b>Взял в работу: ${esc(user.fullName)}</b>`, [[{ text: 'Открыть заказ', app: appUrl(`/tg/rental/order/${id}`) }]]);
    } else if (action === 'wh') {
      if (!can(user, 'deposit.withhold.approve')) throw new Error('Нет права подтверждать удержания');
      const approve = rest[0] === 'a';
      const r = await decideWithhold(user, rest[1], approve);
      await answerCallback('staff', cb.id, approve ? 'Удержание подтверждено' : 'Удержание отклонено');
      await editMessage('staff', chat, cb.message.message_id, `${original}\n\n<b>${approve ? 'Подтверждено' : 'Отклонено'}: ${esc(user.fullName)}, ${rub(r.amount)}</b>`, [[{ text: 'Открыть заказ', app: appUrl(`/tg/rental/order/${r.orderId}`) }]]);
    } else {
      await answerCallback('staff', cb.id, 'Кнопка устарела');
    }
  } catch (e) {
    // Типичный случай: заявку уже взял коллега или запрос уже рассмотрен.
    await answerCallback('staff', cb.id, e instanceof Error ? e.message : 'Не получилось', true);
  }
  return NextResponse.json({ ok: true });
}
