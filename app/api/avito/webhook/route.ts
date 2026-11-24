// Вебхук мессенджера Авито: Авито сообщает о новом сообщении, мы сами забираем непрочитанные чаты
// через API (содержимому вебхука не доверяем). Адрес с ключом AVITO_WEBHOOK_KEY регистрируется
// в Авито один раз (POST /messenger/v3/webhook).
import { syncAvitoChats } from '@/lib/avito-api';

export async function POST(req: Request) {
  const key = process.env.AVITO_WEBHOOK_KEY;
  if (!key || new URL(req.url).searchParams.get('key') !== key) return new Response('forbidden', { status: 403 });
  syncAvitoChats().catch((e) => console.error('[avito]', e instanceof Error ? e.message : e));
  return Response.json({ ok: true });
}
