// Проверка данных, которые Telegram передаёт в мини-приложение (initData).
// Алгоритм из документации Telegram: secret = HMAC_SHA256("WebAppData", токен бота),
// hash = hex(HMAC_SHA256(secret, строки «ключ=значение» по алфавиту через \n, без hash)).
import { createHmac, timingSafeEqual } from 'node:crypto';

export type TelegramUser = { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string };

export function verifyInitData(initData: string, botToken: string, maxAgeSec = 24 * 3600, now = Date.now()): TelegramUser | null {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  const pairs: string[] = [];
  params.forEach((v, k) => {
    if (k !== 'hash') pairs.push(`${k}=${v}`);
  });
  pairs.sort();
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = createHmac('sha256', secret).update(pairs.join('\n')).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== calc.length || !timingSafeEqual(given, calc)) return null;
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || now / 1000 - authDate > maxAgeSec) return null;
  try {
    const user = JSON.parse(params.get('user') ?? 'null') as TelegramUser | null;
    return user && Number.isInteger(user.id) ? user : null;
  } catch {
    return null;
  }
}

/** Только для тестов: собрать подписанный initData так же, как это делает Telegram. */
export function signInitDataForTest(fields: Record<string, string>, botToken: string): string {
  const pairs = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort();
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(pairs.join('\n')).digest('hex');
  const p = new URLSearchParams(fields);
  p.set('hash', hash);
  return p.toString();
}

export const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || '';

/**
 * Отправка файла сотруднику в чат с ботом. Возвращает 'ok', 'need_start' (бот ещё не может
 * писать этому человеку — нужно разрешение в приложении или «Старт» в боте) или текст ошибки.
 * С сервера Telegram иногда отвечает не с первого раза — до трёх попыток.
 */
export async function sendDocument(chatId: string, file: Buffer, fileName: string, caption?: string): Promise<'ok' | 'need_start' | string> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return 'Бот не подключён';
  let last = 'Telegram не ответил';
  for (let attempt = 0; attempt < 3; attempt++) {
    const fd = new FormData();
    fd.set('chat_id', chatId);
    if (caption) fd.set('caption', caption.slice(0, 1000));
    fd.set('document', new Blob([new Uint8Array(file)], { type: 'application/pdf' }), fileName);
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: fd, signal: AbortSignal.timeout(45_000) });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error_code?: number; description?: string } | null;
      if (body?.ok) return 'ok';
      if (body?.error_code === 403 || /chat not found/i.test(body?.description ?? '')) return 'need_start';
      last = body?.description ?? `Telegram ответил ${res.status}`;
      if (res.status < 500 && res.status !== 429) return last;
    } catch (e) {
      last = e instanceof Error && e.name === 'TimeoutError' ? 'Telegram не ответил вовремя' : 'Нет связи с Telegram';
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return last;
}
