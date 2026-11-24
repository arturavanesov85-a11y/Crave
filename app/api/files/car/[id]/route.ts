// Файлы документов автомобиля — только сотрудникам с доступом к автопарку или к «Авто в продаже».
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { STORAGE_DIR } from '@/lib/files';
import { can } from '@/lib/permissions';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response('Нужен вход', { status: 401 });
  const f = await db.carFile.findUnique({ where: { id: (await params).id } });
  if (!f) return new Response('Не найдено', { status: 404 });
  if (!can(user, f.carType === 'vehicle' ? 'fleet.read' : 'sales.catalog')) return new Response('Нет доступа', { status: 403 });
  const file = normalize(join(STORAGE_DIR, f.path));
  if (!file.startsWith(STORAGE_DIR)) return new Response('Нет доступа', { status: 403 });
  try {
    const ext = f.path.split('.').pop();
    const name = /\.[a-z0-9]+$/i.test(f.title) ? f.title : `${f.title}.${ext}`;
    const disp = new URL(req.url).searchParams.has('download') ? 'attachment' : 'inline';
    return new Response(new Uint8Array(await readFile(file)), { headers: { 'Content-Type': f.mime, 'Content-Disposition': `${disp}; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'private, no-store' } });
  } catch {
    return new Response('Файл отсутствует', { status: 404 });
  }
}
