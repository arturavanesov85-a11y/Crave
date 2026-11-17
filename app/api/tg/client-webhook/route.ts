// Вебхук клиентского бота проката. Клиент делится номером телефона — бот находит его в базе
// и дальше присылает подтверждение брони, напоминание о выдаче и акты с фото осмотра.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
import { normalizePhone, STATUS_LABEL } from '@/lib/orders';
import { esc, sendMessage } from '@/lib/telegram';

type Update = {
  message?: {
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string };
    text?: string;
    contact?: { phone_number: string; user_id?: number };
  };
};

const ASK = JSON.stringify({ keyboard: [[{ text: 'Поделиться номером', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true });
const REMOVE = JSON.stringify({ remove_keyboard: true });

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_CLIENT_WEBHOOK_SECRET;
  if (!secret || req.headers.get('x-telegram-bot-api-secret-token') !== secret) return new NextResponse('forbidden', { status: 403 });
  const up = (await req.json().catch(() => null)) as Update | null;
  const msg = up?.message;
  if (!msg || msg.chat.type !== 'private') return NextResponse.json({ ok: true });
  const chat = String(msg.chat.id);

  if (msg.contact) {
    // Принимаем только собственный номер отправителя, а не пересланный чужой контакт.
    if (msg.contact.user_id !== msg.from?.id) {
      await sendMessage('client', chat, 'Пожалуйста, отправьте свой номер кнопкой «Поделиться номером».', undefined, { reply_markup: ASK });
      return NextResponse.json({ ok: true });
    }
    const phone = normalizePhone(msg.contact.phone_number);
    const customer = phone ? await db.customer.findUnique({ where: { phone } }) : null;
    if (!customer) {
      await sendMessage('client', chat, 'Не нашли бронирований на этот номер. Если вы бронировали по другому номеру — позвоните нам, и мы всё проверим.', undefined, { reply_markup: REMOVE });
      return NextResponse.json({ ok: true });
    }
    await db.customer.updateMany({ where: { telegramChatId: chat, id: { not: customer.id } }, data: { telegramChatId: null } });
    await db.customer.update({ where: { id: customer.id }, data: { telegramChatId: chat } });
    const active = await db.rentalOrder.findMany({ where: { customerId: customer.id, status: { in: ['negotiation', 'confirmed', 'issued'] } }, include: { vehicle: true }, orderBy: { pickupAt: 'asc' } });
    const lines = active.map((o) => `• ${esc(o.vehicle.title)}, ${fmtDateTime(o.pickupAt)} — ${fmtDateTime(o.returnAt)} (${STATUS_LABEL[o.status].toLowerCase()})`);
    await sendMessage('client', chat, `${esc(customer.fullName.split(' ')[0])}, готово! Сюда будут приходить подтверждения брони, напоминания и акты приёма-передачи с фото.${lines.length ? `\n\nВаши брони:\n${lines.join('\n')}` : ''}`, undefined, { reply_markup: REMOVE });
    return NextResponse.json({ ok: true });
  }

  if (msg.text?.startsWith('/start') || msg.text) {
    const linked = await db.customer.findFirst({ where: { telegramChatId: chat } });
    if (linked && !msg.text.startsWith('/start')) {
      await sendMessage('client', chat, 'Этот бот присылает подтверждения, напоминания и акты. По вопросам брони позвоните нам — ответим сразу.');
    } else {
      await sendMessage('client', chat, 'Здравствуйте! Это бот проката CRAVE. Чтобы получать подтверждения брони, напоминания и акты приёма-передачи, поделитесь номером телефона, указанным при бронировании.', undefined, { reply_markup: ASK });
    }
  }
  return NextResponse.json({ ok: true });
}
