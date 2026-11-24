// API Авито: токен по client_credentials (AVITO_CLIENT_ID / AVITO_CLIENT_SECRET в .env) и чаты.
// Новые сообщения покупателей превращаются в заявку «Продажи» (одна заявка на чат) и уведомление в Telegram.
import { db, json } from './db';

let token: { value: string; until: number } | null = null;
let accountId: number | null = null;

export const avitoConfigured = () => !!(process.env.AVITO_CLIENT_ID && process.env.AVITO_CLIENT_SECRET);

async function getToken() {
  if (token && token.until > Date.now() + 60_000) return token.value;
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.AVITO_CLIENT_ID ?? '', client_secret: process.env.AVITO_CLIENT_SECRET ?? '' });
  const r = await fetch('https://api.avito.ru/token', { method: 'POST', body, signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  if (!j.access_token) throw new Error(`Авито: не удалось получить токен (${r.status})`);
  token = { value: j.access_token, until: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return token.value;
}

export async function avitoApi<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(`https://api.avito.ru${path}`, {
    method: init?.method ?? 'GET',
    headers: { Authorization: `Bearer ${await getToken()}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Авито ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}

export async function avitoAccountId() {
  if (!accountId) accountId = (await avitoApi<{ id: number }>('/core/v1/accounts/self')).id;
  return accountId;
}

type Chat = {
  id: string;
  context?: { type: string; value?: { id?: number; title?: string; url?: string; price_string?: string } };
  users?: { id: number; name?: string; public_user_profile?: { url?: string; user_id?: number } }[];
  last_message?: { id: string; author_id: number; created: number; direction?: string };
};
type Message = { id: string; author_id: number; created: number; direction?: string; type: string; content?: { text?: string; link?: { text?: string; url?: string } }; is_read?: boolean };

export const avitoChatUrl = (chatId: string) => `https://www.avito.ru/profile/messenger/channel/${chatId}`;

const msgText = (m: Message) => m.content?.text ?? m.content?.link?.text ?? (m.type === 'image' ? '[фото]' : m.type === 'voice' ? '[голосовое сообщение]' : `[${m.type}]`);

/** Ключ уже использован — значит, сообщение обработано раньше. */
async function claim(key: string) {
  try { await db.notification.create({ data: { key } }); return true; } catch { return false; }
}

/**
 * Забирает непрочитанные чаты и обрабатывает новые входящие сообщения.
 * Самый первый запуск только запоминает уже существующие сообщения — чтобы не прислать старую переписку.
 * Чаты не помечаются прочитанными: на Авито они остаются непрочитанными для менеджера.
 */
export async function syncAvitoChats(): Promise<{ leads: number; messages: number }> {
  if (!avitoConfigured()) return { leads: 0, messages: 0 };
  const uid = await avitoAccountId();
  const first = !(await db.notification.findUnique({ where: { key: 'avito-chats:init' } }));
  const { chats } = await avitoApi<{ chats: Chat[] }>(`/messenger/v2/accounts/${uid}/chats?unread_only=${first ? 'false' : 'true'}&chat_types=u2i&limit=50`);
  let leads = 0, messages = 0;
  for (const chat of chats ?? []) {
    const { messages: list } = await avitoApi<{ messages: Message[] }>(`/messenger/v3/accounts/${uid}/chats/${chat.id}/messages/?limit=30`);
    const incoming = (list ?? []).filter((m) => m.author_id !== uid && m.author_id !== 0 && (m.direction ?? 'in') === 'in').sort((a, b) => a.created - b.created);
    for (const m of incoming) {
      if (!(await claim(`avito-msg:${m.id}`)) || first) continue;
      const r = await handleMessage(chat, m, uid);
      messages++;
      if (r === 'lead') leads++;
    }
  }
  if (first) await claim('avito-chats:init');
  return { leads, messages };
}

export const AVITO_AUTOREPLY = 'Благодарим за обращение в CRAVE!\n\nНаш менеджер свяжется с вами в ближайшее время.\n\nCRAVE | DRIVE YOUR EMOTIONS';

/** Отправить сообщение в чат Авито от имени компании. */
export async function sendAvitoMessage(chatId: string, text: string) {
  const uid = await avitoAccountId();
  await avitoApi(`/messenger/v1/accounts/${uid}/chats/${chatId}/messages`, { method: 'POST', body: { message: { text }, type: 'text' } });
}

export type AvitoChatMessage = { id: string; mine: boolean; text: string; at: Date };
/** Переписка в чате (старые сверху) — для карточки заявки. */
export async function avitoChatMessages(chatId: string): Promise<AvitoChatMessage[]> {
  const uid = await avitoAccountId();
  const { messages } = await avitoApi<{ messages: Message[] }>(`/messenger/v3/accounts/${uid}/chats/${chatId}/messages/?limit=50`);
  return (messages ?? []).filter((m) => m.type !== 'system' || m.content?.text).map((m) => ({ id: m.id, mine: m.author_id === uid, text: msgText(m), at: new Date(m.created * 1000) })).sort((a, b) => a.at.getTime() - b.at.getTime());
}

async function handleMessage(chat: Chat, m: Message, uid: number): Promise<'lead' | 'note'> {
  const other = chat.users?.find((u) => u.id !== uid);
  const buyer = other?.name ?? 'Покупатель с Авито';
  const item = chat.context?.type === 'item' ? chat.context.value : undefined;
  const text = msgText(m);
  // Машина из «Авто в продаже», к объявлению которой пришло сообщение (по номеру объявления).
  const car = item?.id ? (await db.saleCar.findMany({ where: { avito: { contains: String(item.id) } } }))[0] : undefined;
  const key = `avito-chat:${chat.id}`;
  const existing = await db.lead.findUnique({ where: { idempotencyKey: key } });
  const { notifyAvitoMessage } = await import('./notify');
  if (existing) {
    await db.leadNote.create({ data: { leadId: existing.id, kind: 'system', text: `Авито, ${buyer}: ${text}` } });
    // Закрытая заявка снова в работе — покупатель написал ещё раз.
    if (['converted', 'rejected', 'spam'].includes(existing.status)) await db.lead.update({ where: { id: existing.id }, data: { status: 'new', stage: 'new', closedAt: null } });
    await notifyAvitoMessage(existing.id, chat.id, buyer, item?.title ?? null, text, false);
    return 'note';
  }
  // Карточка клиента: один покупатель Авито — один клиент (телефон Авито не передаёт).
  const avitoUserId = other ? String(other.id) : null;
  const customer = avitoUserId
    ? await db.customer.upsert({
        where: { avitoUserId },
        update: { avitoProfile: other?.public_user_profile?.url ?? undefined },
        create: { fullName: buyer, phone: null, channel: 'avito', avitoUserId, avitoProfile: other?.public_user_profile?.url ?? null, directions: { create: { direction: 'sales' } } },
      })
    : null;
  if (customer) await db.customerDirection.upsert({ where: { customerId_direction: { customerId: customer.id, direction: 'sales' } }, update: {}, create: { customerId: customer.id, direction: 'sales' } });
  const lead = await db.lead.create({
    data: {
      direction: 'sales', site: 'avito', channel: 'avito', kind: 'avito_message', name: buyer, phone: '', message: text.slice(0, 2000),
      idempotencyKey: key, saleCarId: car?.id ?? null, carInfo: item?.title ?? car?.title ?? null, customerId: customer?.id ?? null,
      payload: JSON.stringify({ avitoChatId: chat.id, avitoItemId: item?.id ?? null, itemUrl: item?.url ?? null, price: item?.price_string ?? null }),
    },
  });
  // Автоответ на первое сообщение в новом чате.
  try {
    await sendAvitoMessage(chat.id, AVITO_AUTOREPLY);
    await db.leadNote.create({ data: { leadId: lead.id, kind: 'system', text: 'Отправлен автоответ в чат Авито' } });
  } catch (e) {
    await db.leadNote.create({ data: { leadId: lead.id, kind: 'system', text: `Автоответ не отправлен: ${e instanceof Error ? e.message.slice(0, 200) : e}` } });
  }
  await notifyAvitoMessage(lead.id, chat.id, buyer, item?.title ?? null, text, true);
  return 'lead';
}

/** Адрес чата на Авито из заявки, если она пришла с Авито. */
export function leadAvitoChat(payload: string | null) {
  const p = json<{ avitoChatId?: string; itemUrl?: string }>(payload, {});
  return p.avitoChatId ? { chat: avitoChatUrl(p.avitoChatId), item: p.itemUrl ?? null } : null;
}
