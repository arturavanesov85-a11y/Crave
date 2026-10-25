// Публичные фото, загруженные через CRM (storage/public). Только изображения.
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { PUBLIC_MEDIA_DIR } from '@/lib/public-media';

const TYPES: Record<string, string> = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

export async function GET(_: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const parts = (await params).path;
  const file = normalize(join(PUBLIC_MEDIA_DIR, ...parts));
  const type = TYPES[extname(file).toLowerCase()];
  if (!file.startsWith(PUBLIC_MEDIA_DIR) || !type) return new Response('Не найдено', { status: 404 });
  try {
    return new Response(await readFile(file), { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' } });
  } catch {
    return new Response('Не найдено', { status: 404 });
  }
}
