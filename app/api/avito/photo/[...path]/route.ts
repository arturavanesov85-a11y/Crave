// Фото для Авито в JPEG: на сайте они хранятся в WebP, а Авито надёжно принимает JPEG.
// /api/avito/photo/cars/x/00.jpg → public/cars/x/00.webp; /api/avito/photo/media/... → storage/public/...
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import sharp from 'sharp';
import { PUBLIC_MEDIA_DIR } from '@/lib/public-media';

export async function GET(_: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const parts = (await params).path;
  if (!parts.length || parts.some((p) => p === '..' || p.includes('\\')) || !['cars', 'media'].includes(parts[0])) return new Response('Не найдено', { status: 404 });
  const rel = parts.join('/').replace(/\.jpg$/i, '');
  const root = parts[0] === 'media' ? PUBLIC_MEDIA_DIR : join(process.cwd(), 'public', 'cars');
  const inner = parts[0] === 'media' ? rel.slice('media/'.length) : rel.slice('cars/'.length);
  for (const ext of ['.webp', '.jpg', '.jpeg', '.png']) {
    const file = normalize(join(root, inner + ext));
    if (!file.startsWith(root)) break;
    const buf = await readFile(file).catch(() => null);
    if (!buf) continue;
    const jpg = await sharp(buf).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer();
    return new Response(new Uint8Array(jpg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' } });
  }
  return new Response('Не найдено', { status: 404 });
}
