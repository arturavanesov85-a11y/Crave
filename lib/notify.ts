// Уведомления сотрудникам в Telegram (@Crave_auto_bot) и клиентам (клиентский бот проката).
// Получатели — привязанные к CRM аккаунты Telegram, у которых есть нужное право.
// Ключ уведомления (таблица Notification) не даёт прислать одно и то же дважды.
// Ошибки отправки не ломают работу CRM: уведомление — дополнение, а не условие.
import { toSessionUser } from './auth';
import { addMinutes, fmtDate, fmtDateTime, fmtTime, startOfLocalDay, TZ } from './dates';
import { db, json } from './db';
import { summarize } from './ledger';
import { rub } from './money';
import { formatPhone } from './orders';
import { can, type Perm, type SessionUser } from './permissions';
import { appUrl, esc, sendFile, sendMessage, type Bot, type Button } from './telegram';

type Recipient = { userId: string; chatId: string; user: SessionUser };

/** Привязанные сотрудники, у которых есть хотя бы одно из прав. */
export async function staffWith(perms: Perm[], onlyIds?: string[]): Promise<Recipient[]> {
  const links = await db.telegramLink.findMany({ where: { status: 'approved', userId: onlyIds ? { in: onlyIds } : { not: null }, blockedAt: null } });
  if (!links.length) return [];
  const users = await db.user.findMany({ where: { id: { in: links.map((l) => l.userId!) }, isActive: true, deletedAt: null } });
  const out: Recipient[] = [];
  for (const l of links) {
    const u = users.find((x) => x.id === l.userId);
    if (!u) continue;
    const su = toSessionUser(u);
    if (perms.some((p) => can(su, p))) out.push({ userId: u.id, chatId: l.telegramId, user: su });
  }
  return out;
}

/** Ключ уже использован — значит, уведомление отправлено раньше. */
async function claim(key: string) {
  try {
    await db.notification.create({ data: { key } });
    return true;
  } catch {
    return false;
  }
}

async function deliver(bot: Bot, to: { chatId: string }[], html: string, buttons?: Button[][]) {
  let sent = 0;
  for (const r of to) {
    const res = await sendMessage(bot, r.chatId, html, buttons);
    if (res.ok) sent++;
    else if (res.blocked && bot === 'staff') await db.telegramLink.updateMany({ where: { telegramId: r.chatId }, data: { blockedAt: new Date() } });
    else if (res.blocked && bot === 'client') await db.customer.updateMany({ where: { telegramChatId: r.chatId }, data: { telegramChatId: null } });
  }
  return sent;
}

/** Без падений: уведомление не должно мешать основному действию. */
export function fire(task: () => Promise<unknown>) {
  task().catch((e) => console.error('[notify]', e instanceof Error ? e.message : e));
}

const orderLink = (id: string): Button => ({ text: 'Открыть заказ', app: appUrl(`/tg/rental/order/${id}`) });

async function loadOrder(id: string) {
  return db.rentalOrder.findUnique({ where: { id }, include: { vehicle: true, customer: true } });
}

function orderLines(o: NonNullable<Awaited<ReturnType<typeof loadOrder>>>) {
  const q = json<{ total?: number; deposit?: number }>(o.quoteSnapshot, {});
  return [
    `<b>${esc(o.vehicle.title)}</b> · заказ ${esc(o.number)}`,
    `${fmtDateTime(o.pickupAt)} — ${fmtDateTime(o.returnAt)}`,
    `${esc(o.customer.fullName)}, ${formatPhone(o.customer.phone)}`,
    q.total ? `Сумма ${rub(q.total)}${q.deposit ? `, залог ${rub(q.deposit)}` : ''}` : '',
  ].filter(Boolean).join('\n');
}

// ---------- События ----------

/** Новая заявка на аренду с сайта: менеджерам, с кнопкой «Взять в работу». */
export async function notifyNewRentalRequest(orderId: string) {
  const o = await loadOrder(orderId);
  if (!o || !(await claim(`new-order:${orderId}`))) return;
  const to = await staffWith(['rental.write']);
  await deliver('staff', to, `<b>Новая заявка на аренду</b>\n${orderLines(o)}`, [[{ text: 'Взять в работу', data: `take:${o.id}` }, orderLink(o.id)]]);
}

