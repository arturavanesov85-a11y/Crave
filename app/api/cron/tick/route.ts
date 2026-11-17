// Расписание уведомлений: сервер вызывает этот адрес каждые 5 минут (cron на сервере).
// Ключ в заголовке x-cron-key защищает от посторонних вызовов.
import { NextResponse } from 'next/server';
import { tick } from '@/lib/notify';

export async function POST(req: Request) {
  const key = process.env.CRON_SECRET;
  if (!key || req.headers.get('x-cron-key') !== key) return new NextResponse('forbidden', { status: 403 });
  const done = await tick();
  return NextResponse.json({ ok: true, sent: done });
}
