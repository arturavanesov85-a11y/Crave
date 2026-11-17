// Публичные изображения, загружаемые из CRM (фото автомобилей в продаже).
// Хранятся в storage/public и отдаются по адресу /media/... без авторизации.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';

export const PUBLIC_MEDIA_DIR = join(process.cwd(), 'storage', 'public');
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif']);
const MAX = 50 * 1024 * 1024;

// Сервер небольшой (4 ГБ): обрабатываем по одному фото, без кэша и в один поток,
// чтобы пачка больших снимков не съела всю память.
sharp.cache(false);
sharp.concurrency(1);

/** Сохраняет фото в WebP до 1600 px по ширине. Возвращает публичные адреса /media/... */
export async function savePublicPhotos(files: File[], folder: string): Promise<string[]> {
  const dir = join(PUBLIC_MEDIA_DIR, folder);
  await mkdir(dir, { recursive: true });
  const out: string[] = [];
  for (const f of files) {
    if (!f || typeof f === 'string' || f.size === 0) continue;
    if (!ALLOWED.has(f.type)) throw new Error(`Файл «${f.name}»: допустимы только фотографии (JPEG, PNG, WebP, HEIC)`);
    if (f.size > MAX) throw new Error(`Файл «${f.name}» больше 50 МБ`);
    const name = `${randomBytes(10).toString('hex')}.webp`;
    const buf = await sharp(Buffer.from(await f.arrayBuffer()), { limitInputPixels: 120_000_000, sequentialRead: true }).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    await writeFile(join(dir, name), buf);
    out.push(`/media/${folder}/${name}`);
  }
  return out;
}

/** Удаляет файл, если он лежит в публичном хранилище (фото из public/cars не трогаем). */
export async function removePublicPhoto(url: string) {
  if (!url.startsWith('/media/')) return;
  const file = normalize(join(PUBLIC_MEDIA_DIR, url.slice('/media/'.length)));
  if (!file.startsWith(PUBLIC_MEDIA_DIR)) return;
  await rm(file, { force: true });
}

/** Удаляет папку с фото объявления целиком (после удаления объявления). */
export async function removePublicFolder(folder: string) {
  const dir = normalize(join(PUBLIC_MEDIA_DIR, folder));
  if (!dir.startsWith(PUBLIC_MEDIA_DIR) || dir === PUBLIC_MEDIA_DIR) return;
  await rm(dir, { recursive: true, force: true });
}
