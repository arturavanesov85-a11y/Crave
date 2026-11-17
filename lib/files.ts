// Закрытое файловое хранилище (локальная папка storage/). Файлы отдаются только
// через /api/files/[id] после проверки прав.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export const STORAGE_DIR = join(process.cwd(), 'storage');
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MAX = 15 * 1024 * 1024;

export async function saveImages(files: File[], folder: string) {
  const out: { path: string; mime: string }[] = [];
  const dir = join(STORAGE_DIR, folder);
  await mkdir(dir, { recursive: true });
  for (const f of files) {
    if (!f || typeof f === 'string' || f.size === 0) continue;
    if (!ALLOWED.has(f.type)) throw new Error(`Файл «${f.name}»: допустимы только фотографии (JPEG, PNG, WebP, HEIC)`);
    if (f.size > MAX) throw new Error(`Файл «${f.name}» больше 15 МБ`);
    const ext = f.type.split('/')[1].replace('jpeg', 'jpg');
    const name = `${randomBytes(12).toString('hex')}.${ext}`;
    await writeFile(join(dir, name), Buffer.from(await f.arrayBuffer()));
    out.push({ path: `${folder}/${name}`, mime: f.type });
  }
  return out;
}
