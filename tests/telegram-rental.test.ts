// Прокат в Telegram: права разделов, акт приёма-передачи, напоминания без повторов, кнопки в чате.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { addMinutes } from '@/lib/dates';
import { STORAGE_DIR } from '@/lib/files';
import { buildAct } from '@/lib/act-pdf';
import { tick } from '@/lib/notify';
import { confirmOrder, createCrmOrder, issueOrder } from '@/lib/orders';
import { decideWithhold } from '@/lib/rental-ops';
import { can, type Perm, type SessionUser } from '@/lib/permissions';
import { POST as webhook } from '@/app/api/tg/webhook/route';

const u = (role: string) => ({ id: 'x', email: 'x', fullName: 'x', role });
let manager: SessionUser;
let head: SessionUser;
let vehicles: { id: string }[];
const tmpDirs: string[] = [];
afterAll(async () => { for (const d of tmpDirs) await rm(d, { recursive: true, force: true }); });
const client = (i: number) => ({ name: `Тест ТГ ${i}`, phone: `7999200${String(i).padStart(4, '0')}`, services: [] });

beforeAll(async () => {
  const m = await db.user.findUniqueOrThrow({ where: { email: 'manager@crave.test' } });
  const h = await db.user.findUniqueOrThrow({ where: { email: 'head@crave.test' } });
  manager = { id: m.id, email: m.email, fullName: m.fullName, role: m.role };
  head = { id: h.id, email: h.email, fullName: h.fullName, role: h.role };
  vehicles = await db.vehicle.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true } });
});

describe('разделы мини-приложения', () => {
  const cases: [string, Perm, boolean][] = [
    ['handover', 'tg.rental', true],
    ['rental_manager', 'tg.rental', true],
    ['rental_manager', 'tg.app', false],
    ['sales_staff', 'tg.app', true],
    ['sales_staff', 'tg.rental', false],
    ['sales_staff', 'tg.drafts', false],
    ['sales_head', 'tg.drafts', true],
    ['sales_head', 'finance.view', false],
    ['owner', 'tg.drafts', true],
  ];
  it.each(cases)('%s → %s = %s', (role, perm, expected) => expect(can(u(role), perm)).toBe(expected));
});

describe('прокат в Telegram', () => {
  it('акт выдачи с фото повреждения собирается в PDF', async () => {
    const o = await createCrmOrder(manager, { vehicleId: vehicles[5].id, pickupAt: addMinutes(new Date(), 60 * 24 * 40), returnAt: addMinutes(new Date(), 60 * 24 * 42), ...client(1) });
    await confirmOrder(manager, o.id);
    const dir = join(STORAGE_DIR, 'inspections', o.id);
    await mkdir(dir, { recursive: true });
    tmpDirs.push(dir);
    const img = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#335577' } }).jpeg().toBuffer();
    await writeFile(join(dir, 'a.jpg'), img);
    await writeFile(join(dir, 'b.jpg'), img);
    await issueOrder(manager, o.id, {
      mileageKm: 12000, fuelPercent: 90, checklist: { docs: true, keys: true }, notes: 'Тест', damages: [{ location: 'Передний бампер', description: 'скол' }],
      photos: [{ path: `inspections/${o.id}/a.jpg`, mime: 'image/jpeg' }, { path: `inspections/${o.id}/b.jpg`, mime: 'image/jpeg', caption: 'Передний бампер — скол' }],
    });
    const pdf = await buildAct(o.id, 'pickup');
    expect(pdf).not.toBeNull();
    expect(pdf!.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf!.length).toBeGreaterThan(10_000);
    expect(await buildAct(o.id, 'return')).toBeNull(); // возврата ещё не было
  });

  it('напоминание о выдаче отправляется один раз', async () => {
    const o = await createCrmOrder(manager, { vehicleId: vehicles[6].id, pickupAt: addMinutes(new Date(), 60), returnAt: addMinutes(new Date(), 60 * 24 * 2), ...client(2) });
    await confirmOrder(manager, o.id);
    const first = await tick();
    expect(first.some((k) => k.startsWith('rem-pickup:'))).toBe(true);
    expect(await db.notification.findUnique({ where: { key: `rem-pickup:${o.id}` } })).not.toBeNull();
    const second = await tick();
    expect(second.some((k) => k.startsWith('rem-pickup:'))).toBe(false);
  });

  it('удержание нельзя рассмотреть дважды', async () => {
    const o = await db.rentalOrder.findFirstOrThrow({ where: { customer: { phone: client(1).phone } } });
    const r = await db.withholdRequest.create({ data: { orderId: o.id, amount: 100, basis: 'тест', requestedBy: manager.id } });
    await decideWithhold(head, r.id, false);
    await expect(decideWithhold(head, r.id, true)).rejects.toThrow(/уже рассмотрен/);
  });

  it('кнопка «Взять в работу» в чате берёт заявку от имени привязанного сотрудника', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
    const o = await createCrmOrder(manager, { vehicleId: vehicles[4].id, pickupAt: addMinutes(new Date(), 60 * 24 * 50), returnAt: addMinutes(new Date(), 60 * 24 * 51), ...client(3) });
    await db.rentalOrder.update({ where: { id: o.id }, data: { status: 'new', assigneeId: null } });
    await db.telegramLink.create({ data: { telegramId: '555001', status: 'approved', userId: manager.id } });
    const body = (data: string) => JSON.stringify({ callback_query: { id: 'cb1', from: { id: 555001 }, data, message: { chat: { id: 555001 }, message_id: 1, text: 'Новая заявка' } } });

    const denied = await webhook(new Request('http://x/api/tg/webhook', { method: 'POST', body: body(`take:${o.id}`) }));
    expect(denied.status).toBe(403);
    const ok = await webhook(new Request('http://x/api/tg/webhook', { method: 'POST', body: body(`take:${o.id}`), headers: { 'x-telegram-bot-api-secret-token': 'test-secret' } }));
    expect(ok.status).toBe(200);
    const after = await db.rentalOrder.findUniqueOrThrow({ where: { id: o.id } });
    expect(after.status).toBe('negotiation');
    expect(after.assigneeId).toBe(manager.id);
  });
});
