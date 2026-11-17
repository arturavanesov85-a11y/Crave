// Публичные изображения, загружаемые из CRM (фото автомобилей в продаже).
// Хранятся в storage/public и отдаются по адресу /media/... без авторизации.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
// Декодер HEIC/HEIF (фото с iPhone): сборка sharp не умеет HEVC, поэтому такие
// файлы раскрываем отдельно (libheif на WebAssembly) и отдаём sharp готовые пиксели.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const decodeHeic: (o: { buffer: Uint8Array }) => Promise<{ width: number; height: number; data: Uint8ClampedArray }> = require('heic-decode');

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
    if (!ALLOWED.has(f.type) && !/\.(heic|heif)$/i.test(f.name)) throw new Error(`Файл «${f.name}»: допустимы только фотографии (JPEG, PNG, WebP, HEIC)`);
    if (f.size > MAX) throw new Error(`Файл «${f.name}» больше 50 МБ`);
    const name = `${randomBytes(10).toString('hex')}.webp`;
    const buf = await toWebp(Buffer.from(await f.arrayBuffer()), f.name);
    await writeFile(join(dir, name), buf);
    out.push(`/media/${folder}/${name}`);
  }
  return out;
}

const OPTS = { limitInputPixels: 120_000_000, sequentialRead: true };
const shrink = (img: ReturnType<typeof sharp>) => img.resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();

/** Контейнер ISO BMFF (HEIC/HEIF/AVIF): со смещения 4 идёт «ftyp». */
const isHeifContainer = (b: Buffer) => b.length > 12 && b.toString('latin1', 4, 8) === 'ftyp';

/** Открывает фото для sharp: обычные форматы напрямую, HEIC с iPhone — через libheif. */
export async function openImage(input: Buffer, fileName: string): Promise<ReturnType<typeof sharp>> {
  try {
    const img = sharp(input, OPTS).rotate();
    await img.clone().metadata().then((m) => { if (!m.width) throw new Error(); });
    // Метаданные читаются и у HEIC, а пиксели — нет: проверяем декодирование на крошечной копии.
    await img.clone().resize(8).raw().toBuffer();
    return img;
  } catch {
    if (!isHeifContainer(input)) throw new Error(`Файл «${fileName}» не удалось открыть как фотографию`);
    // HEIC: поворот из метаданных libheif применяет сам при декодировании.
    let img: { width: number; height: number; data: Uint8ClampedArray };
    try {
      img = await decodeHeic({ buffer: input });
    } catch {
      throw new Error(`Файл «${fileName}» не удалось открыть как фотографию (HEIC)`);
    }
    return sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), { raw: { width: img.width, height: img.height, channels: 4 } });
  }
}

const toWebp = async (input: Buffer, fileName: string) => shrink(await openImage(input, fileName));

/** JPEG для документов и закрытого хранилища: длинная сторона до maxSide. */
export async function toJpeg(input: Buffer, fileName: string, maxSide = 2000, quality = 85) {
  const img = await openImage(input, fileName);
  return img.resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality }).toBuffer({ resolveWithObject: true });
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
