'use server';

// Действия рабочих зон «Продажи» и «Сервис».
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseLocal } from '@/lib/dates';
import { parseRub, rub } from '@/lib/money';
import { can, Forbidden, type SessionUser } from '@/lib/permissions';
import { audit, normalizePhone, upsertCustomer } from '@/lib/orders';
import { stageOf, statusForStage, STAGES, WS, type WsDirection } from '@/lib/workspace';

export type ActionState = { error?: string; ok?: string } | undefined;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

async function guard(direction: WsDirection): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new Forbidden('Сессия истекла — войдите снова');
  if (!can(u, WS[direction].perm)) throw new Forbidden();
  return u;
}

async function loadLead(id: string) {
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead || (lead.direction !== 'sales' && lead.direction !== 'service')) throw new Error('Заявка не найдена');
  return { lead, direction: lead.direction as WsDirection };
}

async function run(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const ok = await fn();
    revalidatePath('/crm', 'layout');
    return { ok: ok || 'Сохранено' };
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e && String((e as { digest: string }).digest).startsWith('NEXT_REDIRECT')) throw e;
    return { error: e instanceof Error ? e.message : 'Не удалось выполнить действие' };
  }
}

const dt = (v: string) => (v ? parseLocal(v) : null);

export async function requestCreateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = '';
  const res = await run(async () => {
    const direction = str(fd, 'direction') === 'service' ? 'service' : 'sales';
    const user = await guard(direction);
    const name = str(fd, 'name');
    if (name.length < 2) throw new Error('Укажите имя клиента');
    const phone = normalizePhone(str(fd, 'phone'));
    if (!phone) throw new Error('Проверьте телефон');
    const lead = await db.$transaction(async (tx) => {
      const customer = await upsertCustomer(tx, { name, phone }, direction);
      const l = await tx.lead.create({
        data: {
          direction, site: 'crm', channel: 'crm', kind: 'manual', name, phone,
          message: str(fd, 'message') || null, carInfo: str(fd, 'carInfo') || null,
          customerId: customer.id, assigneeId: user.id, stage: 'new', status: 'new',
        },
      });
      await tx.leadNote.create({ data: { leadId: l.id, authorId: user.id, kind: 'system', text: 'Заявка создана в CRM' } });
      return l;
    });
    await audit(db, user.id, 'request.create', 'lead', lead.id, { direction });
    id = lead.id;
  });
  if (res?.error) return res;
  redirect(`/crm/requests/${id}`);
}

export async function requestStageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { lead, direction } = await loadLead(str(fd, 'id'));
    const user = await guard(direction);
    const code = str(fd, 'stage');
    if (!STAGES[direction].some((s) => s.code === code)) throw new Error('Неизвестный этап');
    if (code === lead.stage) return 'Этап не изменился';
    const s = stageOf(direction, code);
    const reason = str(fd, 'reason');
    if (s.closed === 'lost' && reason.length < 3) throw new Error('Укажите причину отказа');
    if (direction === 'service' && code === 'booked' && !lead.appointmentAt && !str(fd, 'appointmentAt')) throw new Error('Укажите время записи');
    const appointmentAt = dt(str(fd, 'appointmentAt'));
    await db.lead.update({
      where: { id: lead.id },
      data: {
        stage: code,
        status: statusForStage(direction, code),
        assigneeId: lead.assigneeId ?? user.id,
        closedAt: s.closed ? new Date() : null,
        lostReason: s.closed === 'lost' ? reason : null,
        ...(appointmentAt ? { appointmentAt } : {}),
      },
    });
    await db.leadNote.create({ data: { leadId: lead.id, authorId: user.id, kind: 'stage', text: `Этап: ${stageOf(direction, lead.stage).label} → ${s.label}${reason ? `. ${reason}` : ''}` } });
    return `Этап: ${s.label}`;
  });
}

export async function requestUpdateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { lead, direction } = await loadLead(str(fd, 'id'));
    const user = await guard(direction);
    const amountRaw = str(fd, 'amount');
    const amount = amountRaw ? parseRub(amountRaw) : null;
    if (amountRaw && amount == null) throw new Error('Сумма — только цифры, в рублях');
    const saleCarId = direction === 'sales' ? str(fd, 'saleCarId') || null : null;
    if (saleCarId && !(await db.saleCar.findUnique({ where: { id: saleCarId } }))) throw new Error('Автомобиль не найден');
    const nextActionAt = dt(str(fd, 'nextActionAt'));
    const data = {
      assigneeId: str(fd, 'assigneeId') || null,
      nextActionAt,
      nextAction: str(fd, 'nextAction') || null,
      carInfo: str(fd, 'carInfo') || null,
      amount,
      saleCarId,
      appointmentAt: direction === 'service' ? dt(str(fd, 'appointmentAt')) : lead.appointmentAt,
    };
    await db.lead.update({ where: { id: lead.id }, data });
    const changes: string[] = [];
    if (data.assigneeId !== lead.assigneeId) {
      const who = data.assigneeId ? (await db.user.findUnique({ where: { id: data.assigneeId } }))?.fullName : 'не назначен';
      changes.push(`ответственный: ${who}`);
    }
    if (+(data.nextActionAt ?? 0) !== +(lead.nextActionAt ?? 0) || data.nextAction !== lead.nextAction) changes.push(`следующее действие: ${data.nextAction ?? '—'}`);
    if (direction === 'service' && +(data.appointmentAt ?? 0) !== +(lead.appointmentAt ?? 0)) changes.push('время записи изменено');
    if (data.amount !== lead.amount) changes.push(`${WS[direction].amountLabel.toLowerCase()}: ${rub(data.amount)}`);
    if (changes.length) await db.leadNote.create({ data: { leadId: lead.id, authorId: user.id, kind: 'system', text: changes.join('; ') } });
    return 'Сохранено';
  });
}

export async function requestNoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { lead, direction } = await loadLead(str(fd, 'id'));
    const user = await guard(direction);
    const text = str(fd, 'text').slice(0, 2000);
    if (!text) throw new Error('Пустой комментарий');
    await db.leadNote.create({ data: { leadId: lead.id, authorId: user.id, kind: 'comment', text } });
    return 'Добавлено';
  });
}

/** Ответ покупателю в чат Авито прямо из заявки. */
export async function avitoReplyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { lead, direction } = await loadLead(str(fd, 'id'));
    const user = await guard(direction);
    const text = str(fd, 'text').slice(0, 3000);
    if (!text) throw new Error('Пустое сообщение');
    const { leadAvitoChat, sendAvitoMessage } = await import('@/lib/avito-api');
    const chatId = (JSON.parse(lead.payload || '{}') as { avitoChatId?: string }).avitoChatId;
    if (!chatId || !leadAvitoChat(lead.payload)) throw new Error('Заявка не из Авито');
    await sendAvitoMessage(chatId, text);
    await db.leadNote.create({ data: { leadId: lead.id, authorId: user.id, kind: 'comment', text: `Ответ в Авито: ${text}` } });
    return 'Отправлено в чат Авито';
  });
}