/** Заявка с сайтов на звонок, покупку, сервис — тем, кто ведёт это направление. */
export async function notifyNewLead(leadId: string) {
  const l = await db.lead.findUnique({ where: { id: leadId } });
  if (!l || l.orderId || !(await claim(`new-lead:${leadId}`))) return;
  const perm: Record<string, Perm> = { rental: 'leads.rental', sales: 'leads.sales', service: 'leads.service' };
  const title: Record<string, string> = { callback: 'Обратный звонок', purchase: 'Покупка автомобиля', custom_order: 'Авто под заказ', service_request: 'Запись в сервис', booking_request: 'Заявка на аренду' };
  const to = await staffWith([perm[l.direction] ?? 'leads.rental']);
  const crm = l.direction === 'rental' ? '/crm/leads' : `/crm/requests/${l.id}`;
  const car = l.carInfo ?? json<{ car?: string }>(l.payload, {}).car;
  await deliver('staff', to, `<b>${esc(title[l.kind] ?? 'Новая заявка')}</b>\n${esc(l.name)}, ${formatPhone(l.phone)}${car ? `\n${esc(car)}` : ''}${l.message ? `\n«${esc(l.message.slice(0, 300))}»` : ''}`, [[{ text: 'Открыть в CRM', url: appUrl(crm) }]]);
}

/** Запрос на удержание из залога — руководителям, с кнопками решения прямо в чате. */
export async function notifyWithholdRequest(requestId: string) {
  const r = await db.withholdRequest.findUnique({ where: { id: requestId } });
  if (!r || !(await claim(`withhold:${requestId}`))) return;
  const o = await loadOrder(r.orderId);
  if (!o) return;
  const by = await db.user.findUnique({ where: { id: r.requestedBy }, select: { fullName: true } });
  const to = await staffWith(['deposit.withhold.approve']);
  await deliver('staff', to, `<b>Запрос на удержание из залога: ${rub(r.amount)}</b>\n${orderLines(o)}\nОснование: ${esc(r.basis)}\nЗапросил: ${esc(by?.fullName ?? '—')}`, [
    [{ text: 'Подтвердить', data: `wh:a:${r.id}` }, { text: 'Отклонить', data: `wh:r:${r.id}` }],
    [orderLink(o.id)],
  ]);
}

// ---------- По расписанию (каждые 5 минут) ----------

const handlers = (o: { handoverId: string | null; assigneeId: string | null }) => [o.handoverId, o.assigneeId].filter(Boolean) as string[];

