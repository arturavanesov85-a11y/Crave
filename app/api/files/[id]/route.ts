// Фото осмотров отдаются только после проверки прав.
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { can } from '@/lib/permissions';
import { STORAGE_DIR } from '@/lib/files';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response('Нужен вход', { status: 401 });
  const photo = await db.inspectionPhoto.findUnique({ where: { id: (await params).id }, include: { inspection: { include: { order: { select: { handoverId: true } } } } } });
  if (!photo) return new Response('Не найдено', { status: 404 });
  const allowed = can(user, 'rental.read') || (can(user, 'rental.read.assigned') && photo.inspection.order.handoverId === user.id) || can(user, 'fleet.read');
  if (!allowed) return new Response('Нет доступа', { status: 403 });
  const file = normalize(join(STORAGE_DIR, photo.path));
  if (!file.startsWith(STORAGE_DIR)) return new Response('Нет доступа', { status: 403 });
  try {
    const body = await readFile(file);
    return new Response(body, { headers: { 'Content-Type': photo.mime, 'Cache-Control': 'private, max-age=3600' } });
  } catch {
    return new Response('Файл отсутствует', { status: 404 });
  }
}
