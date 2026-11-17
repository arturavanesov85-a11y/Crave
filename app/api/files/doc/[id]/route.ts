// Фото документов клиента (паспорт, права) — только с правом «Документы клиентов».
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { STORAGE_DIR } from '@/lib/files';
import { can } from '@/lib/permissions';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response('Нужен вход', { status: 401 });
  if (!can(user, 'customer.docs.view')) return new Response('Нет доступа', { status: 403 });
  const doc = await db.customerDocument.findUnique({ where: { id: (await params).id } });
  if (!doc) return new Response('Не найдено', { status: 404 });
  const file = normalize(join(STORAGE_DIR, doc.path));
  if (!file.startsWith(STORAGE_DIR)) return new Response('Нет доступа', { status: 403 });
  try {
    return new Response(new Uint8Array(await readFile(file)), { headers: { 'Content-Type': doc.mime, 'Cache-Control': 'private, no-store' } });
  } catch {
    return new Response('Файл отсутствует', { status: 404 });
  }
}
