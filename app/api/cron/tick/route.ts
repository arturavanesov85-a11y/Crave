// Расписание уведомлений: сервер вызывает этот адрес каждые 5 минут (cron на сервере).
// Ключ в заголовке x-cron-key защищает от посторонних вызовов.
import { NextResponse } from 'next/server';
import { tick } from '@/lib/notify';
import { syncAvitoChats } from '@/lib/avito-api';

export async function POST(req: Request) {
  const key = process.env.CRON_SECRET;
  if (!key || req.headers.get('x-cron-key') !== key) return new NextResponse('forbidden', { status: 403 });
  const done = await tick();
  // Сообщения с Авито — запасной путь, если вебхук Авито не дошёл.
  const avito = await syncAvitoChats().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  return NextResponse.json({ ok: true, sent: done, avito });
}
