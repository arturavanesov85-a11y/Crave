// Экспорт журнала операций в CSV — по разрешению «Экспорт».
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseLocal, toLocalInput } from '@/lib/dates';
import { can } from '@/lib/permissions';
import { KIND_LABEL } from '@/lib/ledger';
import { audit } from '@/lib/orders';

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || !can(user, 'export.run')) return new Response('Нет доступа', { status: 403 });
  const u = new URL(req.url);
  const from = parseLocal((u.searchParams.get('from') ?? '2000-01-01') + 'T00:00') ?? new Date(0);
  const toDay = parseLocal((u.searchParams.get('to') ?? '2100-01-01') + 'T00:00') ?? new Date();
  const to = new Date(toDay.getTime() + 86400000);
  const rows = await db.ledgerEntry.findMany({ where: { occurredAt: { gte: from, lt: to } }, include: { order: { select: { number: true } } }, orderBy: { occurredAt: 'asc' } });
  const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = [['Дата', 'Операция', 'Заказ', 'Основание', 'Сумма, ₽', 'Способ', 'Сторно записи'].map(esc).join(';')];
  for (const e of rows) lines.push([toLocalInput(e.occurredAt).replace('T', ' '), KIND_LABEL[e.kind] ?? e.kind, e.order?.number, e.basis, (e.amount / 100).toFixed(2).replace('.', ','), e.method, e.reversesId].map(esc).join(';'));
  await audit(db, user.id, 'export.ledger', 'ledger', '-', { from, to, rows: rows.length });
  return new Response('﻿' + lines.join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="crave-ledger.csv"' } });
}
