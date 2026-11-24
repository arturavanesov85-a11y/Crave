// Закрытое файловое хранилище (локальная папка storage/, фото приводятся к JPEG). Файлы отдаются только
// через /api/files/[id] после проверки прав.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { toJpeg } from './public-media';

export const STORAGE_DIR = join(process.cwd(), 'storage');
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MAX = 50 * 1024 * 1024;

export async function saveImages(files: File[], folder: string) {
  const out: { path: string; mime: string }[] = [];
  const dir = join(STORAGE_DIR, folder);
  await mkdir(dir, { recursive: true });
  for (const f of files) {
    if (!f || typeof f === 'string' || f.size === 0) continue;
    if (!ALLOWED.has(f.type) && !/\.(heic|heif)$/i.test(f.name)) throw new Error(`Файл «${f.name}»: допустимы только фотографии (JPEG, PNG, WebP, HEIC)`);
    if (f.size > MAX) throw new Error(`Файл «${f.name}» больше 50 МБ`);
    // Храним в JPEG до 2000 px: открывается в любом браузере и в PDF, HEIC с iPhone тоже.
    const { data } = await toJpeg(Buffer.from(await f.arrayBuffer()), f.name);
    const name = `${randomBytes(12).toString('hex')}.jpg`;
    await writeFile(join(dir, name), data);
    out.push({ path: `${folder}/${name}`, mime: 'image/jpeg' });
  }
  return out;
}

// Документы автомобиля: фото приводим к JPEG, PDF и офисные файлы храним как есть.
const DOC_EXT: Record<string, string> = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

export async function saveDocs(files: File[], folder: string) {
  const out: { path: string; mime: string; size: number; name: string }[] = [];
  const dir = join(STORAGE_DIR, folder);
  await mkdir(dir, { recursive: true });
  for (const f of files) {
    if (!f || typeof f === 'string' || f.size === 0) continue;
    if (f.size > MAX) throw new Error(`Файл «${f.name}» больше 50 МБ`);
    const ext = (f.name.split('.').pop() ?? '').toLowerCase();
    const id = randomBytes(12).toString('hex');
    if (ALLOWED.has(f.type) || /^(heic|heif|jpe?g|png|webp)$/.test(ext)) {
      const { data } = await toJpeg(Buffer.from(await f.arrayBuffer()), f.name);
      await writeFile(join(dir, `${id}.jpg`), data);
      out.push({ path: `${folder}/${id}.jpg`, mime: 'image/jpeg', size: data.length, name: f.name });
    } else if (DOC_EXT[ext]) {
      const buf = Buffer.from(await f.arrayBuffer());
      await writeFile(join(dir, `${id}.${ext}`), buf);
      out.push({ path: `${folder}/${id}.${ext}`, mime: DOC_EXT[ext], size: buf.length, name: f.name });
    } else throw new Error(`Файл «${f.name}»: можно PDF, фото, Word или Excel`);
  }
  return out;
}
