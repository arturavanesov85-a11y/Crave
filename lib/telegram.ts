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