export async function tick(now = new Date()) {
  const done: string[] = [];

  // Напоминание за 90 минут до выдачи и возврата — сотруднику выдачи и ответственному.
  const soon = addMinutes(now, 90);
  const [pickups, returns] = await Promise.all([
    db.rentalOrder.findMany({ where: { status: 'confirmed', pickupAt: { gt: now, lte: soon } }, include: { vehicle: true, customer: true } }),
    db.rentalOrder.findMany({ where: { status: 'issued', returnAt: { gt: now, lte: soon } }, include: { vehicle: true, customer: true } }),
  ]);
  for (const [list, kind] of [[pickups, 'pickup'], [returns, 'return']] as const) {
    for (const o of list) {
      if (!(await claim(`rem-${kind}:${o.id}`))) continue;
      let to = await staffWith(['rental.inspect', 'rental.write'], handlers(o));
      if (!to.length) to = await staffWith(['rental.write']);
      await deliver('staff', to, `<b>${kind === 'pickup' ? 'Выдача' : 'Возврат'} в ${fmtTime(kind === 'pickup' ? o.pickupAt : o.returnAt)}</b>\n${orderLines(o)}`, [[{ text: kind === 'pickup' ? 'Провести выдачу' : 'Принять возврат', app: appUrl(`/tg/rental/order/${o.id}/inspection?kind=${kind}`) }, orderLink(o.id)]]);
      done.push(`rem-${kind}:${o.number}`);
    }
  }

  // Просроченный возврат (15 минут после срока) — ответственному и руководителям; раз в сутки, пока не вернут.
  const overdue = await db.rentalOrder.findMany({ where: { status: 'issued', returnAt: { lt: addMinutes(now, -15) } }, include: { vehicle: true, customer: true } });
  for (const o of overdue) {
    if (!(await claim(`overdue:${o.id}:${fmtDate(now)}`))) continue;
    const to = [...(await staffWith(['rental.write', 'rental.inspect'], handlers(o))), ...(await staffWith(['deposit.withhold.approve']))];
    const uniq = [...new Map(to.map((r) => [r.chatId, r])).values()];
    const hours = Math.round((now.getTime() - o.returnAt.getTime()) / 3600000);
    await deliver('staff', uniq, `<b>Просрочен возврат${hours ? ` на ${hours} ч` : ''}</b>\n${orderLines(o)}`, [[orderLink(o.id)]]);
    done.push(`overdue:${o.number}`);
  }

  // Документы и ТО: за 14 и за 3 дня — тем, кто ведёт автопарк.
  const in14 = addMinutes(now, 14 * 24 * 60);
  const [docs, service] = await Promise.all([
    db.vehicleDocument.findMany({ where: { validUntil: { gt: now, lte: in14 } }, include: { vehicle: true } }),
    db.vehicle.findMany({ where: { nextServiceAt: { gt: now, lte: in14 } } }),
  ]);
  const fleet = await staffWith(['fleet.write']);
  for (const d of docs) {
    const days = Math.ceil((d.validUntil!.getTime() - now.getTime()) / 86400000);
    const stage = days <= 3 ? 3 : 14;
    if (!(await claim(`doc${stage}:${d.id}:${d.validUntil!.toISOString().slice(0, 10)}`))) continue;
    await deliver('staff', fleet, `<b>${esc(d.title)} истекает ${fmtDate(d.validUntil)}</b>\n${esc(d.vehicle.title)} · осталось ${days} дн.`, [[{ text: 'Открыть машину в CRM', url: appUrl(`/crm/vehicles/${d.vehicleId}`) }]]);
    done.push(`doc:${d.title}`);
  }
  for (const v of service) {
    const days = Math.ceil((v.nextServiceAt!.getTime() - now.getTime()) / 86400000);
    const stage = days <= 3 ? 3 : 14;
    if (!(await claim(`to${stage}:${v.id}:${v.nextServiceAt!.toISOString().slice(0, 10)}`))) continue;
    await deliver('staff', fleet, `<b>ТО ${esc(v.title)} — ${fmtDate(v.nextServiceAt)}</b>\nОсталось ${days} дн.`, [[{ text: 'Открыть машину в CRM', url: appUrl(`/crm/vehicles/${v.id}`) }]]);
    done.push(`to:${v.title}`);
  }

  // Утренняя сводка в 9:00 по Москве.
  const hour = Number(new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, hour: '2-digit', hour12: false }).format(now));
  if (hour >= 9 && hour < 12 && (await claim(`summary:${fmtDate(now)}`))) {
    await morningSummary(now);
    done.push('summary');
  }

  // Клиентам: напоминание за 2 часа до выдачи.
  const clientSoon = await db.rentalOrder.findMany({ where: { status: 'confirmed', pickupAt: { gt: now, lte: addMinutes(now, 120) }, customer: { telegramChatId: { not: null } } }, include: { vehicle: true, customer: true } });
  for (const o of clientSoon) {
    if (!(await claim(`client-rem:${o.id}`))) continue;
    await deliver('client', [{ chatId: o.customer.telegramChatId! }], `Напоминаем: сегодня в <b>${fmtTime(o.pickupAt)}</b> выдача автомобиля <b>${esc(o.vehicle.title)}</b>.\nВозьмите паспорт и водительское удостоверение. Если планы изменились — позвоните нам.`);
    done.push(`client-rem:${o.number}`);
  }
  return done;
}

export async function morningSummary(now = new Date()) {
  const dayStart = startOfLocalDay(now);
  const dayEnd = addMinutes(dayStart, 24 * 60);
  const [pickups, returns, overdue, fresh, active, vehicles, busy] = await Promise.all([
    db.rentalOrder.count({ where: { status: 'confirmed', pickupAt: { gte: dayStart, lt: dayEnd } } }),
    db.rentalOrder.count({ where: { status: 'issued', returnAt: { gte: dayStart, lt: dayEnd } } }),
    db.rentalOrder.count({ where: { status: 'issued', returnAt: { lt: now } } }),
    db.rentalOrder.count({ where: { status: { in: ['new', 'negotiation'] } } }),
    db.rentalOrder.findMany({ where: { status: { in: ['confirmed', 'issued', 'returned'] } }, include: { ledger: { select: { kind: true, amount: true } } } }),
    db.vehicle.count({ where: { condition: 'ready', isPublished: true } }),
    db.occupancy.findMany({ where: { releasedAt: null, kind: { in: ['rental', 'booking'] }, startsAt: { lte: now }, endsAt: { gt: now } }, select: { vehicleId: true } }),
  ]);
  const debt = active.reduce((s, o) => s + Math.max(0, summarize(o.ledger).debt), 0);
  const free = Math.max(0, vehicles - new Set(busy.map((b) => b.vehicleId)).size);
  const text = [
    `<b>Прокат на ${fmtDate(now)}</b>`,
    `Выдач сегодня: ${pickups}`,
    `Возвратов сегодня: ${returns}`,
    overdue ? `Просрочено возвратов: <b>${overdue}</b>` : '',
    fresh ? `Заявок в работе: ${fresh}` : '',
    debt ? `Долги клиентов: ${rub(debt)}` : '',
    `Свободно сейчас: ${free} из ${vehicles} машин`,
  ].filter(Boolean).join('\n');
  await deliver('staff', await staffWith(['rental.read']), text, [[{ text: 'Открыть дела', app: appUrl('/tg/rental') }]]);
}

