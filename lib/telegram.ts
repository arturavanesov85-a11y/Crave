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

// ---------- Bot API ----------
// Два бота: «staff» — @Crave_auto_bot для сотрудников (TELEGRAM_BOT_TOKEN),
// «client» — бот проката для клиентов (TELEGRAM_CLIENT_BOT_TOKEN).
// С сервера Telegram иногда отвечает не с первого раза — до трёх попыток.

export type Bot = 'staff' | 'client';
export type Button = { text: string; data?: string; url?: string; app?: string };
export type ApiResult = { ok: true; result: unknown } | { ok: false; code: number; error: string; blocked: boolean };

export const botToken = (bot: Bot) => (bot === 'client' ? process.env.TELEGRAM_CLIENT_BOT_TOKEN : process.env.TELEGRAM_BOT_TOKEN) || '';
export const CLIENT_BOT_USERNAME = process.env.TELEGRAM_CLIENT_BOT_USERNAME || '';

/** Адрес сайта для кнопок «Открыть в приложении» (Telegram открывает только https). */
export const appUrl = (path: string) => `${(process.env.NEXT_PUBLIC_URL_RENTAL || 'https://crave-rental.ru').replace(/\/$/, '')}${path}`;

function keyboard(rows?: Button[][]) {
  if (!rows?.length) return undefined;
  return JSON.stringify({
    inline_keyboard: rows.map((r) => r.map((b) => (b.app ? { text: b.text, web_app: { url: b.app } } : b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: (b.data ?? '').slice(0, 64) }))),
  });
}

export async function tgApi(bot: Bot, method: string, params: Record<string, string | Blob | undefined>, timeoutMs = 20_000): Promise<ApiResult> {
  const token = botToken(bot);
  if (!token) return { ok: false, code: 0, error: 'Бот не подключён', blocked: false };
  let last: ApiResult = { ok: false, code: 0, error: 'Telegram не ответил', blocked: false };
  for (let attempt = 0; attempt < 3; attempt++) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) fd.set(k, v as string | Blob);
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', body: fd, signal: AbortSignal.timeout(timeoutMs) });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: unknown; error_code?: number; description?: string } | null;
      if (body?.ok) return { ok: true, result: body.result };
      const desc = body?.description ?? `Telegram ответил ${res.status}`;
      last = { ok: false, code: body?.error_code ?? res.status, error: desc, blocked: body?.error_code === 403 || /chat not found/i.test(desc) };
      if (res.status < 500 && res.status !== 429) return last;
    } catch (e) {
      last = { ok: false, code: 0, error: e instanceof Error && e.name === 'TimeoutError' ? 'Telegram не ответил вовремя' : 'Нет связи с Telegram', blocked: false };
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return last;
}

/** Сообщение в чат (разметка HTML: <b>, <i>, <a>). Кнопки — строки кнопок. */
export function sendMessage(bot: Bot, chatId: string, html: string, buttons?: Button[][], extra: Record<string, string> = {}) {
  return tgApi(bot, 'sendMessage', { chat_id: chatId, text: html.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: 'true', reply_markup: keyboard(buttons), ...extra });
}

export function sendFile(bot: Bot, chatId: string, file: Buffer, fileName: string, mime: string, caption?: string, buttons?: Button[][]) {
  return tgApi(bot, 'sendDocument', { chat_id: chatId, caption: caption?.slice(0, 1000), parse_mode: 'HTML', document: new File([new Uint8Array(file)], fileName, { type: mime }), reply_markup: keyboard(buttons) }, 60_000);
}

export function answerCallback(bot: Bot, callbackId: string, text: string, alert = false) {
  return tgApi(bot, 'answerCallbackQuery', { callback_query_id: callbackId, text: text.slice(0, 190), show_alert: alert ? 'true' : undefined });
}

/** Заменить текст сообщения (например, после нажатия «Подтвердить») и убрать кнопки. */
export function editMessage(bot: Bot, chatId: string, messageId: number, html: string, buttons?: Button[][]) {
  return tgApi(bot, 'editMessageText', { chat_id: chatId, message_id: String(messageId), text: html.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: 'true', reply_markup: keyboard(buttons) ?? JSON.stringify({ inline_keyboard: [] }) });
}

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Отправка PDF сотруднику в чат с ботом. 'ok', 'need_start' (бот ещё не может писать этому человеку —
 * нужно разрешение в приложении или «Старт» в боте) или текст ошибки.
 */
export async function sendDocument(chatId: string, file: Buffer, fileName: string, caption?: string): Promise<'ok' | 'need_start' | string> {
  const r = await sendFile('staff', chatId, file, fileName, 'application/pdf', caption);
  return r.ok ? 'ok' : r.blocked ? 'need_start' : r.error;
}