// ---------- Клиентам ----------

/** Бронь подтверждена — клиенту, если он подключён к клиентскому боту. */
export async function notifyClientConfirmed(orderId: string) {
  const o = await loadOrder(orderId);
  if (!o?.customer.telegramChatId || !(await claim(`client-confirm:${orderId}`))) return;
  const q = json<{ total?: number; deposit?: number; includedKm?: number }>(o.quoteSnapshot, {});
  await deliver('client', [{ chatId: o.customer.telegramChatId }], [
    `<b>Бронь подтверждена</b> · заказ ${esc(o.number)}`,
    `${esc(o.vehicle.title)}`,
    `Выдача: ${fmtDateTime(o.pickupAt)}`,
    `Возврат: ${fmtDateTime(o.returnAt)}`,
    q.total ? `Стоимость: ${rub(q.total)}` : '',
    q.deposit ? `Залог: ${rub(q.deposit)} (возвращается после проверки)` : '',
    q.includedKm ? `Включено: ${q.includedKm} км` : '',
    '',
    'Накануне пришлём напоминание. На выдачу возьмите паспорт и водительское удостоверение.',
  ].filter((x) => x !== '').join('\n'));
}

/** Акт приёма-передачи с фото — клиенту после выдачи или возврата. */
export async function sendClientAct(orderId: string, kind: 'pickup' | 'return') {
  const o = await loadOrder(orderId);
  if (!o?.customer.telegramChatId || !(await claim(`client-act:${kind}:${orderId}`))) return;
  const { buildAct, actFileName } = await import('./act-pdf');
  const pdf = await buildAct(orderId, kind);
  if (!pdf) return;
  const caption = kind === 'pickup' ? `Акт выдачи · заказ ${esc(o.number)}\nПожалуйста, проверьте фото и отметки о повреждениях. Счастливого пути!` : `Акт возврата · заказ ${esc(o.number)}\nСпасибо, что выбрали CRAVE!`;
  const r = await sendFile('client', o.customer.telegramChatId, pdf, actFileName(o.number, kind), 'application/pdf', caption);
  if (!r.ok && r.blocked) await db.customer.update({ where: { id: o.customerId }, data: { telegramChatId: null } });
}


/** Новый аккаунт Telegram просит доступ к приложению — сообщаем владельцам (они подтверждают в CRM). */
export async function notifyAccessRequest(linkId: string) {
  const l = await db.telegramLink.findUnique({ where: { id: linkId } });
  if (!l || l.status !== 'pending' || !(await claim(`tg-access:${linkId}`))) return;
  const owners = await db.user.findMany({ where: { role: 'owner', isActive: true, deletedAt: null }, select: { id: true } });
  const to = (await staffWith(['users.manage'], owners.map((o) => o.id)));
  const name = [l.firstName, l.lastName].filter(Boolean).join(' ') || 'Без имени';
  const text = `<b>Запрос доступа к приложению</b>\n${esc(name)}${l.username ? ` (@${esc(l.username)})` : ''}\nПривяжите аккаунт к сотруднику в CRM.`;
  await deliver('staff', to, text, [[{ text: 'Открыть запросы', url: appUrl('/crm/settings/telegram') }]]);
}

/** Сообщение покупателя с Авито — сотрудникам продаж: новая заявка или новое сообщение в существующей. */
export async function notifyAvitoMessage(leadId: string, chatId: string, buyer: string, item: string | null, text: string, isNew: boolean) {
  const to = await staffWith(['leads.sales']);
  const { avitoChatUrl } = await import('./avito-api');
  await deliver('staff', to, `<b>${isNew ? 'Авито: новая заявка' : 'Авито: новое сообщение'}</b>\n${esc(buyer)}${item ? `\n${esc(item)}` : ''}\n«${esc(text.slice(0, 800))}»`, [[{ text: 'Открыть заявку', url: appUrl(`/crm/requests/${leadId}`) }, { text: 'Чат на Авито', url: avitoChatUrl(chatId) }]]);
}
